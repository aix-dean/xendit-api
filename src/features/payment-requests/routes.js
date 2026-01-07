const express = require('express');
const router = express.Router();
const xenditClient = require('../../shared/services/xenditClient');
const { validate, validateParams } = require('../../shared/middleware/validation');
const {
  createPaymentRequestSchema,
  cancelPaymentRequestSchema,
  simulatePaymentRequestSchema
} = require('../../shared/validation/schemas');
const logger = require('../../shared/utils/logger');

// Parameter validation schemas
const paymentRequestIdSchema = require('joi').object({
  paymentRequestId: require('joi').string().min(39).max(39).required()
});

// Create payment request
router.post('/', validate(createPaymentRequestSchema), async (req, res, next) => {
  try {
    logger.info('Creating payment request', { referenceId: req.body.reference_id });

    const result = await xenditClient.createPaymentRequest(req.body);

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    // If it's an axios error with response data, return the Xendit error details
    if (error.response && error.response.data) {
      logger.error('Xendit API error details', {
        status: error.response.status,
        data: error.response.data
      });
      return res.status(error.response.status).json({
        success: false,
        error: error.response.data
      });
    }
    next(error);
  }
});

// Get payment request status
router.get('/:paymentRequestId', validateParams(paymentRequestIdSchema), async (req, res, next) => {
  try {
    const { paymentRequestId } = req.params;

    logger.info('Getting payment request status', { paymentRequestId });

    const result = await xenditClient.getPaymentRequest(paymentRequestId);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// Cancel payment request
router.post('/:paymentRequestId/cancel', validateParams(paymentRequestIdSchema), validate(cancelPaymentRequestSchema), async (req, res, next) => {
  try {
    const { paymentRequestId } = req.params;

    logger.info('Cancelling payment request', { paymentRequestId });

    const result = await xenditClient.cancelPaymentRequest(paymentRequestId);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// Simulate payment request (test mode)
router.post('/:paymentRequestId/simulate', validateParams(paymentRequestIdSchema), validate(simulatePaymentRequestSchema), async (req, res, next) => {
  try {
    const { paymentRequestId } = req.params;

    logger.info('Simulating payment request', { paymentRequestId, amount: req.body.amount });

    const result = await xenditClient.simulatePaymentRequest(paymentRequestId, req.body);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;