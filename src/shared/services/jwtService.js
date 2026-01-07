const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

class JWTService {
  constructor() {
    this.secret = process.env.JWT_SECRET;
    this.expiresIn = process.env.JWT_EXPIRES_IN || '24h';
    this.refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

    if (!this.secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
  }

  generateAccessToken(payload) {
    try {
      return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn });
    } catch (error) {
      logger.error('Error generating access token', { error: error.message });
      throw new Error('Failed to generate access token');
    }
  }

  generateRefreshToken(payload) {
    try {
      return jwt.sign(payload, this.secret, { expiresIn: this.refreshExpiresIn });
    } catch (error) {
      logger.error('Error generating refresh token', { error: error.message });
      throw new Error('Failed to generate refresh token');
    }
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.secret);
    } catch (error) {
      logger.warn('Token verification failed', { error: error.message });
      throw new Error('Invalid token');
    }
  }

  extractTokenFromHeader(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.split(' ')[1];
  }

  decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      logger.warn('Token decode failed', { error: error.message });
      return null;
    }
  }
}

module.exports = new JWTService();