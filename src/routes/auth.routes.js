const express = require('express');
const crypto = require('crypto');
const { get, run } = require('../db');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password');
const { sanitizeString } = require('../utils/validator');
const { COOKIE_NAME, requireAuth } = require('../middleware/auth');
const { authLimiter, resetLimiter } = require('../middleware/rateLimiter');
const config = require('../config');
const logger = require('../utils/logger');
const { broadcastEvent } = require('../utils/realtime');

const router = express.Router();

function setSessionCookie(res, token) {
  const maxAgeMs = config.sessionMaxAgeHours * 60 * 60 * 1000;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: maxAgeMs,
    path: '/'
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/'
  });
}

// POST /api/auth/login - Unified single login endpoint
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const identifier = sanitizeString(req.body.identifier || req.body.username || req.body.email || req.body.studentId);
    const password = req.body.password;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Please enter your ID/Username/Email and password.' });
    }

    const now = Date.now();
    const maxAgeMs = config.sessionMaxAgeHours * 60 * 60 * 1000;
    const expiresAt = now + maxAgeMs;

    // 1. Check if identifier belongs to an Admin
    const admin = get(
      `SELECT id, username, password_hash, name, email, employee_id, designation,
              department, college_name, phone, qualification
       FROM admins
       WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) OR LOWER(employee_id) = LOWER(?)`,
      [identifier, identifier, identifier]
    );

    if (admin) {
      const match = await comparePassword(password, admin.password_hash);
      if (!match) {
        logger.warn('Failed admin login attempt', { identifier, ip: req.ip });
        return res.status(401).json({ error: 'Invalid credentials. Please verify your identifier and password.' });
      }

      // Generate secure session token
      const sessionToken = crypto.randomBytes(32).toString('hex');
      run(
        'INSERT INTO sessions (id, user_id, user_type, ip_address, user_agent, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sessionToken, admin.id, 'admin', req.ip || '', req.headers['user-agent'] || '', now, expiresAt]
      );

      // Audit log
      run(
        'INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [`log_${crypto.randomBytes(6).toString('hex')}`, admin.id, 'admin', 'ADMIN_LOGIN', 'Admin logged in', req.ip, now]
      );

      setSessionCookie(res, sessionToken);

      return res.json({
        success: true,
        user: {
          id: admin.id,
          username: admin.username,
          name: admin.name,
          email: admin.email,
          employeeId: admin.employee_id,
          designation: admin.designation,
          department: admin.department,
          collegeName: admin.college_name,
          phone: admin.phone,
          qualification: admin.qualification,
          userType: 'admin'
        },
        redirectUrl: '/#admin'
      });
    }

    // 2. Check if identifier belongs to a Student (Student ID, Email, or Roll Number)
    const student = get(
      `SELECT id, student_id, name, password_hash, email, phone, college_id, college_name,
              roll_number, course, year, father_name, mother_name, profile_photo,
              is_active, verified, must_change_password
       FROM students
       WHERE LOWER(student_id) = LOWER(?) OR LOWER(email) = LOWER(?) OR LOWER(roll_number) = LOWER(?)`,
      [identifier, identifier, identifier]
    );

    if (student) {
      if (student.is_active === 0) {
        return res.status(403).json({
          error: 'Your student account is currently disabled. Please contact your institution administrator.'
        });
      }

      const match = await comparePassword(password, student.password_hash);
      if (!match) {
        logger.warn('Failed student login attempt', { identifier, ip: req.ip });
        return res.status(401).json({ error: 'Invalid credentials. Please verify your identifier and password.' });
      }

      // Generate secure session token
      const sessionToken = crypto.randomBytes(32).toString('hex');
      run(
        'INSERT INTO sessions (id, user_id, user_type, ip_address, user_agent, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sessionToken, student.id, 'student', req.ip || '', req.headers['user-agent'] || '', now, expiresAt]
      );

      // Audit log
      run(
        'INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [`log_${crypto.randomBytes(6).toString('hex')}`, student.id, 'student', 'STUDENT_LOGIN', 'Student logged in', req.ip, now]
      );

      setSessionCookie(res, sessionToken);

      return res.json({
        success: true,
        user: {
          id: student.id,
          studentId: student.student_id,
          name: student.name,
          email: student.email,
          phone: student.phone,
          collegeName: student.college_name,
          rollNumber: student.roll_number,
          course: student.course,
          year: student.year,
          fatherName: student.father_name,
          motherName: student.mother_name,
          profilePhoto: student.profile_photo,
          mustChangePassword: !!student.must_change_password,
          userType: 'student'
        },
        redirectUrl: '/#student'
      });
    }

    // Generic error when neither matches
    logger.warn('Failed login for unknown identifier', { identifier, ip: req.ip });
    return res.status(401).json({ error: 'Invalid credentials. Please verify your identifier and password.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res, next) => {
  try {
    if (req.sessionId) {
      run('DELETE FROM sessions WHERE id = ?', [req.sessionId]);
    }
    clearSessionCookie(res);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.json({ authenticated: false, user: null });
  }

  let blockedAttempt = null;
  if (req.user.userType === 'student') {
    const activeBlocked = get(
      `SELECT a.id as attempt_id, a.quiz_id, q.title as quiz_title
       FROM attempts a
       JOIN quizzes q ON a.quiz_id = q.id
       WHERE a.student_id = ? AND a.status = 'in_progress' AND a.is_blocked = 1`,
      [req.user.id]
    );
    if (activeBlocked) {
      blockedAttempt = {
        attemptId: activeBlocked.attempt_id,
        quizId: activeBlocked.quiz_id,
        quizTitle: activeBlocked.quiz_title
      };
    }
  }

  res.json({ authenticated: true, user: req.user, blockedAttempt });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirmation do not match.' });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return res.status(400).json({ error: strength.message });
    }

    const userId = req.user.id;
    const userType = req.user.userType;

    let currentHash;
    let studentRecord = null;
    if (userType === 'admin') {
      const admin = get('SELECT password_hash FROM admins WHERE id = ?', [userId]);
      currentHash = admin ? admin.password_hash : null;
    } else {
      studentRecord = get('SELECT id, student_id, name, password_hash FROM students WHERE id = ?', [userId]);
      currentHash = studentRecord ? studentRecord.password_hash : null;
    }

    if (!currentHash) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    const isMatch = await comparePassword(currentPassword, currentHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await hashPassword(newPassword);
    const now = Date.now();

    if (userType === 'admin') {
      run('UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?', [newHash, now, userId]);
    } else {
      run('UPDATE students SET password_hash = ?, initial_password = ?, must_change_password = 0, updated_at = ? WHERE id = ?', [newHash, newPassword, now, userId]);

      // Broadcast real-time password change event to admin portal
      broadcastEvent('student_password_changed', {
        id: studentRecord.id,
        studentId: studentRecord.student_id,
        name: studentRecord.name,
        newPassword: newPassword,
        timestamp: now
      });
    }

    run(
      'INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [`log_${crypto.randomBytes(6).toString('hex')}`, userId, userType, 'PASSWORD_CHANGE', 'User changed their password', req.ip, now]
    );

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password (Student password reset request)
router.post('/forgot-password', resetLimiter, async (req, res, next) => {
  try {
    const identifier = sanitizeString(req.body.identifier || req.body.studentId || req.body.email);
    const reason = sanitizeString(req.body.reason || 'Student requested password reset');

    if (!identifier) {
      return res.status(400).json({ error: 'Please enter your Student ID or registered email.' });
    }

    // Look up student
    const student = get(
      'SELECT id, student_id, name, is_active FROM students WHERE LOWER(student_id) = LOWER(?) OR LOWER(email) = LOWER(?)',
      [identifier, identifier]
    );

    if (student && student.is_active === 1) {
      const now = Date.now();
      const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours
      const token = crypto.randomBytes(24).toString('hex');

      // Invalidate existing pending requests for this student
      run(
        "UPDATE password_reset_requests SET status = 'expired' WHERE student_id = ? AND status = 'pending'",
        [student.id]
      );

      // Create new reset request
      const reqId = `rst_${crypto.randomBytes(6).toString('hex')}`;
      run(
        `INSERT INTO password_reset_requests (
          id, student_id, student_name, student_code, reason, status, token, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        [reqId, student.id, student.name, student.student_id, reason, token, expiresAt, now]
      );

      run(
        'INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [`log_${crypto.randomBytes(6).toString('hex')}`, student.id, 'student', 'PASSWORD_RESET_REQUESTED', 'Student submitted reset request', req.ip, now]
      );
    }

    // Always return success message to avoid account enumeration
    res.json({
      success: true,
      message: 'If your account exists in the system, a password reset request has been forwarded to the administrator. Please contact your admin for approval.'
    });
  } catch (err) {
    next(err);
  }
});

// Explicitly reject any self-registration attempt
router.post('/register', (req, res) => {
  res.status(403).json({
    error: 'Student self-registration is disabled. Student accounts must be created by an institution administrator.'
  });
});

module.exports = router;
