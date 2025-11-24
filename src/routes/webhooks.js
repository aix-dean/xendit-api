const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validation');
const { webhookSchema } = require('../validation/schemas');
const logger = require('../utils/logger');
const firestoreService = require('../services/firestoreService');

// In-memory storage for webhook data (replace with database in production)
const webhookStore = new Map();
const processedWebhooks = new Set(); // For idempotency

// Webhook verification middleware
const verifyWebhook = (req, res, next) => {
  const callbackToken = req.headers['x-callback-token'];
  const expectedToken = process.env.WEBHOOK_CALLBACK_TOKEN;

  if (!expectedToken) {
    logger.warn('Webhook callback token not configured');
    return res.status(500).json({
      error: {
        code: 'CONFIGURATION_ERROR',
        message: 'Webhook verification not configured'
      }
    });
  }

  if (!callbackToken || callbackToken !== expectedToken) {
    logger.warn('Invalid webhook callback token', {
      receivedToken: callbackToken ? 'present' : 'missing',
      expectedToken: expectedToken ? 'configured' : 'missing'
    });
    return res.status(401).json({
      error: {
        code: 'INVALID_WEBHOOK_TOKEN',
        message: 'Invalid webhook callback token'
      }
    });
  }

  next();
};

// Process payment webhook events
const processPaymentWebhook = async (webhookData) => {
  const { event, business_id, created, data } = webhookData;
  const webhookId = req.headers['webhook-id'] || `${event}-${data.payment_id}-${created}`;

  // Check for duplicate webhooks (idempotency)
  if (processedWebhooks.has(webhookId)) {
    logger.info('Duplicate webhook ignored', { webhookId, event });
    return { processed: false, duplicate: true };
  }

  // Mark as processed
  processedWebhooks.add(webhookId);

  // Store webhook data
  const webhookRecord = {
    id: webhookId,
    event,
    business_id,
    created,
    data,
    receivedAt: new Date().toISOString(),
    processedAt: new Date().toISOString()
  };

  webhookStore.set(webhookId, webhookRecord);

  // Process based on event type
  switch (event) {
    case 'payment.capture':
      await handlePaymentCapture(data);
      break;
    case 'payment.authorization':
      await handlePaymentAuthorization(data);
      break;
    case 'payment.failure':
      await handlePaymentFailure(data);
      break;
    default:
      logger.warn('Unknown webhook event', { event, webhookId });
  }

  return { processed: true, webhookId };
};

// Handle payment capture events
const handlePaymentCapture = async (paymentData) => {
  const { payment_id, reference_id, payment_request_id, status, amount, currency } = paymentData;

  logger.info('Processing payment capture', {
    paymentId: payment_id,
    referenceId: reference_id,
    paymentRequestId: payment_request_id,
    status,
    amount,
    currency
  });

  try {
    // Update booking directly using reference_id as document ID
    const updateResult = await firestoreService.updateBookingTransactionStatus(reference_id, status, paymentData);

    if (updateResult.success) {
      logger.info('Booking updated successfully', {
        bookingId: reference_id,
        paymentId: payment_id,
        referenceId: reference_id,
        status
      });
    } else {
      logger.warn('Booking update skipped', {
        bookingId: reference_id,
        paymentId: payment_id,
        referenceId: reference_id,
        status,
        reason: updateResult.reason
      });
    }

    // TODO: Additional business logic
    // - Send confirmation email/SMS to customer
    // - Trigger fulfillment process
    // - Update inventory
    // - Send notifications to relevant systems

    // Create payment log for audit trail
    await firestoreService.createPaymentLog({
      ...paymentData,
      event: 'payment.capture',
      bookingId: reference_id
    });

  } catch (error) {
    logger.error('Error processing payment capture', {
      paymentId: payment_id,
      referenceId: reference_id,
      error: error.message
    });
    throw error;
  }
};

// Handle payment authorization events
const handlePaymentAuthorization = async (paymentData) => {
  const { payment_id, payment_request_id, status, amount } = paymentData;

  logger.info('Processing payment authorization', {
    paymentId: payment_id,
    paymentRequestId: payment_request_id,
    status,
    amount
  });

  // Authorization means payment is approved but not yet captured
  // You might want to reserve inventory or prepare for fulfillment
};

// Handle payment failure events
const handlePaymentFailure = async (paymentData) => {
  const { payment_id, reference_id, payment_request_id, status, failure_code, amount } = paymentData;

  logger.error('Processing payment failure', {
    paymentId: payment_id,
    referenceId: reference_id,
    paymentRequestId: payment_request_id,
    status,
    failureCode: failure_code,
    amount
  });

  try {
    // Update booking directly using reference_id as document ID
    const updateResult = await firestoreService.updateBookingTransactionStatus(reference_id, status, paymentData);

    if (updateResult.success) {
      logger.info('Booking updated with failure status', {
        bookingId: reference_id,
        paymentId: payment_id,
        referenceId: reference_id,
        status,
        failureCode: failure_code
      });
    } else {
      logger.warn('Booking update skipped for failure', {
        bookingId: reference_id,
        paymentId: payment_id,
        referenceId: reference_id,
        status,
        failureCode: failure_code,
        reason: updateResult.reason
      });
    }

    // TODO: Additional failure handling logic
    // - Send failure notification to customer
    // - Log failure reason for analysis
    // - Potentially trigger retry logic
    // - Update booking status to allow re-payment

    // Create payment log for audit trail
    await firestoreService.createPaymentLog({
      ...paymentData,
      event: 'payment.failure',
      bookingId: reference_id
    });

  } catch (error) {
    logger.error('Error processing payment failure', {
      paymentId: payment_id,
      referenceId: reference_id,
      error: error.message
    });
    throw error;
  }
};

// Get stored webhooks (for debugging/admin purposes)
router.get('/', (req, res) => {
  const webhooks = Array.from(webhookStore.values()).sort(
    (a, b) => new Date(b.receivedAt) - new Date(a.receivedAt)
  );

  res.json({
    success: true,
    data: {
      webhooks,
      total: webhooks.length
    }
  });
});

// Get specific webhook by ID
router.get('/:webhookId', (req, res) => {
  const { webhookId } = req.params;
  const webhook = webhookStore.get(webhookId);

  if (!webhook) {
    return res.status(404).json({
      error: {
        code: 'WEBHOOK_NOT_FOUND',
        message: 'Webhook not found'
      }
    });
  }

  res.json({
    success: true,
    data: webhook
  });
});

// Main webhook endpoint
router.post('/', verifyWebhook, validate(webhookSchema), async (req, res, next) => {
  try {
    const { event, business_id, created, data } = req.body;
    const webhookId = req.headers['webhook-id'] || `${event}-${data.payment_id}-${created}`;

    logger.info('Received webhook', {
      webhookId,
      event,
      businessId: business_id,
      created,
      paymentId: data.payment_id,
      paymentRequestId: data.payment_request_id,
      status: data.status,
      amount: data.amount,
      currency: data.currency
    });

    // Process the webhook
    const result = await processPaymentWebhook(req.body);

    if (result.duplicate) {
      // Still return success for duplicate webhooks (idempotency)
      return res.status(200).json({
        success: true,
        message: 'Webhook already processed',
        webhookId: result.webhookId
      });
    }

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      webhookId: result.webhookId,
      event,
      status: data.status
    });

  } catch (error) {
    logger.error('Webhook processing error', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
    next(error);
  }
});

module.exports = router;