const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const config = require('./config');
const logger = require('./utils/logger');
const seedDatabase = require('./db/seed');
const configureSecurity = require('./middleware/security');
const { authenticateSession } = require('./middleware/auth');
const { apiLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const studentRoutes = require('./routes/student.routes');
const quizRoutes = require('./routes/quiz.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// 1. Basic parsers
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// 2. Security configurations & HTTP headers
configureSecurity(app);

// 3. Global session authentication
app.use(authenticateSession);

// 4. Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'QuizNest E-Quiz System',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: config.env
  });
});

// 5. Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/admin', adminRoutes);

// Apply general API rate limiting to any other API endpoints
app.use('/api', apiLimiter);

// 6. Serve static frontend files
const publicPath = path.resolve(__dirname, '../public');
app.use(express.static(publicPath));

// 7. SPA Fallback: Any non-API GET request serves index.html
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(publicPath, 'index.html'));
  }
  next();
});

// 8. 404 handler for unmatched API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return notFoundHandler(req, res, next);
  }
  res.status(404).send('Page not found');
});

// 9. Centralized Error Handler
app.use(errorHandler);

// Start server function
async function startServer() {
  try {
    // Seed initial data if required
    await seedDatabase();

    const server = app.listen(config.port, () => {
      logger.info(`=======================================================`);
      logger.info(` QuizNest – E-Quiz System Server running on port ${config.port}`);
      logger.info(` URL: http://localhost:${config.port}`);
      logger.info(` Environment: ${config.env}`);
      logger.info(`=======================================================`);
    });

    // Graceful shutdown
    const handleShutdown = (signal) => {
      logger.info(`Received ${signal}. Shutting down QuizNest server gracefully...`);
      server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout.');
        process.exit(1);
      }, 5000);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    return server;
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
