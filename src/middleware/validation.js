const Joi = require('joi');
const logger = require('../utils/logger');

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      logger.warn('Validation error', {
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        body: req.body
      });

      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        }
      });
    }

    // Replace req.body with validated value
    req.body = value;
    next();
  };
};

const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, { abortEarly: false });

    if (error) {
      logger.warn('Parameter validation error', {
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        params: req.params
      });

      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters',
          details: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        }
      });
    }

    // Replace req.params with validated value
    req.params = value;
    next();
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, { abortEarly: false });

    if (error) {
      logger.warn('Query validation error', {
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        query: req.query
      });

      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        }
      });
    }

    // Replace req.query with validated value
    req.query = value;
    next();
  };
};

module.exports = {
  validate,
  validateParams,
  validateQuery
};