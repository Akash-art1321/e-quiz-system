const logger = require('../utils/logger');
const config = require('../config');

function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: `Resource not found: ${req.method} ${req.originalUrl}`
  });
}

function errorHandler(err, req, res, next) {
  logger.error('Unhandled request error:', err, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  });

  const statusCode = err.status || err.statusCode || 500;
  const isProduction = config.env === 'production';

  res.status(statusCode).json({
    error: isProduction && statusCode === 500
      ? 'An unexpected error occurred on the server. Please try again later.'
      : (err.message || 'Internal Server Error'),
    ...(isProduction ? {} : { stack: err.stack })
  });
}

module.exports = {
  notFoundHandler,
  errorHandler
};
