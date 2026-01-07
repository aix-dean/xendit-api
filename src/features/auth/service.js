const jwtService = require('../../shared/services/jwtService');
const logger = require('../../shared/utils/logger');

class AuthService {
  constructor() {
    // In production, replace with database
    this.users = this.loadDemoUsers();
  }

  loadDemoUsers() {
    try {
      const demoUsersJson = process.env.DEMO_USERS;
      return demoUsersJson ? JSON.parse(demoUsersJson) : [];
    } catch (error) {
      logger.error('Error loading demo users', { error: error.message });
      return [];
    }
  }

  async findByCredentials(username, password) {
    const user = this.users.find(u => u.username === username && u.password === password);

    if (user) {
      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    }

    return null;
  }

  async findById(id) {
    const user = this.users.find(u => u.id === id);

    if (user) {
      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    }

    return null;
  }

  async validateRefreshToken(decoded) {
    if (decoded.type !== 'refresh') {
      return null;
    }

    return await this.findById(decoded.userId);
  }

  // JWT methods (delegating to shared service)
  generateAccessToken(payload) {
    return jwtService.generateAccessToken(payload);
  }

  generateRefreshToken(payload) {
    return jwtService.generateRefreshToken(payload);
  }

  verifyToken(token) {
    return jwtService.verifyToken(token);
  }

  extractTokenFromHeader(authHeader) {
    return jwtService.extractTokenFromHeader(authHeader);
  }

  // In production, implement these methods with database operations:
  // - createUser(userData)
  // - updateUser(id, userData)
  // - deleteUser(id)
  // - findByUsername(username)
  // - changePassword(id, newPassword)
  // - blacklistToken(token)
  // - isTokenBlacklisted(token)
}

module.exports = new AuthService();