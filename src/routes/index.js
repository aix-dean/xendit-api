const express = require('express');
const router = express.Router();

// Import route modules
const paymentRequests = require('./paymentRequests');
const payments = require('./payments');
const invoices = require('./invoices');
const webhooks = require('./webhooks');

// Mount routes
router.use('/payment-requests', paymentRequests);
router.use('/payments', payments);
router.use('/invoices', invoices);
router.use('/webhooks', webhooks);

module.exports = router;