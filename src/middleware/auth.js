const { get, run } = require('../db');
const logger = require('../utils/logger');

const COOKIE_NAME = 'quiznest_session';

function extractSessionToken(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}

function authenticateSession(req, res, next) {
  const token = extractSessionToken(req);
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const now = Date.now();
    const session = get('SELECT * FROM sessions WHERE id = ? AND expires_at > ?', [token, now]);
    if (!session) {
      req.user = null;
      return next();
    }

    if (session.user_type === 'admin') {
      const admin = get(
        `SELECT id, username, name, email, employee_id, designation, department,
                college_name, phone, qualification
         FROM admins WHERE id = ?`,
        [session.user_id]
      );
      if (admin) {
        req.user = {
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
        };
        req.sessionId = session.id;
      } else {
        req.user = null;
      }
    } else if (session.user_type === 'student') {
      const student = get(
        `SELECT id, student_id, name, email, phone, college_id, college_name,
                roll_number, course, year, father_name, mother_name, profile_photo,
                is_active, verified, must_change_password
         FROM students WHERE id = ?`,
        [session.user_id]
      );
      if (student && student.is_active === 1) {
        req.user = {
          id: student.id,
          studentId: student.student_id,
          name: student.name,
          email: student.email,
          phone: student.phone,
          collegeId: student.college_id,
          collegeName: student.college_name,
          rollNumber: student.roll_number,
          course: student.course,
          year: student.year,
          fatherName: student.father_name,
          motherName: student.mother_name,
          profilePhoto: student.profile_photo,
          mustChangePassword: !!student.must_change_password,
          userType: 'student'
        };
        req.sessionId = session.id;
      } else {
        // Disabled student or deleted account
        req.user = null;
      }
    } else {
      req.user = null;
    }
  } catch (err) {
    logger.error('Error in authenticateSession:', err);
    req.user = null;
  }

  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required. Please log in.'
    });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required. Please log in.'
    });
  }
  if (req.user.userType !== 'admin') {
    return res.status(403).json({
      error: 'Access denied. Administrator privileges required.'
    });
  }
  next();
}

function requireStudent(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required. Please log in.'
    });
  }
  if (req.user.userType !== 'student') {
    return res.status(403).json({
      error: 'Access denied. Student access required.'
    });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  authenticateSession,
  requireAuth,
  requireAdmin,
  requireStudent
};
