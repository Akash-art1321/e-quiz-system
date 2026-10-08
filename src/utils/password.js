const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

async function hashPassword(plainTextPassword) {
  if (!plainTextPassword || typeof plainTextPassword !== 'string') {
    throw new Error('Invalid password provided for hashing');
  }
  return await bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

async function comparePassword(plainTextPassword, hashedPassword) {
  if (!plainTextPassword || !hashedPassword) {
    return false;
  }
  return await bcrypt.compare(plainTextPassword, hashedPassword);
}

function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }
  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters long' };
  }
  if (password.length > 128) {
    return { valid: false, message: 'Password cannot exceed 128 characters' };
  }
  return { valid: true };
}

module.exports = {
  hashPassword,
  comparePassword,
  validatePasswordStrength
};
