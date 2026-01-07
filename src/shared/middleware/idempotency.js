const crypto = require('crypto');
const logger = require('../utils/logger');

// Simple in-memory store for idempotency keys (in production, use Redis or database)
const idempotencyStore = new Map();
const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const IDEMPOTENCY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

const idempotencyMiddleware = (req, res, next) => {
  // Only apply to POST requests for payment creation
  if (req.method !== 'POST' || !req.path.includes('/payment-requests') && !req.path.includes('/invoices')) {
    return next();
  }

  const idempotencyKey = req.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()];

  if (!idempotencyKey) {
    return res.status(400).json({
      error: {
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: `Missing required header: ${IDEMPOTENCY_KEY_HEADER}`
      }
    });
  }

  // Validate idempotency key format (should be a UUID or similar)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(idempotencyKey)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency key must be a valid UUID'
      }
    });
  }

  const key = `${req.method}:${req.path}:${idempotencyKey}`;
  const stored = idempotencyStore.get(key);

  if (stored) {
    const now = Date.now();
    if (now - stored.timestamp > IDEMPOTENCY_EXPIRY_MS) {
      // Key expired, remove it
      idempotencyStore.delete(key);
    } else {
      // Return cached response
      logger.info('Returning cached response for idempotent request', { idempotencyKey });
      return res.status(stored.statusCode).json(stored.response);
    }
  }

  // Store the response for future identical requests
  const originalJson = res.json;
  res.json = function(data) {
    const responseData = data;
    idempotencyStore.set(key, {
      response: responseData,
      statusCode: res.statusCode,
      timestamp: Date.now()
    });

    // Clean up old entries periodically (simple implementation)
    if (idempotencyStore.size > 1000) {
      const cutoff = Date.now() - IDEMPOTENCY_EXPIRY_MS;
      for (const [k, v] of idempotencyStore.entries()) {
        if (v.timestamp < cutoff) {
          idempotencyStore.delete(k);
        }
      }
    }

    return originalJson.call(this, data);
  };

  next();
};

module.exports = idempotencyMiddleware;