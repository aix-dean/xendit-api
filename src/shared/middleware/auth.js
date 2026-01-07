const jwtService = require('../services/jwtService');
const userService = require('../services/userService');
const logger = require('../utils/logger');

// JWT Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = jwtService.extractTokenFromHeader(authHeader);

  if (!token) {
    return res.status(401).json({
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Access token required'
      }
    });
  }

  try {
    const decoded = jwtService.verifyToken(token);

    // Fetch user details (optional - you can skip this if you store user info in JWT)
    const user = await userService.findById(decoded.userId);

    if (!user) {
      logger.warn('User not found for token', { userId: decoded.userId });
      return res.status(401).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User associated with token not found'
        }
      });
    }

    // Attach user to request object
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    next();
  } catch (error) {
    logger.warn('Token authentication failed', { error: error.message });
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token'
      }
    });
  }
};

// Role-based authorization middleware
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required'
        }
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Insufficient permissions', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: allowedRoles
      });

      return res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'Insufficient permissions'
        }
      });
    }

    next();
  };
};

// Optional: Admin only middleware
const requireAdmin = authorizeRoles('admin');

// Optional: User or Admin middleware
const requireUserOrAdmin = authorizeRoles('user', 'admin');

module.exports = {
  authenticateToken,
  authorizeRoles,
  requireAdmin,
  requireUserOrAdmin
};