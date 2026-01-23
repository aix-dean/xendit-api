const admin = require('firebase-admin');
const logger = require('../utils/logger');

// Initialize Firebase Admin SDK with Application Default Credentials
let db = null;

if (!admin.apps.length) {
  try {
    logger.info('Initializing Firebase with Application Default Credentials...');
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'oh-app-bcf24'
    });
    
    db = admin.firestore();
    logger.info('Firebase and Firestore initialized successfully');
    
  } catch (error) {
    logger.error('Failed to initialize Firebase/Firestore', { error: error.message, stack: error.stack });
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

      // Get booking data to check conditions
      const bookingData = doc.data();
      const payLater = bookingData.payLater;
      const url = bookingData.url || '';

      // Map Xendit status to your app's status
      const mappedStatus = this.mapXenditStatus(status);

      // Determine booking.status based on conditions
      // Only update booking.status if payment is successfully processed
      let bookingStatus = null;
      const isPaymentSuccessful = status === 'SUCCEEDED' || mappedStatus === 'completed';
      
      if (isPaymentSuccessful) {
        const isPayLaterFalseOrNull = payLater === false || payLater === null || payLater === undefined;
        
        if (isPayLaterFalseOrNull && (!url || url.trim() === '')) {
          // Condition 1: payLater == false/null AND url is empty → 'Content Pending'
          bookingStatus = 'Content Pending';
        } else if (mappedStatus === 'pending' && isPayLaterFalseOrNull && url && url.trim() !== '') {
          // Condition 2: status == 'pending' AND payLater == false/null AND url is not empty → 'Processing'
          bookingStatus = 'Processing';
        }
      }

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
          'transaction.processedAt': admin.firestore.FieldValue.serverTimestamp(),
          ...(bookingStatus && { 'status': bookingStatus })
        }).filter(([_, v]) => v !== undefined)
      );

      await bookingRef.update(updateData);

      logger.info('Booking transaction status updated', {
        bookingId,
        xenditStatus: status,
        mappedStatus,
        bookingStatus: bookingStatus || 'unchanged',
        paymentId: paymentData.payment_id,
        referenceId: paymentData.reference_id,
        payLater,
        url: url ? 'present' : 'empty'
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