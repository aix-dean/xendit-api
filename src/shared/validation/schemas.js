const Joi = require('joi');

// Common validation schemas
const customerSchema = Joi.object({
  type: Joi.string().valid('INDIVIDUAL').required(),
  reference_id: Joi.string().min(1).max(255).required(),
  email: Joi.string().email().min(4).max(50).optional(),
  mobile_number: Joi.string().min(1).max(50).optional(),
  individual_detail: Joi.object().optional()
});

const itemSchema = Joi.object({
  name: Joi.string().min(1).max(256).required(),
  quantity: Joi.number().integer().min(1).max(510000).required(),
  price: Joi.number().min(0).required(),
  category: Joi.string().optional(),
  url: Joi.string().uri().optional()
});

const shippingInfoSchema = Joi.object({
  // Define based on Xendit docs if needed
});

const metadataSchema = Joi.object().pattern(
  Joi.string().min(1).max(40),
  Joi.string().min(1).max(500)
).max(50);

// Payment Request schemas
const createPaymentRequestSchema = Joi.alternatives().try(
  // Old format (Payment Requests)
  Joi.object({
    reference_id: Joi.string().min(1).max(255).required(),
    type: Joi.string().valid('PAY', 'PAY_AND_SAVE', 'REUSABLE_PAYMENT_CODE').required(),
    country: Joi.string().valid('ID', 'PH', 'VN', 'TH', 'SG', 'MY').required(),
    currency: Joi.string().valid('IDR', 'PHP', 'VND', 'THB', 'SGD', 'MYR', 'USD').required(),
    channel_code: Joi.string().required(),
    channel_properties: Joi.object().required(),
    request_amount: Joi.number().min(0).required(),
    capture_method: Joi.string().valid('AUTOMATIC', 'MANUAL').default('AUTOMATIC'),
    description: Joi.string().min(1).max(1000).optional(),
    customer_id: Joi.string().max(41).optional(),
    customer: customerSchema.optional(),
    items: Joi.array().items(itemSchema).optional(),
    shipping_information: shippingInfoSchema.optional(),
    metadata: metadataSchema.optional()
  }),
  // New format (Cards Session)
  Joi.object({
    reference_id: Joi.string().min(1).max(255).required(),
    session_type: Joi.string().valid('PAY').required(),
    mode: Joi.string().valid('CARDS_SESSION_JS').required(),
    amount: Joi.number().min(0).required(),
    currency: Joi.string().valid('IDR', 'PHP', 'VND', 'THB', 'SGD', 'MYR', 'USD').required(),
    channel_code: Joi.string().optional(),
    channel_properties: Joi.object({
      cards: Joi.object({
        skip_three_ds: Joi.boolean().optional()
      }).optional()
    }).optional(),
    country: Joi.string().valid('ID', 'PH', 'VN', 'TH', 'SG', 'MY').required(),
    customer: customerSchema.required(),
    cards_session_js: Joi.object({
      success_return_url: Joi.string().uri().required(),
      failure_return_url: Joi.string().uri().required()
    }).required(),
    description: Joi.string().min(1).max(1000).optional(),
    metadata: metadataSchema.optional()
  })
);

const cancelPaymentRequestSchema = Joi.object({
  // No body required for cancel
});

const simulatePaymentRequestSchema = Joi.object({
  amount: Joi.number().min(0).optional()
});

// Payment schemas
const capturePaymentSchema = Joi.object({
  capture_amount: Joi.number().min(0).required()
});

