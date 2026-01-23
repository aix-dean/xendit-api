const logger = require('../../shared/utils/logger');
const firestoreService = require('../../shared/services/firestoreService');

// In-memory storage for webhook data (replace with database in production)
const webhookStore = new Map();
const processedWebhooks = new Set(); // For idempotency

class WebhookService {
  // Process payment webhook events
  async processWebhook(webhookData, req) {
    const { event, business_id, created, data } = webhookData;
    // Generate webhook ID - use payment_id/capture_id (id) if available, otherwise use payment_request_id or reference_id
    const identifier = data.payment_id || data.id || data.payment_request_id || data.reference_id;
    const webhookId = req.headers['webhook-id'] || `${event}-${identifier}-${created}`;

    // Check for duplicate webhooks (idempotency)
    if (processedWebhooks.has(webhookId)) {
      logger.info('Duplicate webhook ignored', { webhookId, event });
      return { processed: false, duplicate: true, webhookId };
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
      case 'capture.succeeded':
        await this.handleCaptureSucceeded(data);
        break;
      case 'payment.authorization':
        await this.handlePaymentAuthorization(data);
        break;
      case 'payment.failure':
      case 'payment.failed':
        await this.handlePaymentFailure(data);
        break;
      case 'payment_request.expiry':
        await this.handlePaymentRequestExpiry(data);
        break;
      case 'payment_request.succeeded':
        await this.handlePaymentRequestSucceeded(data);
        break;
      case 'payment_request.failed':
        await this.handlePaymentRequestFailed(data);
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

  // Handle capture succeeded events
  async handleCaptureSucceeded(captureData) {
    const { id: capture_id, payment_request_id, reference_id, status, authorized_amount, captured_amount, currency } = captureData;

    logger.info('Processing capture succeeded', {
      captureId: capture_id,
      referenceId: reference_id,
      paymentRequestId: payment_request_id,
      status,
      authorizedAmount: authorized_amount,
      capturedAmount: captured_amount,
      currency
    });

    try {
      // Map capture data to payment data format for updateBookingTransactionStatus
      const paymentData = {
        payment_id: capture_id, // Use capture_id as payment_id
        reference_id: reference_id,
        payment_request_id: payment_request_id,
        status: status,
        amount: captured_amount || authorized_amount,
        currency: currency
      };

      // Update booking directly using reference_id as document ID
      const updateResult = await firestoreService.updateBookingTransactionStatus(reference_id, status, paymentData);

      if (updateResult.success) {
        logger.info('Booking updated successfully from capture', {
          bookingId: reference_id,
          captureId: capture_id,
          referenceId: reference_id,
          status
        });
      } else {
        logger.warn('Booking update skipped for capture', {
          bookingId: reference_id,
          captureId: capture_id,
          referenceId: reference_id,
          status,
          reason: updateResult.reason
        });
      }

      // Create payment log for audit trail
      await firestoreService.createPaymentLog({
        ...captureData,
        event: 'capture.succeeded',
        bookingId: reference_id,
        capture_id: capture_id
      });

    } catch (error) {
      logger.error('Error processing capture succeeded', {
        captureId: capture_id,
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

  // Handle payment request expiry events
  async handlePaymentRequestExpiry(paymentRequestData) {
    const { payment_request_id, reference_id, status } = paymentRequestData;

    logger.info('Processing payment request expiry', {
      paymentRequestId: payment_request_id,
      referenceId: reference_id,
      status
    });

    try {
      // Update booking transaction status to expired
      if (reference_id) {
        const updateResult = await firestoreService.updateBookingTransactionStatus(
          reference_id,
          status,
          paymentRequestData
        );

        if (updateResult.success) {
          logger.info('Booking updated with expiry status', {
            bookingId: reference_id,
            paymentRequestId: payment_request_id,
            status
          });
        }
      }

      // Create payment log for audit trail
      await firestoreService.createPaymentLog({
        ...paymentRequestData,
        event: 'payment_request.expiry',
        bookingId: reference_id
      });

    } catch (error) {
      logger.error('Error processing payment request expiry', {
        paymentRequestId: payment_request_id,
        referenceId: reference_id,
        error: error.message
      });
      throw error;
    }
  }

  // Handle payment request succeeded events
  async handlePaymentRequestSucceeded(paymentRequestData) {
    const { payment_request_id, reference_id, status } = paymentRequestData;

    logger.info('Processing payment request succeeded', {
      paymentRequestId: payment_request_id,
      referenceId: reference_id,
      status
    });

    // Payment request succeeded typically means a payment was created
    // This might trigger a payment webhook separately, so we may just log it
    try {
      await firestoreService.createPaymentLog({
        ...paymentRequestData,
        event: 'payment_request.succeeded',
        bookingId: reference_id
      });
    } catch (error) {
      logger.error('Error processing payment request succeeded', {
        paymentRequestId: payment_request_id,
        referenceId: reference_id,
        error: error.message
      });
      throw error;
    }
  }

  // Handle payment request failed events
  async handlePaymentRequestFailed(paymentRequestData) {
    const { payment_request_id, reference_id, status, failure_code } = paymentRequestData;

    logger.error('Processing payment request failed', {
      paymentRequestId: payment_request_id,
      referenceId: reference_id,
      status,
      failureCode: failure_code
    });

    try {
      // Update booking transaction status
      if (reference_id) {
        const updateResult = await firestoreService.updateBookingTransactionStatus(
          reference_id,
          status,
          paymentRequestData
        );

        if (updateResult.success) {
          logger.info('Booking updated with payment request failure status', {
            bookingId: reference_id,
            paymentRequestId: payment_request_id,
            status,
            failureCode: failure_code
          });
        }
      }

      // Create payment log for audit trail
      await firestoreService.createPaymentLog({
        ...paymentRequestData,
        event: 'payment_request.failed',
        bookingId: reference_id
      });

    } catch (error) {
      logger.error('Error processing payment request failed', {
        paymentRequestId: payment_request_id,
        referenceId: reference_id,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new WebhookService();