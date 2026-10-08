const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'quiznest-fallback-development-session-secret-64-bytes-min',
  cookieSecure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
  sessionMaxAgeHours: parseInt(process.env.SESSION_MAX_AGE_HOURS, 10) || 24,
  dbPath: process.env.DB_PATH || path.resolve(__dirname, '../../data/quiznest.db'),
  adminSeed: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'Admin@QuizNest2026!'
  }
};

module.exports = config;
