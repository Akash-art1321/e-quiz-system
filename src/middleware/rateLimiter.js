const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';

// Auth rate limiter to protect against login brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 1000 : 20, // 20 attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts. Please try again after 15 minutes.'
  }
});

// Password reset request limiter
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many password reset requests. Please try again later.'
  }
});

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 5000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Rate limit exceeded. Please slow down your requests.'
  }
});

module.exports = {
  authLimiter,
  resetLimiter,
  apiLimiter
};
