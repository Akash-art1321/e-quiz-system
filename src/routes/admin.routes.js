const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { get, query, run, transaction } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { hashPassword, validatePasswordStrength } = require('../utils/password');
const {
  validateStudentInput,
  validateQuizInput,
  sanitizeString,
  isValidEmail,
  isValidPhone
} = require('../utils/validator');
const logger = require('../utils/logger');
const { addClient, broadcastEvent } = require('../utils/realtime');

const router = express.Router();

// Enforce admin privileges for all endpoints in this router
router.use(requireAdmin);

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

// -------------------------------------------------------------
// DOWNLOAD SAMPLE QUESTION PAPER PDF FORMAT
// -------------------------------------------------------------
router.get('/sample-question-paper.pdf', (req, res, next) => {
  try {
    const filePath = path.resolve(__dirname, '../../public/downloads/quiznest_sample_question_paper.pdf');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="quiznest_sample_question_paper.pdf"');
      return res.sendFile(filePath);
    }
    res.status(404).json({ error: 'Sample question paper PDF not found.' });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// REAL-TIME SERVER-SENT EVENTS (SSE) STREAM FOR ADMIN PORTAL
// -------------------------------------------------------------
router.get('/live-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
  res.write(': connected\n\n');
  addClient(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (e) {
      clearInterval(keepAlive);
    }
  }, 25000);

  res.on('close', () => {
    clearInterval(keepAlive);
  });
});

