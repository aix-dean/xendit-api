const express = require('express');
const router = express.Router();
const xenditClient = require('../../shared/services/xenditClient');
const { validate, validateParams, validateQuery } = require('../../shared/middleware/validation');
const { createInvoiceSchema, listInvoicesSchema } = require('../../shared/validation/schemas');
const logger = require('../../shared/utils/logger');

// Parameter validation schemas
const invoiceIdSchema = require('joi').object({
  invoiceId: require('joi').string().required()
});

// Create invoice
router.post('/', validate(createInvoiceSchema), async (req, res, next) => {
  try {
    logger.info('Creating invoice', { externalId: req.body.external_id });

    const result = await xenditClient.createInvoice(req.body);

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// Get invoice
router.get('/:invoiceId', validateParams(invoiceIdSchema), async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    logger.info('Getting invoice', { invoiceId });

    const result = await xenditClient.getInvoice(invoiceId);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// Expire invoice
router.post('/:invoiceId/expire', validateParams(invoiceIdSchema), async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    logger.info('Expiring invoice', { invoiceId });

    const result = await xenditClient.expireInvoice(invoiceId);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// List invoices
router.get('/', validateQuery(listInvoicesSchema), async (req, res, next) => {
  try {
    logger.info('Listing invoices', { query: req.query });

    const result = await xenditClient.listInvoices(req.query);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;