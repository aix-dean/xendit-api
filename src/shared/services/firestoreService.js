const admin = require('firebase-admin');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK
let db = null;

if (!admin.apps.length) {
  try {
    // Decode base64 encoded service account key if provided
    if (process.env.FIREBASE_SA_KEY_B64) {
      process.env.FIREBASE_SA_KEY = Buffer.from(process.env.FIREBASE_SA_KEY_B64, 'base64').toString();
    }

    // For production, use service account key from environment
    if (process.env.FIREBASE_SA_KEY && process.env.FIREBASE_SA_KEY !== '{}' && process.env.FIREBASE_SA_KEY !== '{""}') {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SA_KEY);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
      logger.info('Firebase initialized with service account key');
    } else {
      // Try to load from file
      const keyFilePath = path.join(__dirname, '..', '..', 'oh-app-bcf24-firebase-adminsdk-s6fxk-bbb4d062b8.json');
      if (fs.existsSync(keyFilePath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id
        });
        logger.info('Firebase initialized with service account key from file');
      } else {
        // For development, use default credentials (if available)
        // This works if you're running on a machine with Firebase CLI logged in
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || 'oh-app-bcf24'
        });
        logger.info('Firebase initialized with default credentials');
      }
    }

    // Initialize Firestore only if Firebase is properly initialized
    db = admin.firestore();
    logger.info('Firestore initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Firebase/Firestore', { error: error.message });
    logger.warn('Firestore functionality will be disabled - check Firebase credentials');
  }
}

class FirestoreService {
  constructor() {
    this.db = db;
  }

  /**
   * Check if Firestore is available
   */
  isAvailable() {
    return this.db !== null;
  }

  /**
   * Update booking transaction status
   * @param {string} bookingId - The booking document ID
   * @param {string} status - The payment status from Xendit
   * @param {object} paymentData - Additional payment data
   */
  async updateBookingTransactionStatus(bookingId, status, paymentData = {}) {
    if (!this.isAvailable()) {
      logger.warn('Firestore not available - skipping booking update', { bookingId, status });
      return { success: false, bookingId, status, reason: 'Firestore not available' };
    }

    try {
      const bookingRef = this.db.collection('booking').doc(bookingId);

      // Check if document exists
      const doc = await bookingRef.get();
      if (!doc.exists) {
        logger.warn('Booking document does not exist', { bookingId });
        return { success: false, bookingId, status, reason: 'Booking not found' };
      }

      // Map Xendit status to your app's status
      const mappedStatus = this.mapXenditStatus(status);

      // Filter out undefined values
      const updateData = Object.fromEntries(
        Object.entries({
          'transaction.status': mappedStatus,
          'transaction.updatedAt': admin.firestore.FieldValue.serverTimestamp(),
          'transaction.paymentId': paymentData.payment_id,
          'transaction.referenceId': paymentData.reference_id,
          'transaction.paymentRequestId': paymentData.payment_request_id,
          'transaction.amount': paymentData.amount,
          'transaction.currency': paymentData.currency,
          'transaction.channelCode': paymentData.channel_code,
          'transaction.failureCode': paymentData.failure_code,
          'transaction.processedAt': admin.firestore.FieldValue.serverTimestamp()
        }).filter(([_, v]) => v !== undefined)
      );

      await bookingRef.update(updateData);

      logger.info('Booking transaction status updated', {
        bookingId,
        xenditStatus: status,
        mappedStatus,
        paymentId: paymentData.payment_id,
        referenceId: paymentData.reference_id
      });

      return { success: true, bookingId, status: mappedStatus };

    } catch (error) {
      logger.error('Failed to update booking transaction status', {
        bookingId,
        status,
        error: error.message
      });

      throw new Error(`Failed to update booking: ${error.message}`);
    }
  }

  /**
   * Map Xendit payment status to your app's status
   * @param {string} xenditStatus - Status from Xendit webhook
   * @returns {string} - Mapped status for your app
   */
  mapXenditStatus(xenditStatus) {
    const statusMap = {
      'SUCCEEDED': 'completed',
      'AUTHORIZED': 'authorized',
      'AUTHORIZED': 'authorized',
      'PENDING': 'pending',
      'FAILED': 'failed',
      'CANCELED': 'cancelled',
      'EXPIRED': 'expired'
    };

    return statusMap[xenditStatus] || 'unknown';
  }

  /**
   * Get booking by payment request ID
   * @param {string} paymentRequestId - Xendit payment request ID
   */
  async getBookingByPaymentRequestId(paymentRequestId) {
    try {
      const bookingsRef = this.db.collection('booking');
      const query = bookingsRef.where('transaction.paymentRequestId', '==', paymentRequestId);
      const snapshot = await query.get();

      if (snapshot.empty) {
        logger.warn('No booking found for payment request ID', { paymentRequestId });
        return null;
      }

      // Assuming one booking per payment request
      const doc = snapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data()
      };

    } catch (error) {
      logger.error('Failed to get booking by payment request ID', {
        paymentRequestId,
        error: error.message
      });
      throw error;
    }
  }


  /**
   * Create payment log entry
   * @param {object} paymentData - Payment data from webhook
   */
  async createPaymentLog(paymentData) {
    if (!this.isAvailable()) {
      logger.warn('Firestore not available - skipping payment log creation', { paymentId: paymentData.payment_id });
      return null;
    }

    try {
      const paymentLogRef = this.db.collection('payment_logs').doc();

      await paymentLogRef.set({
        ...paymentData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'xendit_webhook'
      });

      logger.info('Payment log created', { paymentId: paymentData.payment_id });
      return paymentLogRef.id;

    } catch (error) {
      logger.error('Failed to create payment log', {
        paymentId: paymentData.payment_id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get booking by ID
   * @param {string} bookingId - Booking document ID
   */
  async getBooking(bookingId) {
    try {
      const bookingRef = this.db.collection('booking').doc(bookingId);
      const doc = await bookingRef.get();

      if (!doc.exists) {
        return null;
      }

      return {
        id: doc.id,
        ...doc.data()
      };

    } catch (error) {
      logger.error('Failed to get booking', { bookingId, error: error.message });
      throw error;
    }
  }
}

module.exports = new FirestoreService();