// Invoice schemas
const createInvoiceSchema = Joi.object({
  external_id: Joi.string().min(1).max(255).required(),
  amount: Joi.number().min(0).required(),
  description: Joi.string().min(1).optional(),
  invoice_duration: Joi.number().min(1).max(31536000).default(86400),
  customer: Joi.object({
    given_names: Joi.string().optional(),
    surname: Joi.string().optional(),
    email: Joi.string().email().optional(),
    mobile_number: Joi.string().optional(),
    addresses: Joi.array().items(Joi.object()).optional()
  }).optional(),
  customer_notification_preference: Joi.object({
    invoice_created: Joi.array().items(Joi.string().valid('whatsapp', 'email', 'viber')).optional(),
    invoice_reminder: Joi.array().items(Joi.string().valid('whatsapp', 'email', 'viber')).optional(),
    invoice_paid: Joi.array().items(Joi.string().valid('whatsapp', 'email', 'viber')).optional()
  }).optional(),
  success_redirect_url: Joi.string().uri().min(1).max(255).optional(),
  failure_redirect_url: Joi.string().uri().min(1).max(255).optional(),
  currency: Joi.string().valid('IDR', 'PHP', 'THB', 'VND', 'MYR').optional(),
  items: Joi.array().items(Joi.object({
    name: Joi.string().max(256).required(),
    quantity: Joi.number().min(1).max(510000).required(),
    price: Joi.number().required(),
    category: Joi.string().optional(),
    url: Joi.string().uri().optional()
  })).optional(),
  fees: Joi.array().items(Joi.object({
    type: Joi.string().required(),
    value: Joi.number().required()
  })).optional(),
  payment_methods: Joi.array().items(Joi.string()).optional(),
  channel_properties: Joi.object().optional(),
  metadata: metadataSchema.optional()
});

const listInvoicesSchema = Joi.object({
  external_id: Joi.string().optional(),
  statuses: Joi.array().items(Joi.string().valid('PENDING', 'PAID', 'SETTLED', 'EXPIRED')).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10),
  created_after: Joi.string().isoDate().optional(),
  created_before: Joi.string().isoDate().optional(),
  paid_after: Joi.string().isoDate().optional(),
  paid_before: Joi.string().isoDate().optional(),
  expired_after: Joi.string().isoDate().optional(),
  expired_before: Joi.string().isoDate().optional(),
  last_invoice_id: Joi.string().optional(),
  client_types: Joi.array().items(Joi.string().valid('API_GATEWAY', 'DASHBOARD', 'INTEGRATION', 'ON_DEMAND', 'RECURRING', 'MOBILE')).optional(),
  payment_channels: Joi.array().items(Joi.string()).optional(),
  on_demand_link: Joi.string().optional(),
  recurring_payment_id: Joi.string().optional()
});

// Webhook schema
const webhookSchema = Joi.object({
  event: Joi.string().valid('payment.capture', 'payment.authorization', 'payment.failure', 'payment.failed', 'payment.succeeded').required(),
  business_id: Joi.string().required(),
  created: Joi.string().isoDate().required(),
  api_version: Joi.string().optional(),
  data: Joi.object({
    type: Joi.string().required(),
    status: Joi.string().required(),
    country: Joi.string().required(),
    created: Joi.string().isoDate().required(),
    updated: Joi.string().isoDate().required(),
    currency: Joi.string().required(),
    payment_id: Joi.string().required(),
    business_id: Joi.string().required(),
    channel_code: Joi.string().required(),
    reference_id: Joi.string().required(),
    capture_method: Joi.string().required(),
    request_amount: Joi.number().required(),
    payment_request_id: Joi.string().required(),
    captures: Joi.array().items(Joi.object({
      capture_id: Joi.string().required(),
      capture_amount: Joi.number().required(),
      capture_timestamp: Joi.string().isoDate().required()
    })).optional(),
    payment_details: Joi.object({
      payer_name: Joi.string().allow(null, '').optional(),
      receipt_id: Joi.string().allow(null, '').optional(),
      issuer_name: Joi.string().allow(null, '').optional()
    }).optional(),
    failure_code: Joi.string().optional()
  }).required()
}).unknown();

module.exports = {
  createPaymentRequestSchema,
  cancelPaymentRequestSchema,
  simulatePaymentRequestSchema,
  capturePaymentSchema,
  createInvoiceSchema,
  listInvoicesSchema,
  webhookSchema
};