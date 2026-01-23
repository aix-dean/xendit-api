require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const logger = require('./shared/utils/logger');
const errorHandler = require('./shared/middleware/errorHandler');
const idempotencyMiddleware = require('./shared/middleware/idempotency');

// Log startup information
logger.info('Starting Xendit API server...', {
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT || 8080,
  hasXenditKey: !!process.env.XENDIT_API_KEY,
  hasWebhookToken: !!process.env.WEBHOOK_CALLBACK_TOKEN,
  hasFirebaseProject: !!process.env.FIREBASE_PROJECT_ID
});

// Import feature routes (with error handling)
let authRoutes, paymentRoutes, paymentRequestRoutes, invoiceRoutes, webhookRoutes;

try {
  authRoutes = require('./features/auth');
  paymentRoutes = require('./features/payments');
  paymentRequestRoutes = require('./features/payment-requests');
  invoiceRoutes = require('./features/invoices');
  webhookRoutes = require('./features/webhooks');
  logger.info('All route modules loaded successfully');
} catch (error) {
  logger.error('Failed to load route modules', { error: error.message, stack: error.stack });
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Cloud Run (only trust Google's infrastructure)
app.set('trust proxy', function (ip) {
  // Trust Cloud Run load balancer IPs
  return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('172.16.') || ip.startsWith('192.168.');
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.method !== 'GET' ? req.body : undefined
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes (no authentication required)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/payment-requests', idempotencyMiddleware, paymentRequestRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found'
    }
  });
});

// Start server with error handling
const server = app.listen(PORT, '0.0.0.0', (error) => {
  if (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack,
      port: PORT
    });
    process.exit(1);
  }
  logger.info(`Server running on port ${PORT}`, {
    environment: process.env.NODE_ENV,
    pid: process.pid,
    uptime: process.uptime()
  });
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use`, { port: PORT });
  } else {
    logger.error('Server error', { error: error.message, stack: error.stack });
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  server.close(() => {
    process.exit(1);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason: reason,
    promise: promise
  });
  server.close(() => {
    process.exit(1);
  });
});

module.exports = app;