// -------------------------------------------------------------
// OVERVIEW & DASHBOARD STATS
// -------------------------------------------------------------
router.get('/overview', (req, res, next) => {
  try {
    const quizzesCount = get('SELECT COUNT(*) as count FROM quizzes').count;
    const studentsTotal = get('SELECT COUNT(*) as count FROM students').count;
    const studentsActive = get('SELECT COUNT(*) as count FROM students WHERE is_active = 1').count;
    const attemptsCount = get("SELECT COUNT(*) as count FROM attempts WHERE status = 'completed'").count;

    const avgScoreObj = get("SELECT COALESCE(AVG(percentage), 0) as avg FROM attempts WHERE status = 'completed'");
    const avgScore = Math.round(avgScoreObj.avg);

    const activeAlerts = get('SELECT COUNT(*) as count FROM alerts WHERE resolved = 0').count;
    const pendingResetRequests = get("SELECT COUNT(*) as count FROM password_reset_requests WHERE status = 'pending'").count;
    const pendingEvaluations = get("SELECT COUNT(*) as count FROM attempts WHERE (needs_manual_evaluation = 1 OR evaluation_status IN ('pending', 'pending_review')) AND (status = 'completed' OR status = 'terminated_cheating')").count;

    const recentAttempts = query(
      `SELECT a.id, a.student_name, a.student_code, a.score, a.max_score,
              a.percentage, a.tab_switches, a.flagged_for_cheating, a.submitted_at,
              q.title as quiz_title
       FROM attempts a
       LEFT JOIN quizzes q ON a.quiz_id = q.id
       WHERE a.status = 'completed'
       ORDER BY a.submitted_at DESC
       LIMIT 6`
    );

    const recentAlerts = query(
      `SELECT id, student_name, quiz_title, event_type, switch_count, last_time, resolved
       FROM alerts
       WHERE resolved = 0
       ORDER BY last_time DESC
       LIMIT 5`
    );

    res.json({
      success: true,
      stats: {
        totalQuizzes: quizzesCount,
        totalStudents: studentsTotal,
        activeStudents: studentsActive,
        totalAttempts: attemptsCount,
        averageScore: avgScore,
        activeAlerts,
        pendingResetRequests,
        pendingEvaluations
      },
      recentAttempts: recentAttempts.map(a => ({
        id: a.id,
        studentName: a.student_name,
        studentCode: a.student_code,
        quizTitle: a.quiz_title || 'Quiz',
        score: a.score,
        maxScore: a.max_score,
        percentage: a.percentage,
        switches: a.tab_switches,
        flagged: !!a.flagged_for_cheating,
        date: a.submitted_at
      })),
      recentAlerts
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// STUDENT MANAGEMENT
// -------------------------------------------------------------

// GET /api/admin/students - List students
router.get('/students', (req, res, next) => {
  try {
    const search = sanitizeString(req.query.search || '');
    const college = sanitizeString(req.query.college || '');
    const status = sanitizeString(req.query.status || '');

    let sql = `
      SELECT s.id, s.student_id, s.name, s.email, s.phone, s.college_id, s.college_name,
             s.roll_number, s.course, s.year, s.is_active, s.verified, s.created_at,
             s.initial_password,
             (SELECT COUNT(*) FROM attempts WHERE student_id = s.id AND status = 'completed') as attempt_count,
             (SELECT COALESCE(AVG(percentage), 0) FROM attempts WHERE student_id = s.id AND status = 'completed') as avg_score
      FROM students s
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ' AND (LOWER(s.name) LIKE ? OR LOWER(s.student_id) LIKE ? OR LOWER(s.email) LIKE ? OR LOWER(s.roll_number) LIKE ?)';
      const sTerm = `%${search.toLowerCase()}%`;
      params.push(sTerm, sTerm, sTerm, sTerm);
    }

    if (college) {
      sql += ' AND (s.college_id = ? OR s.college_name = ?)';
      params.push(college, college);
    }

    if (status === 'active') {
      sql += ' AND s.is_active = 1';
    } else if (status === 'disabled') {
      sql += ' AND s.is_active = 0';
    }

    sql += ' ORDER BY s.created_at DESC';

    const students = query(sql, params);

    res.json({
      success: true,
      students: students.map(s => ({
        id: s.id,
        studentId: s.student_id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        collegeId: s.college_id,
        collegeName: s.college_name,
        rollNumber: s.roll_number,
        course: s.course,
        year: s.year,
        initialPassword: s.initial_password || null,
        isActive: !!s.is_active,
        verified: !!s.verified,
        attemptCount: s.attempt_count,
        avgScore: Math.round(s.avg_score),
        createdAt: s.created_at
      }))
    });
  } catch (err) {
    next(err);
  }
});

// Helper: Automatically generate next unique Student ID / Institution Code
function generateNextStudentId() {
  const currentYear = new Date().getFullYear();
  const prefix = `STU${currentYear}`;

  const rows = query(
    `SELECT student_id FROM students WHERE student_id LIKE ?`,
    [`${prefix}%`]
  );

  let maxNum = 0;
  for (const row of rows) {
    const match = String(row.student_id).match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  let nextNum = maxNum + 1;
  let candidateId = `${prefix}${String(nextNum).padStart(3, '0')}`;

  // Collision safety loop
  while (get('SELECT id FROM students WHERE LOWER(student_id) = LOWER(?)', [candidateId])) {
    nextNum++;
    candidateId = `${prefix}${String(nextNum).padStart(3, '0')}`;
  }

  return candidateId;
}

// GET /api/admin/students/next-id - Preview next auto-generated Student ID
router.get('/students/next-id', (req, res, next) => {
  try {
    const nextStudentId = generateNextStudentId();
    res.json({
      success: true,
      nextStudentId
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/students - Create Student Account (Only Admin Can Create!)
// Student ID / Institution Code is AUTOMATICALLY generated by the system if omitted or left blank!
router.post('/students', async (req, res, next) => {
  try {
    const { studentId, name, initialPassword, email, phone, collegeName, rollNumber, course, year } = req.body;

    let cleanStudentId = sanitizeString(studentId, 32);
    if (!cleanStudentId || cleanStudentId.toUpperCase() === 'AUTO') {
      cleanStudentId = generateNextStudentId();
    } else {
      // Uniqueness check for custom provided student_id
      const existing = get('SELECT id FROM students WHERE LOWER(student_id) = LOWER(?)', [cleanStudentId]);
      if (existing) {
        return res.status(400).json({ error: `A student with Student ID "${cleanStudentId}" already exists.` });
      }
    }

    const validation = validateStudentInput({ studentId: cleanStudentId, name, initialPassword, email, phone });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join('. ') });
    }

    const cleanName = sanitizeString(name, 100);
    const cleanEmail = email ? sanitizeString(email, 120).toLowerCase() : null;
    const cleanPhone = phone ? sanitizeString(phone, 20) : null;
    const cleanCollege = sanitizeString(collegeName, 120);
    const cleanRoll = sanitizeString(rollNumber, 50);
    const cleanCourse = sanitizeString(course, 100);
    const cleanYear = sanitizeString(year, 50);

    // Check optional email uniqueness
    if (cleanEmail) {
      const emailExisting = get('SELECT id FROM students WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
      if (emailExisting) {
        return res.status(400).json({ error: `A student with email "${cleanEmail}" already exists.` });
      }
    }

    const passwordHash = await hashPassword(initialPassword);
    const stuDbId = uid('stu');
    const now = Date.now();

    run(
      `INSERT INTO students (
        id, student_id, name, password_hash, initial_password, email, phone, college_name,
        roll_number, course, year, is_active, verified, must_change_password, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?)`,
      [
        stuDbId,
        cleanStudentId,
        cleanName,
        passwordHash,
        initialPassword,
        cleanEmail,
        cleanPhone,
        cleanCollege || 'General',
        cleanRoll || null,
        cleanCourse || null,
        cleanYear || null,
        now,
        now
      ]
    );

    run(
      'INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid('log'), req.user.id, 'admin', 'STUDENT_CREATE', `Created student ${cleanStudentId} (${cleanName})`, req.ip, now]
    );

    // Broadcast live event to admin portal
    broadcastEvent('student_created', {
      id: stuDbId,
      studentId: cleanStudentId,
      name: cleanName,
      initialPassword: initialPassword,
      email: cleanEmail,
      collegeName: cleanCollege,
      rollNumber: cleanRoll,
      course: cleanCourse,
      year: cleanYear,
      timestamp: now
    });

    res.status(201).json({
      success: true,
      message: 'Student account created successfully.',
      student: {
        id: stuDbId,
        studentId: cleanStudentId,
        name: cleanName,
        initialPassword: initialPassword,
        email: cleanEmail,
        collegeName: cleanCollege,
        rollNumber: cleanRoll,
        course: cleanCourse,
        year: cleanYear
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/students/:id - Get student details & history
router.get('/students/:id', (req, res, next) => {
  try {
    const student = get('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const attempts = query(
      `SELECT a.id, a.quiz_id, a.score, a.max_score, a.percentage, a.tab_switches,
              a.flagged_for_cheating, a.time_taken, a.status, a.submitted_at,
              q.title as quiz_title
       FROM attempts a
       LEFT JOIN quizzes q ON a.quiz_id = q.id
       WHERE a.student_id = ?
       ORDER BY a.submitted_at DESC`,
      [student.id]
    );

    const alerts = query(
      `SELECT id, quiz_title, event_type, switch_count, last_time, resolved
       FROM alerts
       WHERE student_id = ?
       ORDER BY last_time DESC`,
      [student.id]
    );

    res.json({
      success: true,
      student: {
        id: student.id,
        studentId: student.student_id,
        name: student.name,
        email: student.email,
        phone: student.phone,
        collegeName: student.college_name,
        rollNumber: student.roll_number,
        course: student.course,
        year: student.year,
        fatherName: student.father_name || '',
        motherName: student.mother_name || '',
        profilePhoto: student.profile_photo,
        initialPassword: student.initial_password || null,
        isActive: !!student.is_active,
        verified: !!student.verified,
        createdAt: student.created_at
      },
      attempts: attempts.map(a => ({
        id: a.id,
        quizTitle: a.quiz_title || 'Quiz',
        score: a.score,
        maxScore: a.max_score,
        percentage: a.percentage,
        switches: a.tab_switches,
        flagged: !!a.flagged_for_cheating,
        timeTaken: a.time_taken,
        status: a.status,
        date: a.submitted_at
      })),
      alerts
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/students/:id - Edit student
router.put('/students/:id', (req, res, next) => {
  try {
    const studentId = req.params.id;
    const existing = get('SELECT id FROM students WHERE id = ?', [studentId]);
    if (!existing) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const { name, email, phone, collegeName, rollNumber, course, year, isActive } = req.body;

    const cleanName = sanitizeString(name, 100);
    const cleanEmail = email ? sanitizeString(email, 120).toLowerCase() : null;
    const cleanPhone = phone ? sanitizeString(phone, 20) : null;
    const cleanCollege = sanitizeString(collegeName, 120);
    const cleanRoll = sanitizeString(rollNumber, 50);
    const cleanCourse = sanitizeString(course, 100);
    const cleanYear = sanitizeString(year, 50);

    if (cleanEmail && !isValidEmail(cleanEmail)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }
    if (cleanPhone && !isValidPhone(cleanPhone)) {
      return res.status(400).json({ error: 'Invalid phone number.' });
    }

    const now = Date.now();
    run(
      `UPDATE students
       SET name = COALESCE(?, name),
           email = COALESCE(?, email),
           phone = COALESCE(?, phone),
           college_name = COALESCE(?, college_name),
           roll_number = COALESCE(?, roll_number),
           course = COALESCE(?, course),
           year = COALESCE(?, year),
           is_active = COALESCE(?, is_active),
           updated_at = ?
       WHERE id = ?`,
      [
        cleanName || null,
        cleanEmail,
        cleanPhone,
        cleanCollege || null,
        cleanRoll || null,
        cleanCourse || null,
        cleanYear || null,
        isActive !== undefined ? (isActive ? 1 : 0) : null,
        now,
        studentId
      ]
    );

    res.json({ success: true, message: 'Student details updated successfully.' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/students/:id/status - Enable or disable student
router.patch('/students/:id/status', (req, res, next) => {
  try {
    const student = get('SELECT id, student_id, is_active FROM students WHERE id = ?', [req.params.id]);
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const newStatus = req.body.isActive !== undefined ? (req.body.isActive ? 1 : 0) : (student.is_active ? 0 : 1);
    const now = Date.now();

    run('UPDATE students SET is_active = ?, updated_at = ? WHERE id = ?', [newStatus, now, student.id]);

    // If disabled, delete any active sessions
    if (newStatus === 0) {
      run("DELETE FROM sessions WHERE user_id = ? AND user_type = 'student'", [student.id]);
    }

    run(
      'INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid('log'), req.user.id, 'admin', 'STUDENT_STATUS_CHANGE', `${newStatus ? 'Enabled' : 'Disabled'} student ${student.student_id}`, req.ip, now]
    );

    res.json({
      success: true,
      message: `Student account ${newStatus ? 'enabled' : 'disabled'} successfully.`,
      isActive: newStatus === 1
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/students/:id/reset-password - Admin directly resets password
router.post('/students/:id/reset-password', async (req, res, next) => {
  try {
    const student = get('SELECT id, student_id, name FROM students WHERE id = ?', [req.params.id]);
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const { newPassword } = req.body;
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return res.status(400).json({ error: strength.message });
    }

    const newHash = await hashPassword(newPassword);
    const now = Date.now();

    transaction(() => {
      run('UPDATE students SET password_hash = ?, initial_password = ?, must_change_password = 0, updated_at = ? WHERE id = ?', [newHash, newPassword, now, student.id]);
      // Close any pending reset requests
      run("UPDATE password_reset_requests SET status = 'approved', resolved_at = ?, resolved_by = ? WHERE student_id = ? AND status = 'pending'", [now, req.user.id, student.id]);
      // Revoke student sessions so they must re-login
      run("DELETE FROM sessions WHERE user_id = ? AND user_type = 'student'", [student.id]);
    });

    run(
      'INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid('log'), req.user.id, 'admin', 'ADMIN_RESET_PASSWORD', `Admin reset password for student ${student.student_id}`, req.ip, now]
    );

    // Broadcast live password change to admin portal
    broadcastEvent('student_password_changed', {
      id: student.id,
      studentId: student.student_id,
      name: student.name,
      newPassword: newPassword,
      timestamp: now
    });

    res.json({
      success: true,
      message: `Password for ${student.name} (${student.student_id}) has been updated.`
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/students/:id - Delete student
router.delete('/students/:id', (req, res, next) => {
  try {
    const student = get('SELECT id, student_id, name FROM students WHERE id = ?', [req.params.id]);
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    transaction(() => {
      run("DELETE FROM sessions WHERE user_id = ? AND user_type = 'student'", [student.id]);
      run('DELETE FROM students WHERE id = ?', [student.id]);
    });

    // Broadcast student deletion to admin portal
    broadcastEvent('student_deleted', {
      id: student.id,
      studentId: student.student_id
    });

    res.json({ success: true, message: `Student ${student.name} (${student.student_id}) was deleted.` });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// PASSWORD RESET REQUESTS
// -------------------------------------------------------------
router.get('/reset-requests', (req, res, next) => {
  try {
    const requests = query(
      `SELECT r.id, r.student_id, r.student_name, r.student_code, r.reason,
              r.status, r.expires_at, r.created_at, r.resolved_at,
              s.email as student_email, s.college_name as student_college
       FROM password_reset_requests r
       LEFT JOIN students s ON r.student_id = s.id
       ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC`
    );

    res.json({
      success: true,
      requests: requests.map(r => ({
        id: r.id,
        studentId: r.student_id,
        studentName: r.student_name,
        studentCode: r.student_code,
        email: r.student_email,
        college: r.student_college,
        reason: r.reason,
        status: r.status,
        expiresAt: r.expires_at,
        isExpired: Date.now() > r.expires_at && r.status === 'pending',
        createdAt: r.created_at,
        resolvedAt: r.resolved_at
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-requests/:id/approve', async (req, res, next) => {
  try {
    const reqId = req.params.id;
    const { newPassword } = req.body;

    const request = get('SELECT * FROM password_reset_requests WHERE id = ?', [reqId]);
    if (!request) {
      return res.status(404).json({ error: 'Reset request not found.' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request has already been ${request.status}.` });
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return res.status(400).json({ error: strength.message });
    }

    const newHash = await hashPassword(newPassword);
    const now = Date.now();

    transaction(() => {
      run('UPDATE students SET password_hash = ?, initial_password = ?, must_change_password = 0, updated_at = ? WHERE id = ?', [newHash, newPassword, now, request.student_id]);
      run("UPDATE password_reset_requests SET status = 'approved', resolved_at = ?, resolved_by = ? WHERE id = ?", [now, req.user.id, reqId]);
      run("DELETE FROM sessions WHERE user_id = ? AND user_type = 'student'", [request.student_id]);
    });

    run(
      'INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid('log'), req.user.id, 'admin', 'RESET_REQUEST_APPROVED', `Approved password reset for ${request.student_code}`, req.ip, now]
    );

    // Broadcast live password change to admin portal
    broadcastEvent('student_password_changed', {
      id: request.student_id,
      studentId: request.student_code,
      name: request.student_name,
      newPassword: newPassword,
      timestamp: now
    });

    res.json({
      success: true,
      message: `Password reset approved. New credentials set for student ${request.student_name} (${request.student_code}).`
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-requests/:id/reject', (req, res, next) => {
  try {
    const reqId = req.params.id;
    const request = get('SELECT * FROM password_reset_requests WHERE id = ?', [reqId]);
    if (!request) {
      return res.status(404).json({ error: 'Reset request not found.' });
    }

    const now = Date.now();
    run("UPDATE password_reset_requests SET status = 'rejected', resolved_at = ?, resolved_by = ? WHERE id = ?", [now, req.user.id, reqId]);

    res.json({ success: true, message: 'Password reset request rejected.' });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// QUIZ & QUESTION MANAGEMENT
// -------------------------------------------------------------

// GET /api/admin/quizzes/:id - Get quiz with questions & correct answers
router.get('/quizzes/:id', (req, res, next) => {
  try {
    const quiz = get('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    const questions = query('SELECT * FROM questions WHERE quiz_id = ? ORDER BY q_order ASC', [quiz.id]);

    res.json({
      success: true,
      quiz: {
        id: quiz.id,
        title: quiz.title,
        category: quiz.category,
        duration: quiz.duration,
        marks: quiz.marks,
        negative: quiz.negative,
        instructions: quiz.instructions,
        isActive: !!quiz.is_active,
        allowMultipleAttempts: !!quiz.allow_multiple_attempts,
        startTime: quiz.start_time,
        endTime: quiz.end_time,
        eligibility: quiz.eligibility || 'all',
        uploadBufferMinutes: quiz.upload_buffer_minutes || 0,
        requireWebcam: quiz.require_webcam !== 0,
        requireFullscreen: quiz.require_fullscreen !== 0,
        questions: questions.map(q => ({
          id: q.id,
          text: q.text,
          qType: q.q_type || 'mcq',
          imageUrl: q.image_url || null,
          marks: q.marks !== null && q.marks !== undefined ? q.marks : null,
          options: JSON.parse(q.options || '[]'),
          correct: q.correct,
          explanation: q.explanation
        }))
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/quizzes - Create quiz
router.post('/quizzes', (req, res, next) => {
  try {
    const validation = validateQuizInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join('. ') });
    }

    const {
      title, category, duration, marks, negative, instructions,
      questions, allowMultipleAttempts, startTime, endTime, eligibility,
      uploadBufferMinutes, requireWebcam, requireFullscreen
    } = req.body;

    const quizId = uid('quiz');
    const now = Date.now();

    transaction(() => {
      run(
        `INSERT INTO quizzes (
          id, title, category, duration, marks, negative, instructions,
          is_active, allow_multiple_attempts, start_time, end_time, eligibility,
          upload_buffer_minutes, require_webcam, require_fullscreen,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quizId,
          sanitizeString(title, 150),
          sanitizeString(category || 'General', 50),
          parseInt(duration, 10),
          parseFloat(marks),
          parseFloat(negative || 0),
          instructions ? sanitizeString(instructions, 2000) : null,
          allowMultipleAttempts ? 1 : 0,
          startTime ? parseInt(startTime, 10) : null,
          endTime ? parseInt(endTime, 10) : null,
          sanitizeString(eligibility || 'all', 100),
          uploadBufferMinutes ? parseInt(uploadBufferMinutes, 10) : 0,
          requireWebcam === false ? 0 : 1,
          requireFullscreen === false ? 0 : 1,
          req.user.id,
          now,
          now
        ]
      );

      questions.forEach((q, idx) => {
        const qType = (q.qType || q.q_type || 'mcq').toLowerCase();
        const imageUrl = q.imageUrl || q.image_url || null;
        const qMarks = q.marks !== null && q.marks !== undefined && !isNaN(parseFloat(q.marks)) ? parseFloat(q.marks) : null;
        const optionsList = Array.isArray(q.options) ? q.options.map(o => sanitizeString(o, 300)) : [];
        run(
          `INSERT INTO questions (id, quiz_id, q_order, q_type, text, image_url, marks, options, correct, explanation, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uid('qq'),
            quizId,
            idx,
            qType,
            sanitizeString(q.text, 2000),
            imageUrl,
            qMarks,
            JSON.stringify(optionsList),
            parseInt(q.correct || 0, 10),
            q.explanation ? sanitizeString(q.explanation, 1000) : null,
            now
          ]
        );
      });
    });

    run(
      'INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid('log'), req.user.id, 'admin', 'QUIZ_CREATE', `Created quiz: ${title}`, req.ip, now]
    );

    res.status(201).json({
      success: true,
      message: 'Quiz created successfully.',
      quizId
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/quizzes/:id - Edit quiz
router.put('/quizzes/:id', (req, res, next) => {
  try {
    const quizId = req.params.id;
    const existing = get('SELECT id FROM quizzes WHERE id = ?', [quizId]);
    if (!existing) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    const validation = validateQuizInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join('. ') });
    }

    const {
      title, category, duration, marks, negative, instructions,
      questions, allowMultipleAttempts, startTime, endTime, eligibility,
      uploadBufferMinutes, requireWebcam, requireFullscreen
    } = req.body;
    const now = Date.now();

    transaction(() => {
      run(
        `UPDATE quizzes
         SET title = ?, category = ?, duration = ?, marks = ?, negative = ?,
             instructions = ?, allow_multiple_attempts = ?,
             start_time = ?, end_time = ?, eligibility = ?,
             upload_buffer_minutes = ?, require_webcam = ?, require_fullscreen = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          sanitizeString(title, 150),
          sanitizeString(category || 'General', 50),
          parseInt(duration, 10),
          parseFloat(marks),
          parseFloat(negative || 0),
          instructions ? sanitizeString(instructions, 2000) : null,
          allowMultipleAttempts ? 1 : 0,
          startTime ? parseInt(startTime, 10) : null,
          endTime ? parseInt(endTime, 10) : null,
          sanitizeString(eligibility || 'all', 100),
          uploadBufferMinutes ? parseInt(uploadBufferMinutes, 10) : 0,
          requireWebcam === false ? 0 : 1,
          requireFullscreen === false ? 0 : 1,
          now,
          quizId
        ]
      );

      // Intelligently synchronize questions to preserve question IDs and candidate attempts
      const currentQuestions = query('SELECT id FROM questions WHERE quiz_id = ?', [quizId]);
      const currentIdSet = new Set(currentQuestions.map(q => q.id));
      const incomingIdSet = new Set(questions.filter(q => q.id && currentIdSet.has(q.id)).map(q => q.id));

      // 1. Delete questions that were removed
      for (const cur of currentQuestions) {
        if (!incomingIdSet.has(cur.id)) {
          run('DELETE FROM questions WHERE id = ?', [cur.id]);
        }
      }

      // 2. Update existing questions or Insert new ones
      questions.forEach((q, idx) => {
        const qType = (q.qType || q.q_type || 'mcq').toLowerCase();
        const imageUrl = q.imageUrl || q.image_url || null;
        const qMarks = q.marks !== null && q.marks !== undefined && !isNaN(parseFloat(q.marks)) ? parseFloat(q.marks) : null;
        const optionsList = Array.isArray(q.options) ? q.options.map(o => sanitizeString(o, 300)) : [];

        if (q.id && currentIdSet.has(q.id)) {
          run(
            `UPDATE questions
             SET q_order = ?, q_type = ?, text = ?, image_url = ?, marks = ?, options = ?, correct = ?, explanation = ?
             WHERE id = ? AND quiz_id = ?`,
            [
              idx,
              qType,
              sanitizeString(q.text, 2000),
              imageUrl,
              qMarks,
              JSON.stringify(optionsList),
              parseInt(q.correct || 0, 10),
              q.explanation ? sanitizeString(q.explanation, 1000) : null,
              q.id,
              quizId
            ]
          );
        } else {
          run(
            `INSERT INTO questions (id, quiz_id, q_order, q_type, text, image_url, marks, options, correct, explanation, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              uid('qq'),
              quizId,
              idx,
              qType,
              sanitizeString(q.text, 2000),
              imageUrl,
              qMarks,
              JSON.stringify(optionsList),
              parseInt(q.correct || 0, 10),
              q.explanation ? sanitizeString(q.explanation, 1000) : null,
              now
            ]
          );
        }
      });
    });

    res.json({ success: true, message: 'Quiz updated successfully.' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/quizzes/:id - Delete quiz
router.delete('/quizzes/:id', (req, res, next) => {
  try {
    const quizId = req.params.id;
    const quiz = get('SELECT id, title FROM quizzes WHERE id = ?', [quizId]);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    run('DELETE FROM quizzes WHERE id = ?', [quizId]);

    res.json({ success: true, message: `Quiz "${quiz.title}" and its records have been removed.` });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/quizzes/:id/status - Toggle active/inactive
router.patch('/quizzes/:id/status', (req, res, next) => {
  try {
    const quiz = get('SELECT id, is_active FROM quizzes WHERE id = ?', [req.params.id]);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    const nextStatus = quiz.is_active ? 0 : 1;
    run('UPDATE quizzes SET is_active = ?, updated_at = ? WHERE id = ?', [nextStatus, Date.now(), quiz.id]);

    res.json({ success: true, isActive: nextStatus === 1 });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/quizzes/:id/results - Quiz results leaderboard
router.get('/quizzes/:id/results', (req, res, next) => {
  try {
    const quizId = req.params.id;
    const attempts = query(
      `SELECT a.id, a.student_name, a.student_code, a.score, a.max_score,
              a.percentage, a.correct_count, a.wrong_count, a.skipped_count,
              a.time_taken, a.tab_switches, a.flagged_for_cheating, a.submitted_at,
              a.needs_manual_evaluation, a.evaluation_status,
              s.email as student_email, s.college_name as student_college,
              s.course as student_course, s.roll_number as student_roll
       FROM attempts a
       LEFT JOIN students s ON a.student_id = s.id
       WHERE a.quiz_id = ? AND (a.status = 'completed' OR a.status = 'terminated_cheating')
       ORDER BY a.score DESC, a.time_taken ASC`,
      [quizId]
    );

    res.json({
      success: true,
      results: attempts.map((a, idx) => ({
        rank: idx + 1,
        id: a.id,
        studentName: a.student_name,
        studentCode: a.student_code,
        rollNumber: a.student_roll || a.student_code,
        course: a.student_course || 'General',
        email: a.student_email,
        college: a.student_college,
        score: a.score,
        maxScore: a.max_score,
        percentage: a.percentage,
        correct: a.correct_count,
        wrong: a.wrong_count,
        skipped: a.skipped_count,
        timeTaken: a.time_taken,
        tabSwitches: a.tab_switches,
        flaggedForCheating: !!a.flagged_for_cheating,
        needsManualEvaluation: !!a.needs_manual_evaluation,
        evaluationStatus: a.evaluation_status || 'auto_graded',
        date: a.submitted_at
      }))
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/quizzes/:id/export-csv - Download results as CSV (Excel compatible)
router.get('/quizzes/:id/export-csv', (req, res, next) => {
  try {
    const quizId = req.params.id;
    const quiz = get('SELECT id, title FROM quizzes WHERE id = ?', [quizId]);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    const attempts = query(
      `SELECT a.id, a.student_name, a.student_code, a.score, a.max_score,
              a.percentage, a.correct_count, a.wrong_count, a.skipped_count,
              a.time_taken, a.tab_switches, a.flagged_for_cheating, a.submitted_at,
              s.email as student_email, s.college_name as student_college,
              s.course as student_course, s.roll_number as student_roll
       FROM attempts a
       LEFT JOIN students s ON a.student_id = s.id
       WHERE a.quiz_id = ? AND a.status = 'completed'
       ORDER BY a.score DESC, a.time_taken ASC`,
      [quizId]
    );

    const safeTitle = quiz.title.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_results.csv"`);

    // UTF-8 BOM for Microsoft Excel auto-detecting encoding
    let csv = '\uFEFF';
    csv += 'Rank,Student Name,Student ID,Roll Number,Course / Branch,College,Score,Max Score,Percentage (%),Correct,Wrong,Skipped,Time Taken (Mins),Cheating Flags,Tab Switches,Submitted At\r\n';

    attempts.forEach((a, idx) => {
      const rank = idx + 1;
      const name = `"${(a.student_name || '').replace(/"/g, '""')}"`;
      const idCode = `"${(a.student_code || '').replace(/"/g, '""')}"`;
      const roll = `"${(a.student_roll || '-').replace(/"/g, '""')}"`;
      const course = `"${(a.student_course || 'General').replace(/"/g, '""')}"`;
      const college = `"${(a.student_college || 'General').replace(/"/g, '""')}"`;
      const score = a.score ?? 0;
      const maxScore = a.max_score ?? 0;
      const pct = (a.percentage ?? 0) + '%';
      const correct = a.correct_count ?? 0;
      const wrong = a.wrong_count ?? 0;
      const skipped = a.skipped_count ?? 0;
      const mins = (Math.round((a.time_taken || 0) / 60 * 10) / 10).toFixed(1);
      const cheating = a.flagged_for_cheating ? 'YES (FLAGGED)' : 'NO';
      const switches = a.tab_switches ?? 0;
      const date = a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '-';

      csv += `${rank},${name},${idCode},${roll},${course},${college},${score},${maxScore},${pct},${correct},${wrong},${skipped},${mins},${cheating},${switches},"${date}"\r\n`;
    });

    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// CHEATING & SECURITY ALERTS
// -------------------------------------------------------------
router.get('/alerts', (req, res, next) => {
  try {
    const alerts = query(
      `SELECT a.id, a.attempt_id, a.student_id, a.student_name, a.quiz_id, a.quiz_title,
              a.event_type, a.switch_count, a.snapshot_url, a.first_time, a.last_time, a.resolved,
              s.student_id as student_code, s.email as student_email,
              COALESCE(att.is_blocked, 0) as attempt_is_blocked,
              att.status as attempt_status
       FROM alerts a
       LEFT JOIN students s ON a.student_id = s.id
       LEFT JOIN attempts att ON (
         (a.attempt_id IS NOT NULL AND a.attempt_id = att.id) OR
         (a.attempt_id IS NULL AND a.student_id = att.student_id AND a.quiz_id = att.quiz_id AND att.status = 'in_progress')
       )
       ORDER BY a.resolved ASC, a.last_time DESC`
    );

    res.json({
      success: true,
      alerts: alerts.map(al => ({
        id: al.id,
        attemptId: al.attempt_id,
        studentId: al.student_id,
        studentName: al.student_name,
        studentCode: al.student_code,
        studentEmail: al.student_email,
        quizId: al.quiz_id,
        quizTitle: al.quiz_title,
        eventType: al.event_type,
        count: al.switch_count,
        snapshotUrl: al.snapshot_url || null,
        firstTime: al.first_time,
        lastTime: al.last_time,
        resolved: !!al.resolved,
        isBlocked: al.attempt_is_blocked === 1,
        attemptStatus: al.attempt_status || 'in_progress'
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/alerts/:id/resolve', (req, res, next) => {
  try {
    const alertId = req.params.id;
    const now = Date.now();
    const alert = get('SELECT resolved FROM alerts WHERE id = ?', [alertId]);
    if (!alert) return res.status(404).json({ error: 'Alert not found.' });

    let targetResolved = 1;
    if (req.body && req.body.resolved !== undefined) {
      targetResolved = req.body.resolved ? 1 : 0;
    } else {
      targetResolved = alert.resolved ? 0 : 1;
    }

    run('UPDATE alerts SET resolved = ?, resolved_at = ?, resolved_by = ? WHERE id = ?', [
      targetResolved,
      targetResolved ? now : null,
      targetResolved ? req.user.id : null,
      alertId
    ]);

    res.json({
      success: true,
      resolved: targetResolved === 1,
      message: targetResolved ? 'Alert marked as resolved.' : 'Alert re-opened for review.'
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/alerts/:id/unblock - Unblock the student's attempt (admin only)
router.patch('/alerts/:id/unblock', (req, res, next) => {
  try {
    const alertId = req.params.id;
    const now = Date.now();

    // Get the alert to find the attempt
    const alert = get('SELECT attempt_id, student_id FROM alerts WHERE id = ?', [alertId]);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found.' });

    if (alert.attempt_id) {
      run('UPDATE attempts SET is_blocked = 0 WHERE id = ?', [alert.attempt_id]);
    }
    if (alert.student_id) {
      run("UPDATE attempts SET is_blocked = 0 WHERE student_id = ? AND status = 'in_progress'", [alert.student_id]);
    }

    res.json({ success: true, message: 'Student unblocked successfully. Exam can resume.' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/alerts/:id/block - Re-block or lock student's exam attempt (admin only)
router.patch('/alerts/:id/block', (req, res, next) => {
  try {
    const alertId = req.params.id;

    const alert = get('SELECT attempt_id, student_id FROM alerts WHERE id = ?', [alertId]);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found.' });

    if (alert.attempt_id) {
      run('UPDATE attempts SET is_blocked = 1 WHERE id = ?', [alert.attempt_id]);
    }
    if (alert.student_id) {
      run("UPDATE attempts SET is_blocked = 1 WHERE student_id = ? AND status = 'in_progress'", [alert.student_id]);
    }

    res.json({ success: true, message: 'Student exam has been locked/blocked.' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/students/:id/unblock-exam - Unblock all active exam attempts for a student
router.patch('/students/:id/unblock-exam', (req, res, next) => {
  try {
    const studentId = req.params.id;
    run("UPDATE attempts SET is_blocked = 0 WHERE student_id = ? AND status = 'in_progress'", [studentId]);
    run('UPDATE alerts SET resolved = 1 WHERE student_id = ?', [studentId]);
    res.json({ success: true, message: 'All exam attempts unblocked for this student.' });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// MANUAL EVALUATION FOR WRITTEN / SUBJECTIVE EXAMS
// -------------------------------------------------------------

// GET /api/admin/evaluations - List student attempts with written answers requiring checking
router.get('/evaluations', (req, res, next) => {
  try {
    const { quizId, status, search } = req.query;

    let baseWhere = `
      (a.status = 'completed' OR a.status = 'terminated_cheating')
      AND (
        a.needs_manual_evaluation = 1 
        OR a.evaluation_status IN ('pending', 'pending_review', 'evaluated')
        OR EXISTS (
          SELECT 1 FROM answers ans2 
          JOIN questions q3 ON ans2.question_id = q3.id 
          WHERE ans2.attempt_id = a.id AND (q3.q_type = 'written' OR q3.q_type = 'subjective')
        )
      )
    `;

    let sql = `
      SELECT a.id, a.quiz_id, a.student_id, a.score, a.max_score, a.percentage,
             a.needs_manual_evaluation, a.evaluation_status, a.submitted_at, a.time_taken,
             a.tab_switches, a.flagged_for_cheating,
             q.title as quiz_title,
             s.name as student_name, s.student_id as student_code, s.course as student_course, s.roll_number as student_roll,
             (SELECT COUNT(*) FROM answers ans JOIN questions q2 ON ans.question_id = q2.id WHERE ans.attempt_id = a.id AND (q2.q_type = 'written' OR q2.q_type = 'subjective')) as written_count,
             (SELECT COUNT(*) FROM answers ans WHERE ans.attempt_id = a.id AND ans.attachment_url IS NOT NULL AND ans.attachment_url != '') as attachment_count
      FROM attempts a
      JOIN quizzes q ON a.quiz_id = q.id
      JOIN students s ON a.student_id = s.id
      WHERE ${baseWhere}
    `;
    const params = [];

    if (quizId && quizId !== 'all') {
      sql += ' AND a.quiz_id = ?';
      params.push(quizId);
    }

    if (status === 'pending') {
      sql += " AND (a.needs_manual_evaluation = 1 OR a.evaluation_status IN ('pending', 'pending_review'))";
    } else if (status === 'evaluated') {
      sql += " AND a.evaluation_status = 'evaluated'";
    }

    if (search && search.trim()) {
      sql += ' AND (s.name LIKE ? OR s.student_id LIKE ? OR s.roll_number LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY CASE WHEN (a.needs_manual_evaluation = 1 OR a.evaluation_status IN (\'pending\', \'pending_review\')) THEN 0 ELSE 1 END, a.submitted_at DESC';

    const attempts = query(sql, params);

    // Compute stats across all matching quiz attempts regardless of status filter
    let statsSql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN a.needs_manual_evaluation = 1 OR a.evaluation_status IN ('pending', 'pending_review') THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN a.evaluation_status = 'evaluated' THEN 1 ELSE 0 END) as evaluated
      FROM attempts a
      WHERE ${baseWhere}
    `;
    const statsParams = [];
    if (quizId && quizId !== 'all') {
      statsSql += ' AND a.quiz_id = ?';
      statsParams.push(quizId);
    }
    const statsRow = get(statsSql, statsParams) || {};
    const totalCount = Number(statsRow.total) || 0;
    const pendingCount = Number(statsRow.pending) || 0;
    const evaluatedCount = Number(statsRow.evaluated) || 0;

    const list = attempts.map(a => {
      const isPending = a.needs_manual_evaluation === 1 || a.evaluation_status === 'pending' || a.evaluation_status === 'pending_review';

      return {
        id: a.id,
        quizId: a.quiz_id,
        quizTitle: a.quiz_title,
        studentName: a.student_name,
        studentCode: a.student_code,
        studentCourse: a.student_course || 'General',
        studentRoll: a.student_roll || a.student_code,
        score: a.score,
        maxScore: a.max_score,
        percentage: a.percentage,
        timeTaken: a.time_taken,
        tabSwitches: a.tab_switches,
        flaggedForCheating: !!a.flagged_for_cheating,
        needsManualEvaluation: isPending,
        evaluationStatus: a.evaluation_status || (isPending ? 'pending' : 'evaluated'),
        writtenCount: a.written_count,
        attachmentCount: a.attachment_count,
        hasAttachment: a.attachment_count > 0,
        submittedAt: a.submitted_at
      };
    });

    res.json({
      success: true,
      evaluations: list,
      stats: {
        total: totalCount,
        pending: pendingCount,
        evaluated: evaluatedCount
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/attempts/:id/evaluation - Fetch attempt details with written answers for checking
router.get('/attempts/:id/evaluation', (req, res, next) => {
  try {
    const attemptId = req.params.id;
    const attempt = get(
      `SELECT a.*, q.title as quiz_title, q.marks as quiz_default_marks,
              s.name as student_name, s.student_id as student_code, s.course as student_course, s.roll_number as student_roll
       FROM attempts a
       JOIN quizzes q ON a.quiz_id = q.id
       JOIN students s ON a.student_id = s.id
       WHERE a.id = ?`,
      [attemptId]
    );

    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found.' });
    }

    let answers = query(
      `SELECT ans.id as answer_id, q.id as question_id, ans.selected_option, ans.written_text,
              ans.attachment_url, ans.is_correct, ans.marks_awarded, ans.feedback,
              q.text as question_text, q.q_type, q.image_url, q.marks as question_marks,
              q.options, q.correct, q.explanation, q.q_order
       FROM questions q
       LEFT JOIN answers ans ON ans.question_id = q.id AND ans.attempt_id = ?
       WHERE q.quiz_id = ?
       ORDER BY q.q_order ASC`,
      [attemptId, attempt.quiz_id]
    );

    if (answers.length === 0) {
      answers = query(
        `SELECT ans.id as answer_id, ans.question_id, ans.selected_option, ans.written_text,
                ans.attachment_url, ans.is_correct, ans.marks_awarded, ans.feedback,
                q.text as question_text, q.q_type, q.image_url, q.marks as question_marks,
                q.options, q.correct, q.explanation, q.q_order
         FROM answers ans
         JOIN questions q ON ans.question_id = q.id
         WHERE ans.attempt_id = ?
         ORDER BY q.q_order ASC`,
        [attemptId]
      );
    }

    res.json({
      success: true,
      attempt: {
        id: attempt.id,
        quizId: attempt.quiz_id,
        quizTitle: attempt.quiz_title,
        studentName: attempt.student_name,
        studentCode: attempt.student_code,
        studentCourse: attempt.student_course,
        studentRoll: attempt.student_roll,
        score: attempt.score,
        maxScore: attempt.max_score,
        percentage: attempt.percentage,
        needsManualEvaluation: !!attempt.needs_manual_evaluation,
        evaluationStatus: attempt.evaluation_status || 'auto_graded',
        submittedAt: attempt.submitted_at
      },
      answers: answers.map(a => ({
        answerId: a.answer_id || null,
        questionId: a.question_id,
        questionText: a.question_text,
        qType: a.q_type || 'mcq',
        imageUrl: a.image_url || null,
        maxMarks: (a.question_marks !== null && a.question_marks !== undefined && a.question_marks > 0) ? a.question_marks : (attempt.quiz_default_marks || 5),
        selectedOption: a.selected_option,
        writtenText: a.written_text || '',
        attachmentUrl: a.attachment_url || null,
        isCorrect: !!a.is_correct,
        marksAwarded: a.marks_awarded !== null && a.marks_awarded !== undefined ? a.marks_awarded : 0,
        feedback: a.feedback || '',
        explanation: a.explanation || ''
      }))
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/attempts/:id/evaluate - Submit manual scores & remarks for written answers
router.post('/attempts/:id/evaluate', (req, res, next) => {
  try {
    const attemptId = req.params.id;
    const { evaluations } = req.body; // Array of { answerId, questionId, marksAwarded, feedback }

    const attempt = get('SELECT * FROM attempts WHERE id = ?', [attemptId]);
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found.' });
    }

    if (!Array.isArray(evaluations)) {
      return res.status(400).json({ error: 'Evaluations array is required.' });
    }

    const now = Date.now();
    let totalScore = 0;
    let percentage = 0;

    transaction(() => {
      for (const ev of evaluations) {
        if (!ev.answerId && !ev.questionId) continue;
        const awarded = parseFloat(ev.marksAwarded) || 0;
        const feedback = ev.feedback ? sanitizeString(ev.feedback, 1000) : null;

        if (ev.answerId) {
          run(
            `UPDATE answers
             SET marks_awarded = ?, feedback = ?, evaluated_by = ?, evaluated_at = ?, is_correct = ?
             WHERE id = ? AND attempt_id = ?`,
            [awarded, feedback, req.user.id, now, awarded > 0 ? 1 : 0, ev.answerId, attemptId]
          );
        } else if (ev.questionId) {
          const existing = get('SELECT id FROM answers WHERE attempt_id = ? AND question_id = ?', [attemptId, ev.questionId]);
          if (existing) {
            run(
              `UPDATE answers
               SET marks_awarded = ?, feedback = ?, evaluated_by = ?, evaluated_at = ?, is_correct = ?
               WHERE id = ?`,
              [awarded, feedback, req.user.id, now, awarded > 0 ? 1 : 0, existing.id]
            );
          } else {
            run(
              `INSERT INTO answers (id, attempt_id, question_id, selected_option, written_text, attachment_url, is_correct, marks_awarded, feedback, evaluated_by, evaluated_at)
               VALUES (?, ?, ?, null, null, null, ?, ?, ?, ?, ?)`,
              [uid('ans'), attemptId, ev.questionId, awarded > 0 ? 1 : 0, awarded, feedback, req.user.id, now]
            );
          }
        }
      }

      // Recalculate total score and percentage across all answers
      const allAnswers = query('SELECT marks_awarded, is_correct FROM answers WHERE attempt_id = ?', [attemptId]);
      let correctCount = 0;
      for (const a of allAnswers) {
        totalScore += (a.marks_awarded || 0);
        if (a.is_correct) correctCount++;
      }

      totalScore = Math.max(0, Math.round(totalScore * 100) / 100);
      const maxScore = attempt.max_score || 1;
      percentage = Math.min(100, Math.max(0, Math.round((totalScore / maxScore) * 100)));

      run(
        `UPDATE attempts
         SET score = ?, percentage = ?, correct_count = ?,
             needs_manual_evaluation = 0, evaluation_status = 'evaluated'
         WHERE id = ?`,
        [totalScore, percentage, correctCount, attemptId]
      );
    });

    run(
      'INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid('log'), req.user.id, 'admin', 'EVALUATION_COMPLETED', `Evaluated written attempt ${attemptId}`, req.ip, now]
    );

    try {
      broadcastEvent('attempt_evaluated', { attemptId, quizId: attempt.quiz_id });
    } catch (e) {}

    res.json({
      success: true,
      message: 'Evaluation saved successfully.',
      evaluationStatus: 'evaluated',
      totalScore,
      percentage
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// COLLEGES MANAGEMENT
// -------------------------------------------------------------
router.get('/colleges', (req, res, next) => {
  try {
    const colleges = query('SELECT * FROM colleges ORDER BY name ASC');
    res.json({ success: true, colleges });
  } catch (err) {
    next(err);
  }
});

router.post('/colleges', (req, res, next) => {
  try {
    const { name, domain } = req.body;
    const cleanName = sanitizeString(name, 100);
    const cleanDomain = domain ? sanitizeString(domain, 80).toLowerCase().replace(/^@/, '') : null;

    if (!cleanName) {
      return res.status(400).json({ error: 'College name is required.' });
    }

    const existing = get('SELECT id FROM colleges WHERE LOWER(name) = LOWER(?)', [cleanName]);
    if (existing) {
      return res.status(400).json({ error: 'A college with this name already exists.' });
    }

    const colId = uid('col');
    run('INSERT INTO colleges (id, name, domain, created_at) VALUES (?, ?, ?, ?)', [
      colId,
      cleanName,
      cleanDomain,
      Date.now()
    ]);

    res.status(201).json({ success: true, college: { id: colId, name: cleanName, domain: cleanDomain } });
  } catch (err) {
    next(err);
  }
});

router.delete('/colleges/:id', (req, res, next) => {
  try {
    run('DELETE FROM colleges WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'College removed.' });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// ADMIN ACCOUNTS MANAGEMENT
// -------------------------------------------------------------
router.get('/admins', (req, res, next) => {
  try {
    const admins = query(
      `SELECT id, username, name, email, employee_id, designation, department,
              college_name, phone, qualification, joining_date, created_at
       FROM admins ORDER BY created_at ASC`
    );
    res.json({
      success: true,
      admins: admins.map(a => ({
        id: a.id,
        username: a.username,
        name: a.name,
        email: a.email,
        employeeId: a.employee_id,
        designation: a.designation,
        department: a.department,
        collegeName: a.college_name,
        phone: a.phone,
        qualification: a.qualification,
        joiningDate: a.joining_date,
        createdAt: a.created_at
      }))
    });
  } catch (err) {
    next(err);
  }
});

router.post('/admins', async (req, res, next) => {
  try {
    const {
      username, password, name, email,
      employeeId, designation, department, collegeName, phone, qualification, joiningDate
    } = req.body;

    const cleanUser = sanitizeString(username, 50);
    const cleanName = sanitizeString(name, 100);
    const cleanEmail = email ? sanitizeString(email, 120).toLowerCase() : null;
    const cleanEmpId = employeeId ? sanitizeString(employeeId, 50) : null;
    const cleanDesig = designation ? sanitizeString(designation, 100) : null;
    const cleanDept = department ? sanitizeString(department, 100) : null;
    const cleanCollege = collegeName ? sanitizeString(collegeName, 150) : null;
    const cleanPhone = phone ? sanitizeString(phone, 30) : null;
    const cleanQual = qualification ? sanitizeString(qualification, 100) : null;
    const cleanJoinDate = joiningDate ? sanitizeString(joiningDate, 50) : null;

    if (!cleanUser || !password || !cleanName) {
      return res.status(400).json({ error: 'Username, password, and faculty name are required.' });
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return res.status(400).json({ error: strength.message });
    }

    const existing = get('SELECT id FROM admins WHERE LOWER(username) = LOWER(?)', [cleanUser]);
    if (existing) {
      return res.status(400).json({ error: 'Username already in use by another administrator.' });
    }

    if (cleanEmpId) {
      const existingEmp = get('SELECT id FROM admins WHERE LOWER(employee_id) = LOWER(?)', [cleanEmpId]);
      if (existingEmp) {
        return res.status(400).json({ error: `Faculty Employee ID "${cleanEmpId}" is already registered.` });
      }
    }

    const passwordHash = await hashPassword(password);
    const adminId = uid('adm');
    const now = Date.now();

    run(
      `INSERT INTO admins (
        id, username, password_hash, name, email,
        employee_id, designation, department, college_name, phone, qualification, joining_date,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adminId, cleanUser, passwordHash, cleanName, cleanEmail,
        cleanEmpId, cleanDesig, cleanDept, cleanCollege, cleanPhone, cleanQual, cleanJoinDate,
        now, now
      ]
    );

    // Audit log
    run(
      'INSERT INTO audit_logs (id, user_id, user_type, action, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid('log'), req.user.id, 'admin', 'ADMIN_CREATED', `Enrolled faculty administrator ${cleanName} (${cleanUser})`, req.ip, now]
    );

    res.status(201).json({
      success: true,
      message: 'Faculty administrator account created successfully.',
      admin: {
        id: adminId,
        username: cleanUser,
        name: cleanName,
        email: cleanEmail,
        employeeId: cleanEmpId,
        designation: cleanDesig,
        department: cleanDept,
        collegeName: cleanCollege,
        phone: cleanPhone,
        qualification: cleanQual,
        joiningDate: cleanJoinDate
      }
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/admins/:id', (req, res, next) => {
  try {
    const adminId = req.params.id;

    if (adminId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account while logged in.' });
    }

    const totalAdmins = get('SELECT COUNT(*) as count FROM admins').count;
    if (totalAdmins <= 1) {
      return res.status(400).json({ error: 'Cannot remove the last remaining administrator account.' });
    }

    run('DELETE FROM admins WHERE id = ?', [adminId]);
    run("DELETE FROM sessions WHERE user_id = ? AND user_type = 'admin'", [adminId]);

    res.json({ success: true, message: 'Admin account removed.' });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// REPORTS & ANALYTICS
// -------------------------------------------------------------
router.get('/reports', (req, res, next) => {
  try {
    const quizStats = query(
      `SELECT q.id, q.title, q.category,
              COUNT(a.id) as attempts_count,
              COALESCE(AVG(a.percentage), 0) as avg_pct,
              COALESCE(MAX(a.score), 0) as top_score,
              q.marks * (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as max_marks,
              SUM(CASE WHEN a.percentage >= 50 THEN 1 ELSE 0 END) as passed_count
       FROM quizzes q
       LEFT JOIN attempts a ON q.id = a.quiz_id AND a.status = 'completed'
       GROUP BY q.id
       ORDER BY attempts_count DESC`
    );

    const scoreBands = {
      excellent: get("SELECT COUNT(*) as count FROM attempts WHERE percentage >= 90 AND status = 'completed'").count,
      good: get("SELECT COUNT(*) as count FROM attempts WHERE percentage >= 75 AND percentage < 90 AND status = 'completed'").count,
      average: get("SELECT COUNT(*) as count FROM attempts WHERE percentage >= 50 AND percentage < 75 AND status = 'completed'").count,
      needsImprovement: get("SELECT COUNT(*) as count FROM attempts WHERE percentage < 50 AND status = 'completed'").count
    };

    const topPerformers = query(
      `SELECT student_name, student_code,
              COUNT(*) as attempts_count,
              ROUND(AVG(percentage), 1) as avg_score,
              MAX(score) as best_score
       FROM attempts
       WHERE status = 'completed'
       GROUP BY student_id
       ORDER BY avg_score DESC, attempts_count DESC
       LIMIT 8`
    );

    res.json({
      success: true,
      quizStats: quizStats.map(qs => ({
        id: qs.id,
        title: qs.title,
        category: qs.category,
        attemptsCount: qs.attempts_count,
        avgPercentage: Math.round(qs.avg_pct),
        topScore: qs.top_score,
        maxMarks: qs.max_marks,
        passRate: qs.attempts_count > 0 ? Math.round((qs.passed_count / qs.attempts_count) * 100) : 0
      })),
      scoreBands,
      topPerformers
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// AUDIT LOGS
// -------------------------------------------------------------
router.get('/audit-logs', (req, res, next) => {
  try {
    const logs = query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, logs });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
