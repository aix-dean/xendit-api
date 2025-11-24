const express = require('express');
const router = express.Router();
const xenditClient = require('../services/xenditClient');
const { validate, validateParams } = require('../middleware/validation');
const { capturePaymentSchema } = require('../validation/schemas');
const logger = require('../utils/logger');

// Parameter validation schemas
const paymentIdSchema = require('joi').object({
  paymentId: require('joi').string().min(39).max(39).required()
});

// Get payment status
router.get('/:paymentId', validateParams(paymentIdSchema), async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    logger.info('Getting payment status', { paymentId });

    const result = await xenditClient.getPayment(paymentId);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// Cancel payment
router.post('/:paymentId/cancel', validateParams(paymentIdSchema), async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    logger.info('Cancelling payment', { paymentId });

    const result = await xenditClient.cancelPayment(paymentId);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// Capture payment
router.post('/:paymentId/capture', validateParams(paymentIdSchema), validate(capturePaymentSchema), async (req, res, next) => {
  try {
    const { paymentId } = req.params;

    logger.info('Capturing payment', { paymentId, captureAmount: req.body.capture_amount });

    const result = await xenditClient.capturePayment(paymentId, req.body);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;