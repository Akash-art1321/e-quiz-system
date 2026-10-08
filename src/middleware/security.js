const helmet = require('helmet');
const cors = require('cors');

function configureSecurity(app) {
  // Helmet for security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'", // Needed for inline handlers during migration
            "https://cdnjs.cloudflare.com" // jsPDF, pdf.js
          ],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com"
          ],
          fontSrc: [
            "'self'",
            "https://fonts.gstatic.com",
            "data:"
          ],
          imgSrc: [
            "'self'",
            "data:",
            "blob:"
          ],
          connectSrc: [
            "'self'",
            "https://cdnjs.cloudflare.com"
          ],
          workerSrc: [
            "'self'",
            "blob:",
            "https://cdnjs.cloudflare.com"
          ],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    })
  );

  // Additional security headers
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // Prevent caching for API responses
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    next();
  });
}

module.exports = configureSecurity;
