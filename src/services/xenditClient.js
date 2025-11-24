const axios = require('axios');
const logger = require('../utils/logger');

class XenditClient {
  constructor() {
    this.baseURL = process.env.XENDIT_BASE_URL || 'https://api.xendit.co';
    this.apiKey = process.env.XENDIT_API_KEY;
    this.apiVersion = process.env.XENDIT_API_VERSION || '2024-11-11';

    if (!this.apiKey) {
      throw new Error('XENDIT_API_KEY environment variable is required');
    }

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
  }

  // Payment Requests
  async createPaymentRequest(data) {
    const response = await this.client.post('/v3/payment_requests', data);
    return response.data;
  }

  async getPaymentRequest(paymentRequestId) {
    const response = await this.client.get(`/v3/payment_requests/${paymentRequestId}`);
    return response.data;
  }

  async cancelPaymentRequest(paymentRequestId) {
    const response = await this.client.post(`/v3/payment_requests/${paymentRequestId}/cancel`);
    return response.data;
  }

  async simulatePaymentRequest(paymentRequestId, data = {}) {
    const response = await this.client.post(`/v3/payment_requests/${paymentRequestId}/simulate`, data);
    return response.data;
  }

  // Payments
  async getPayment(paymentId) {
    const response = await this.client.get(`/v3/payments/${paymentId}`);
    return response.data;
  }

  async cancelPayment(paymentId) {
    const response = await this.client.post(`/v3/payments/${paymentId}/cancel`);
    return response.data;
  }

  async capturePayment(paymentId, data) {
    const response = await this.client.post(`/v3/payments/${paymentId}/capture`, data);
    return response.data;
  }

  // Invoices
  async createInvoice(data) {
    const response = await this.client.post('/v2/invoices', data);
    return response.data;
  }

  async getInvoice(invoiceId) {
    const response = await this.client.get(`/v2/invoices/${invoiceId}`);
    return response.data;
  }

  async expireInvoice(invoiceId) {
    const response = await this.client.post(`/invoices/${invoiceId}/expire!`);
    return response.data;
  }

  async listInvoices(params = {}) {
    const response = await this.client.get('/v2/invoices', { params });
    return response.data;
  }
}

module.exports = new XenditClient();