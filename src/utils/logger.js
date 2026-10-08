const SENSITIVE_KEYS = ['password', 'initialPassword', 'currentPassword', 'newPassword', 'token', 'secret', 'authorization', 'cookie', 'password_hash'];

function sanitize(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitize);

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitize(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

const logger = {
  info: (msg, meta) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${msg}`, meta ? JSON.stringify(sanitize(meta)) : '');
  },
  warn: (msg, meta) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] ${msg}`, meta ? JSON.stringify(sanitize(meta)) : '');
  },
  error: (msg, err, meta) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] ${msg}`, err ? (err.message || err) : '', meta ? JSON.stringify(sanitize(meta)) : '');
  },
  debug: (msg, meta) => {
    if (process.env.NODE_ENV !== 'production') {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [DEBUG] ${msg}`, meta ? JSON.stringify(sanitize(meta)) : '');
    }
  }
};

module.exports = logger;
