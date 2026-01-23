const express = require('express');
const router = express.Router();
const { validate } = require('../../shared/middleware/validation');
const { webhookSchema } = require('../../shared/validation/schemas');
const logger = require('../../shared/utils/logger');
const service = require('./service');

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
    // Generate webhook ID - use payment_id/capture_id (id) if available, otherwise use payment_request_id or reference_id
    const identifier = data.payment_id || data.id || data.payment_request_id || data.reference_id;
    const webhookId = req.headers['webhook-id'] || `${event}-${identifier}-${created}`;

    logger.info('Received webhook', {
      webhookId,
      event,
      businessId: business_id,
      created,
      paymentId: data.payment_id,
      captureId: data.id,
      paymentRequestId: data.payment_request_id,
      referenceId: data.reference_id,
      status: data.status,
      amount: data.amount || data.captured_amount || data.request_amount,
      currency: data.currency
    });

    // Process the webhook
    const result = await service.processWebhook(req.body, req);

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
      status: data.status,
      referenceId: data.reference_id
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