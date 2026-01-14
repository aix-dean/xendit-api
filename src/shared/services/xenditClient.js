const axios = require('axios');
const logger = require('../utils/logger');

class XenditClient {
  constructor() {
    this.baseURL = process.env.XENDIT_BASE_URL || 'https://api.xendit.co';
    this.apiKey = process.env.XENDIT_API_KEY;
    this.apiVersion = process.env.XENDIT_API_VERSION || '2024-11-11';
    this.client = null;
    this.initialized = false;

    // Initialize client if API key is available
    this.initialize();
  }

  initialize() {
    if (!this.apiKey) {
      logger.warn('XENDIT_API_KEY not set - XenditClient will not function until API key is provided');
      return;
    }

    try {
      // Create axios instance with default config
      this.client = axios.create({
        baseURL: this.baseURL,
        timeout: 30000, // 30 seconds
        headers: {
          'Content-Type': 'application/json',
          'api-version': this.apiVersion,
          'Authorization': `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`
        }
      });

      // Add response interceptor for logging
      this.client.interceptors.response.use(
        (response) => {
          logger.info('Xendit API response', {
            status: response.status,
            url: response.config.url,
            method: response.config.method
          });
          return response;
        },
        (error) => {
          logger.error('Xendit API error', {
            status: error.response?.status,
            url: error.config?.url,
            method: error.config?.method,
            message: error.message,
            response: error.response?.data
          });
          return Promise.reject(error);
        }
      );

      this.initialized = true;
      logger.info('XenditClient initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize XenditClient', { error: error.message });
    }
  }

  ensureInitialized() {
    if (!this.initialized || !this.client) {
      throw new Error('XenditClient is not initialized. XENDIT_API_KEY environment variable is required.');
    }
  }

  // Payment Requests
  async createPaymentRequest(data) {
    this.ensureInitialized();
    const response = await this.client.post('/v3/payment_requests', data);
    return response.data;
  }

  async getPaymentRequest(paymentRequestId) {
    this.ensureInitialized();
    const response = await this.client.get(`/v3/payment_requests/${paymentRequestId}`);
    return response.data;
  }

  async cancelPaymentRequest(paymentRequestId) {
    this.ensureInitialized();
    const response = await this.client.post(`/v3/payment_requests/${paymentRequestId}/cancel`);
    return response.data;
  }

  async simulatePaymentRequest(paymentRequestId, data = {}) {
    this.ensureInitialized();
    const response = await this.client.post(`/v3/payment_requests/${paymentRequestId}/simulate`, data);
    return response.data;
  }

  // Payments
  async getPayment(paymentId) {
    this.ensureInitialized();
    const response = await this.client.get(`/v3/payments/${paymentId}`);
    return response.data;
  }

  async cancelPayment(paymentId) {
    this.ensureInitialized();
    const response = await this.client.post(`/v3/payments/${paymentId}/cancel`);
    return response.data;
  }

  async capturePayment(paymentId, data) {
    this.ensureInitialized();
    const response = await this.client.post(`/v3/payments/${paymentId}/capture`, data);
    return response.data;
  }

  // Invoices
  async createInvoice(data) {
    this.ensureInitialized();
    const response = await this.client.post('/v2/invoices', data);
    return response.data;
  }

  async getInvoice(invoiceId) {
    this.ensureInitialized();
    const response = await this.client.get(`/v2/invoices/${invoiceId}`);
    return response.data;
  }

  async expireInvoice(invoiceId) {
    this.ensureInitialized();
    const response = await this.client.post(`/invoices/${invoiceId}/expire!`);
    return response.data;
  }

  async listInvoices(params = {}) {
    this.ensureInitialized();
    const response = await this.client.get('/v2/invoices', { params });
    return response.data;
  }
}

module.exports = new XenditClient();