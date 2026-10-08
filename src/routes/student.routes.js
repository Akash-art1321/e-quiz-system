const express = require('express');
const { get, query, run } = require('../db');
const { requireStudent } = require('../middleware/auth');
const { isValidEmail, isValidPhone, sanitizeString } = require('../utils/validator');
const logger = require('../utils/logger');

const router = express.Router();

router.use(requireStudent);

// GET /api/student/profile - Get logged-in student profile
router.get('/profile', (req, res, next) => {
  try {
    const student = get(
      `SELECT id, student_id, name, email, phone, college_id, college_name,
              roll_number, course, year, father_name, mother_name, profile_photo,
              is_active, verified, must_change_password,
              created_at, updated_at
       FROM students WHERE id = ?`,
      [req.user.id]
    );

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }

    res.json({
      success: true,
      profile: {
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
        verified: !!student.verified,
        mustChangePassword: !!student.must_change_password,
        createdAt: student.created_at,
        isNameLocked: !!student.name,
        isCollegeLocked: !!student.college_name,
        isRollLocked: !!student.roll_number,
        isCourseLocked: !!student.course,
        isYearLocked: !!student.year,
        isEmailLocked: !!student.email
      }
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/student/profile - Complete / update profile
// RULE: Details filled by the Admin (Name, Student ID, College, Roll Number, Course, Year, Email)
// CANNOT be altered or overwritten by the student.
// Students CAN configure Father's Name, Mother's Name, Phone, and Profile Photo!
router.put('/profile', (req, res, next) => {
  try {
    const student = get('SELECT * FROM students WHERE id = ?', [req.user.id]);
    if (!student) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }

    const { name, email, phone, collegeName, rollNumber, course, year, fatherName, motherName, profilePhoto } = req.body;

    // Check if student is trying to alter details filled by admin
    const lockedFieldsAttempted = [];

    if (name !== undefined && student.name && name.trim() !== student.name) {
      lockedFieldsAttempted.push('Full Name');
    }
    if (collegeName !== undefined && student.college_name && collegeName.trim() !== student.college_name) {
      lockedFieldsAttempted.push('College/Institution');
    }
    if (rollNumber !== undefined && student.roll_number && rollNumber.trim() !== student.roll_number) {
      lockedFieldsAttempted.push('Roll Number');
    }
    if (course !== undefined && student.course && course.trim() !== student.course) {
      lockedFieldsAttempted.push('Course/Branch');
    }
    if (year !== undefined && student.year && year.trim() !== student.year) {
      lockedFieldsAttempted.push('Year of Study');
    }
    if (email !== undefined && student.email && email.trim().toLowerCase() !== student.email.toLowerCase()) {
      lockedFieldsAttempted.push('Email');
    }

    if (lockedFieldsAttempted.length > 0) {
      return res.status(403).json({
        error: `Details configured by the administrator (${lockedFieldsAttempted.join(', ')}) cannot be modified by students. Please contact your institution administrator for any corrections.`
      });
    }

    // Student can update personal contact & family details
    let cleanPhone = student.phone;
    if (phone !== undefined) {
      const p = sanitizeString(phone, 20);
      if (p && !isValidPhone(p)) {
        return res.status(400).json({ error: 'Invalid phone number format.' });
      }
      cleanPhone = p || null;
    }

    let cleanEmail = student.email;
    if (!student.email && email) {
      const em = sanitizeString(email, 120).toLowerCase();
      if (!isValidEmail(em)) {
        return res.status(400).json({ error: 'Invalid email address.' });
      }
      cleanEmail = em;
    }

    let cleanFather = student.father_name;
    if (fatherName !== undefined) {
      cleanFather = sanitizeString(fatherName, 100) || null;
    }

    let cleanMother = student.mother_name;
    if (motherName !== undefined) {
      cleanMother = sanitizeString(motherName, 100) || null;
    }

    const cleanPhoto = typeof profilePhoto === 'string' && profilePhoto.length < 500000 ? profilePhoto : student.profile_photo;
    const now = Date.now();

    run(
      `UPDATE students
       SET phone = ?,
           email = ?,
           father_name = ?,
           mother_name = ?,
           profile_photo = ?,
           updated_at = ?
       WHERE id = ?`,
      [cleanPhone, cleanEmail, cleanFather, cleanMother, cleanPhoto, now, req.user.id]
    );

    res.json({
      success: true,
      message: 'Profile details saved successfully.'
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/student/history - Quiz attempt history
router.get('/history', (req, res, next) => {
  try {
    const attempts = query(
      `SELECT a.id, a.quiz_id, a.score, a.max_score, a.percentage, a.correct_count,
              a.wrong_count, a.skipped_count, a.time_taken, a.tab_switches,
              a.flagged_for_cheating, a.needs_manual_evaluation, a.evaluation_status, a.status, a.submitted_at,
              q.title as quiz_title, q.category as quiz_category
       FROM attempts a
       LEFT JOIN quizzes q ON a.quiz_id = q.id
       WHERE a.student_id = ?
       ORDER BY a.submitted_at DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      attempts: attempts.map(a => ({
        id: a.id,
        quizId: a.quiz_id,
        quizTitle: a.quiz_title || 'Archived Quiz',
        quizCategory: a.quiz_category || 'General',
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
        status: a.status,
        date: a.submitted_at
      }))
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/student/attempts/:id - Detailed result & answer review
router.get('/attempts/:id', (req, res, next) => {
  try {
    const attemptId = req.params.id;
    const attempt = get('SELECT * FROM attempts WHERE id = ?', [attemptId]);

    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found.' });
    }

    // Ownership check: student cannot view another student's attempt
    if (attempt.student_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only view your own quiz attempts.' });
    }

    const quiz = get('SELECT id, title, category, marks, negative FROM quizzes WHERE id = ?', [attempt.quiz_id]);

    let review = [];
    if (attempt.shuffled_data) {
      try {
        const layout = JSON.parse(attempt.shuffled_data);
        const rawQuestions = query('SELECT * FROM questions WHERE quiz_id = ?', [attempt.quiz_id]);
        const qMap = {};
        rawQuestions.forEach(q => { qMap[q.id] = q; });
        const pastAnswers = query('SELECT * FROM answers WHERE attempt_id = ?', [attemptId]);
        const aMap = {};
        pastAnswers.forEach(a => { aMap[a.question_id] = a; });

        review = layout.map(item => {
          const q = qMap[item.questionId];
          if (!q) return null;
          const ans = aMap[q.id];
          const isSubjective = q.q_type === 'written' || q.q_type === 'subjective';
          const qMarks = (q.marks !== null && q.marks !== undefined && !isNaN(parseFloat(q.marks))) ? parseFloat(q.marks) : (quiz ? quiz.marks : 1);
          const origOptions = JSON.parse(q.options || '[]');
          const displayedOptions = item.optionIndices.map(i => origOptions[i]);
          const correctDisplay = item.optionIndices.indexOf(q.correct);
          let selectedDisplay = null;
          if (item.selectedDisplay !== undefined && item.selectedDisplay !== null) {
            selectedDisplay = item.selectedDisplay;
          } else if (ans && ans.selected_option !== null && ans.selected_option !== undefined) {
            selectedDisplay = item.optionIndices.indexOf(ans.selected_option);
            if (selectedDisplay === -1) selectedDisplay = null;
          }

          return {
            text: q.text,
            qType: q.q_type || 'mcq',
            imageUrl: q.image_url || null,
            maxMarks: qMarks,
            options: displayedOptions,
            selected: selectedDisplay,
            correct: isSubjective ? null : correctDisplay,
            isCorrect: ans ? !!ans.is_correct : (selectedDisplay !== null && selectedDisplay === correctDisplay),
            isSubjective,
            writtenText: ans ? ans.written_text : null,
            attachmentUrl: ans ? ans.attachment_url : null,
            feedback: ans ? ans.feedback : null,
            marksAwarded: ans ? ans.marks_awarded : 0,
            explanation: q.explanation
          };
        }).filter(Boolean);
      } catch (e) {
        review = [];
      }
    }

    if (review.length === 0) {
      const answers = query(
        `SELECT ans.selected_option, ans.written_text, ans.attachment_url, ans.is_correct,
                ans.marks_awarded, ans.feedback,
                q.text as question_text, q.q_type, q.image_url, q.marks as question_marks,
                q.options, q.correct, q.explanation, q.q_order
         FROM answers ans
         JOIN questions q ON ans.question_id = q.id
         WHERE ans.attempt_id = ?
         ORDER BY q.q_order ASC`,
        [attemptId]
      );

      review = answers.map(a => {
        const isSubjective = a.q_type === 'written' || a.q_type === 'subjective';
        const qMarks = (a.question_marks !== null && a.question_marks !== undefined) ? a.question_marks : (quiz ? quiz.marks : 1);
        return {
          text: a.question_text,
          qType: a.q_type || 'mcq',
          imageUrl: a.image_url || null,
          maxMarks: qMarks,
          options: JSON.parse(a.options || '[]'),
          selected: a.selected_option,
          correct: isSubjective ? null : a.correct,
          isCorrect: !!a.is_correct,
          isSubjective,
          writtenText: a.written_text,
          attachmentUrl: a.attachment_url,
          feedback: a.feedback,
          marksAwarded: a.marks_awarded,
          explanation: a.explanation
        };
      });
    }

    res.json({
      success: true,
      attempt: {
        id: attempt.id,
        quizId: attempt.quiz_id,
        quizTitle: quiz ? quiz.title : 'Archived Quiz',
        quizCategory: quiz ? quiz.category : 'General',
        score: attempt.score,
        maxScore: attempt.max_score,
        percentage: attempt.percentage,
        correct: attempt.correct_count,
        wrong: attempt.wrong_count,
        skipped: attempt.skipped_count,
        timeTaken: attempt.time_taken,
        tabSwitches: attempt.tab_switches,
        flaggedForCheating: !!attempt.flagged_for_cheating,
        needsManualEvaluation: !!attempt.needs_manual_evaluation,
        evaluationStatus: attempt.evaluation_status || 'auto_graded',
        submittedAt: attempt.submitted_at
      },
      review
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/student/stats - Summary metrics
router.get('/stats', (req, res, next) => {
  try {
    const stats = get(
      `SELECT COUNT(*) as total_attempts,
              COALESCE(AVG(percentage), 0) as avg_score,
              COALESCE(MAX(score), 0) as highest_score,
              COALESCE(SUM(time_taken), 0) as total_time
       FROM attempts
       WHERE student_id = ?`,
      [req.user.id]
    );

    res.json({
      success: true,
      stats: {
        totalAttempts: stats.total_attempts,
        avgScore: Math.round(stats.avg_score),
        highestScore: stats.highest_score,
        totalTimeMinutes: Math.round(stats.total_time / 60)
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
