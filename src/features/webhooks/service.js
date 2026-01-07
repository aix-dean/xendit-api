const logger = require('../../shared/utils/logger');
const firestoreService = require('../../shared/services/firestoreService');

// In-memory storage for webhook data (replace with database in production)
const webhookStore = new Map();
const processedWebhooks = new Set(); // For idempotency

class WebhookService {
  // Process payment webhook events
  async processWebhook(webhookData, req) {
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
      case 'payment.succeeded':
        await this.handlePaymentCapture(data);
        break;
      case 'payment.authorization':
        await this.handlePaymentAuthorization(data);
        break;
      case 'payment.failure':
      case 'payment.failed':
        await this.handlePaymentFailure(data);
        break;
      default:
        logger.warn('Unknown webhook event', { event, webhookId });
    }

    return { processed: true, webhookId };
  }

  // Handle payment capture events
  async handlePaymentCapture(paymentData) {
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
  }

  // Handle payment authorization events
  async handlePaymentAuthorization(paymentData) {
    const { payment_id, payment_request_id, status, amount } = paymentData;

    logger.info('Processing payment authorization', {
      paymentId: payment_id,
      paymentRequestId: payment_request_id,
      status,
      amount
    });

    // Authorization means payment is approved but not yet captured
    // You might want to reserve inventory or prepare for fulfillment
  }

  // Handle payment failure events
  async handlePaymentFailure(paymentData) {
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
  }
}

module.exports = new WebhookService();