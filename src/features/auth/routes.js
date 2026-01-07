const express = require('express');
const router = express.Router();
const service = require('./service');
const { validate } = require('../../shared/middleware/validation');
const logger = require('../../shared/utils/logger');

// Validation schemas
const loginSchema = require('joi').object({
  username: require('joi').string().required(),
  password: require('joi').string().required()
});

const refreshTokenSchema = require('joi').object({
  refreshToken: require('joi').string().required()
});

// Login endpoint
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { username, password } = req.body;

    logger.info('Login attempt', { username });

    // Find user by credentials
    const user = await service.findByCredentials(username, password);

    if (!user) {
      logger.warn('Invalid login credentials', { username });
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password'
        }
      });
    }

    // Generate tokens
    const accessToken = service.generateAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role
    });

    const refreshToken = service.generateRefreshToken({
      userId: user.id,
      type: 'refresh'
    });

    logger.info('Login successful', { userId: user.id, username: user.username });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      }
    });

  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({
      error: {
        code: 'LOGIN_FAILED',
        message: 'Login failed'
      }
    });
  }
});

// Refresh token endpoint
router.post('/refresh', validate(refreshTokenSchema), async (req, res) => {
  try {
    const { refreshToken } = req.body;

    logger.info('Token refresh attempt');

    // Verify refresh token
    const decoded = service.verifyToken(refreshToken);

    // Validate refresh token payload
    const user = await service.validateRefreshToken(decoded);

    if (!user) {
      logger.warn('Invalid refresh token');
      return res.status(401).json({
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid refresh token'
        }
      });
    }

    // Generate new access token
    const accessToken = service.generateAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role
    });

    logger.info('Token refresh successful', { userId: user.id });

    res.json({
      success: true,
      data: {
        accessToken
      }
    });

  } catch (error) {
    logger.warn('Token refresh failed', { error: error.message });
    res.status(401).json({
      error: {
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid refresh token'
      }
    });
  }
});

// Logout endpoint (optional - for token blacklisting in production)
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = service.extractTokenFromHeader(authHeader);

    if (token) {
      // In production, add token to blacklist
      logger.info('Logout successful');
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('Logout error', { error: error.message });
    res.status(500).json({
      error: {
        code: 'LOGOUT_FAILED',
        message: 'Logout failed'
      }
    });
  }
});

// Get current user info
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = service.extractTokenFromHeader(authHeader);

    if (!token) {
      return res.status(401).json({
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Access token required'
        }
      });
    }

    const decoded = service.verifyToken(token);
    const user = await service.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        user
      }
    });

  } catch (error) {
    logger.error('Get user info error', { error: error.message });
    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid token'
      }
    });
  }
});

module.exports = router;