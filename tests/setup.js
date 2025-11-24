// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.XENDIT_API_KEY = 'test_api_key';
process.env.XENDIT_BASE_URL = 'https://api.xendit.co';
process.env.XENDIT_API_VERSION = '2024-11-11';
process.env.API_USERNAME = 'testuser';
process.env.API_PASSWORD = 'testpass';
process.env.WEBHOOK_CALLBACK_TOKEN = 'test_webhook_token';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX_REQUESTS = '100';
process.env.CORS_ORIGIN = 'http://localhost:3000';

// Mock the logger to avoid file writes during tests
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));