const express = require('express');
const crypto = require('crypto');
const { get, query, run, transaction } = require('../db');
const { requireAuth, requireStudent } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function cryptoShuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffleOptions(indices) {
  if (!indices || indices.length <= 1) return indices ? [...indices] : [];
  let shuffled = cryptoShuffle(indices);
  let attempts = 0;
  while (attempts < 5 && shuffled.every((val, idx) => val === indices[idx])) {
    shuffled = cryptoShuffle(indices);
    attempts++;
  }
  if (shuffled.every((val, idx) => val === indices[idx]) && shuffled.length >= 2) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  return shuffled;
}

function shuffleQuestions(questions) {
  if (!questions || questions.length <= 1) return questions ? [...questions] : [];
  let shuffled = cryptoShuffle(questions);
  let attempts = 0;
  while (attempts < 5 && shuffled.every((q, idx) => q.id === questions[idx].id)) {
    shuffled = cryptoShuffle(questions);
    attempts++;
  }
  if (shuffled.every((q, idx) => q.id === questions[idx].id) && shuffled.length >= 2) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  return shuffled;
}

// GET /api/quizzes - List available quizzes
router.get('/', requireAuth, (req, res, next) => {
  try {
    const isStudent = req.user.userType === 'student';
    const now = Date.now();

    let quizzes;
    if (isStudent) {
      quizzes = query(
        `SELECT q.id, q.title, q.category, q.duration, q.marks, q.negative,
                q.instructions, q.is_active, q.allow_multiple_attempts,
                q.start_time, q.end_time, q.eligibility,
                (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count,
                (SELECT COUNT(*) FROM attempts WHERE quiz_id = q.id AND student_id = ? AND status = 'completed') as my_attempts
         FROM quizzes q
         WHERE q.is_active = 1
         ORDER BY q.created_at DESC`,
        [req.user.id]
      );
    } else {
      quizzes = query(
        `SELECT q.id, q.title, q.category, q.duration, q.marks, q.negative,
                q.instructions, q.is_active, q.allow_multiple_attempts, q.created_at,
                q.start_time, q.end_time, q.eligibility,
                (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count,
                (SELECT COUNT(*) FROM attempts WHERE quiz_id = q.id AND status = 'completed') as total_attempts
         FROM quizzes q
         ORDER BY q.created_at DESC`
      );
    }

    const studentCourse = isStudent ? (req.user.course || '').toLowerCase().trim() : '';

    res.json({
      success: true,
      quizzes: quizzes.map(q => {
        let scheduleStatus = 'open';
        if (q.start_time && now < q.start_time) scheduleStatus = 'upcoming';
        else if (q.end_time && now > q.end_time) scheduleStatus = 'expired';

        let isEligible = true;
        if (isStudent && q.eligibility && q.eligibility.toLowerCase() !== 'all') {
          const target = q.eligibility.toLowerCase().trim();
          if (!studentCourse || (!studentCourse.includes(target) && !target.includes(studentCourse))) {
            isEligible = false;
          }
        }

        return {
          id: q.id,
          title: q.title,
          category: q.category,
          duration: q.duration,
          marks: q.marks,
          negative: q.negative,
          instructions: q.instructions,
          isActive: !!q.is_active,
          questionCount: q.question_count,
          allowMultipleAttempts: !!q.allow_multiple_attempts,
          startTime: q.start_time,
          endTime: q.end_time,
          eligibility: q.eligibility || 'all',
          scheduleStatus,
          isEligible,
          hasAttempted: isStudent ? q.my_attempts > 0 : undefined,
          totalAttempts: !isStudent ? q.total_attempts : undefined,
          createdAt: q.created_at
        };
      })
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/quizzes/:id - Quiz metadata
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const quiz = get('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    if (req.user.userType === 'student' && !quiz.is_active) {
      return res.status(403).json({ error: 'This quiz is currently unavailable.' });
    }

    const questionCount = get('SELECT COUNT(*) as count FROM questions WHERE quiz_id = ?', [quiz.id]).count;

    let hasAttempted = false;
    if (req.user.userType === 'student') {
      const past = get("SELECT COUNT(*) as count FROM attempts WHERE quiz_id = ? AND student_id = ? AND status = 'completed'", [quiz.id, req.user.id]);
      hasAttempted = past.count > 0;
    }

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
        questionCount,
        hasAttempted
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/quizzes/:id/start - Student starts quiz exam
router.post('/:id/start', requireStudent, (req, res, next) => {
  try {
    const quizId = req.params.id;
    const quiz = get('SELECT * FROM quizzes WHERE id = ?', [quizId]);

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    if (!quiz.is_active) {
      return res.status(403).json({ error: 'This quiz is not currently active.' });
    }

    // 1. Scheduled Exam Window Check (Date & Time Lock)
    const now = Date.now();
    if (quiz.start_time && now < quiz.start_time) {
      const openTime = new Date(quiz.start_time).toLocaleString();
      return res.status(400).json({
        error: `This examination has not started yet. Scheduled opening time: ${openTime}.`
      });
    }

    if (quiz.end_time && now > quiz.end_time) {
      const closeTime = new Date(quiz.end_time).toLocaleString();
      return res.status(400).json({
        error: `This examination window has closed. The deadline was ${closeTime}.`
      });
    }

    // 2. Branch / Batch / Course-Wise Eligibility Filter
    if (quiz.eligibility && quiz.eligibility.toLowerCase() !== 'all') {
      const target = quiz.eligibility.toLowerCase().trim();
      const studentCourse = (req.user.course || '').toLowerCase().trim();
      if (!studentCourse || (!studentCourse.includes(target) && !target.includes(studentCourse))) {
        return res.status(403).json({
          error: `You are not eligible for this examination. Target: ${quiz.eligibility}. Your course: ${req.user.course || 'Not Assigned'}.`
        });
      }
    }

    // Single attempt restriction check
    if (!quiz.allow_multiple_attempts) {
      const pastAttempt = get(
        "SELECT id FROM attempts WHERE quiz_id = ? AND student_id = ? AND status IN ('completed', 'terminated_cheating')",
        [quizId, req.user.id]
      );
      if (pastAttempt) {
        return res.status(400).json({
          error: 'You have already attempted this quiz. Retakes are not allowed for this examination.'
        });
      }
    }

    // Check if student has an active exam that is blocked by proctoring
    const activeBlocked = get(
      "SELECT id, quiz_id FROM attempts WHERE student_id = ? AND status = 'in_progress' AND is_blocked = 1",
      [req.user.id]
    );
    if (activeBlocked) {
      return res.status(403).json({
        error: 'Your examination is currently locked due to a proctoring violation. Please wait for the invigilator to unblock you.',
        blocked: true,
        attemptId: activeBlocked.id,
        quizId: activeBlocked.quiz_id
      });
    }

    // Check if there is an existing in-progress attempt that hasn't timed out
    const durationSeconds = quiz.duration * 60;
    const maxAllowedTime = (quiz.duration + 5) * 60 * 1000; // 5 min buffer

    let attempt = get(
      "SELECT * FROM attempts WHERE quiz_id = ? AND student_id = ? AND status = 'in_progress'",
      [quizId, req.user.id]
    );

    if (attempt && (now - attempt.started_at) > maxAllowedTime) {
      // Previous attempt timed out without submit, mark it timed_out
      run("UPDATE attempts SET status = 'timed_out' WHERE id = ?", [attempt.id]);
      attempt = null;
    }

    // Fetch questions for this quiz
    const questions = query(
      'SELECT id, q_order, q_type, text, image_url, marks, options FROM questions WHERE quiz_id = ? ORDER BY q_order ASC',
      [quizId]
    );

    if (!questions || questions.length === 0) {
      return res.status(400).json({ error: 'This quiz has no questions configured.' });
    }

    const questionsById = {};
    for (const q of questions) {
      questionsById[q.id] = q;
    }

    let layout = null;
    if (attempt && attempt.shuffled_data) {
      try {
        layout = JSON.parse(attempt.shuffled_data);
      } catch (e) {
        layout = null;
      }
    }

    if (!layout || !Array.isArray(layout) || layout.length !== questions.length) {
      const shuffledQuestions = shuffleQuestions(questions);
      layout = shuffledQuestions.map(q => {
        const origOptions = JSON.parse(q.options || '[]');
        const indices = origOptions.map((_, i) => i);
        const shuffledIndices = shuffleOptions(indices);
        return {
          questionId: q.id,
          optionIndices: shuffledIndices
        };
      });
    }

    const layoutJson = JSON.stringify(layout);

    if (!attempt) {
      const attemptId = uid('atm');
      const questionsCount = questions.length;
      let maxScore = 0;
      for (const q of questions) {
        maxScore += (q.marks !== null && q.marks !== undefined && !isNaN(parseFloat(q.marks))) ? parseFloat(q.marks) : quiz.marks;
      }

      run(
        `INSERT INTO attempts (
          id, quiz_id, student_id, student_name, student_code,
          score, max_score, percentage, correct_count, wrong_count, skipped_count,
          time_taken, tab_switches, flagged_for_cheating, status, started_at, submitted_at,
          shuffled_data
        ) VALUES (?, ?, ?, ?, ?, 0, ?, 0, 0, 0, ?, 0, 0, 0, 'in_progress', ?, 0, ?)`,
        [
          attemptId,
          quizId,
          req.user.id,
          req.user.name,
          req.user.studentId || req.user.id,
          maxScore,
          questionsCount,
          now,
          layoutJson
        ]
      );

      attempt = { id: attemptId, started_at: now, tab_switches: 0, shuffled_data: layoutJson };
    } else if (!attempt.shuffled_data) {
      run('UPDATE attempts SET shuffled_data = ? WHERE id = ?', [layoutJson, attempt.id]);
      attempt.shuffled_data = layoutJson;
    }

    // Return sanitized questions in shuffled question & option order
    const sanitizedQuestions = layout.map((item, idx) => {
      const q = questionsById[item.questionId];
      if (!q) return null;
      const origOptions = JSON.parse(q.options || '[]');
      const shuffledOptions = item.optionIndices.map(origIdx => origOptions[origIdx]);
      return {
        id: q.id,
        order: idx + 1,
        qType: q.q_type || 'mcq',
        imageUrl: q.image_url || null,
        marks: (q.marks !== null && q.marks !== undefined && !isNaN(parseFloat(q.marks))) ? parseFloat(q.marks) : quiz.marks,
        text: q.text,
        options: shuffledOptions
      };
    }).filter(Boolean);

    const elapsedSeconds = Math.max(0, Math.floor((now - attempt.started_at) / 1000));
    const secondsRemaining = Math.max(0, durationSeconds - elapsedSeconds);

    res.json({
      success: true,
      attemptId: attempt.id,
      quiz: {
        id: quiz.id,
        title: quiz.title,
        category: quiz.category,
        duration: quiz.duration,
        marks: quiz.marks,
        negative: quiz.negative,
        uploadBufferMinutes: quiz.upload_buffer_minutes || 0,
        requireWebcam: quiz.require_webcam !== 0,
        requireFullscreen: quiz.require_fullscreen !== 0
      },
      durationSeconds,
      secondsRemaining,
      startedAt: attempt.started_at,
      tabSwitches: attempt.tab_switches || 0,
      questions: sanitizedQuestions
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/quizzes/:id/submit - Server-side grading and submission
router.post('/:id/submit', requireStudent, async (req, res, next) => {
  try {
    const quizId = req.params.id;
    const { attemptId, answers, tabSwitches, autoSubmitReason } = req.body;

    if (!attemptId) {
      return res.status(400).json({ error: 'Attempt ID is required for submission.' });
    }

    const quiz = get('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found.' });
    }

    const attempt = get(
      'SELECT * FROM attempts WHERE id = ? AND quiz_id = ? AND student_id = ?',
      [attemptId, quizId, req.user.id]
    );

    if (!attempt) {
      return res.status(404).json({ error: 'Attempt record not found.' });
    }

    if (attempt.is_blocked === 1 && autoSubmitReason !== 'cheating') {
      return res.status(403).json({
        error: 'Your examination is currently locked due to a proctoring violation. Please wait for the invigilator to unblock you.',
        blocked: true,
        attemptId: attempt.id
      });
    }

    // Idempotency: if already completed, return existing results
    if (attempt.status === 'completed' || attempt.status === 'terminated_cheating') {
      let review = [];
      if (attempt.shuffled_data) {
        try {
          const layout = JSON.parse(attempt.shuffled_data);
          const rawQuestions = query('SELECT * FROM questions WHERE quiz_id = ?', [quizId]);
          const qMap = {};
          rawQuestions.forEach(q => { qMap[q.id] = q; });
          const pastAnswers = query('SELECT * FROM answers WHERE attempt_id = ?', [attemptId]);
          const aMap = {};
          pastAnswers.forEach(a => { aMap[a.question_id] = a; });

          review = layout.map(item => {
            const q = qMap[item.questionId];
            if (!q) return null;
            const ans = aMap[q.id];
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
              options: displayedOptions,
              selected: selectedDisplay,
              correct: correctDisplay,
              isCorrect: ans ? !!ans.is_correct : (selectedDisplay !== null && selectedDisplay === correctDisplay),
              marksAwarded: ans ? ans.marks_awarded : 0,
              explanation: q.explanation
            };
          }).filter(Boolean);
        } catch (e) {
          review = [];
        }
      }

      if (review.length === 0) {
        const pastAnswers = query(
          `SELECT ans.selected_option, ans.is_correct, ans.marks_awarded,
                  q.text as question_text, q.options, q.correct, q.explanation
           FROM answers ans
           JOIN questions q ON ans.question_id = q.id
           WHERE ans.attempt_id = ?
           ORDER BY q.q_order ASC`,
          [attemptId]
        );
        review = pastAnswers.map(a => ({
          text: a.question_text,
          options: JSON.parse(a.options || '[]'),
          selected: a.selected_option,
          correct: a.correct,
          isCorrect: !!a.is_correct,
          marksAwarded: a.marks_awarded,
          explanation: a.explanation
        }));
      }

      return res.json({
        success: true,
        alreadySubmitted: true,
        result: {
          id: attempt.id,
          score: attempt.score,
          maxScore: attempt.max_score,
          percentage: attempt.percentage,
          correct: attempt.correct_count,
          wrong: attempt.wrong_count,
          skipped: attempt.skipped_count,
          timeTaken: attempt.time_taken,
          tabSwitches: attempt.tab_switches,
          flaggedForCheating: !!attempt.flagged_for_cheating
        },
        review
      });
    }

    // Fetch questions with CORRECT answers from database
    const questions = query('SELECT * FROM questions WHERE quiz_id = ? ORDER BY q_order ASC', [quizId]);
    const questionsById = {};
    for (const q of questions) {
      questionsById[q.id] = q;
    }

    let layout = null;
    if (attempt.shuffled_data) {
      try {
        layout = JSON.parse(attempt.shuffled_data);
      } catch (e) {
        layout = null;
      }
    }

    const userAnswers = Array.isArray(answers) ? answers : (answers && typeof answers === 'object' ? answers : []);
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    let rawScore = 0;
    let hasSubjective = false;

    const answerRecords = [];
    const reviewData = [];

    if (layout && Array.isArray(layout) && layout.length > 0) {
      // Evaluate based on the candidate's exact shuffled layout
      layout.forEach((item, idx) => {
        const q = questionsById[item.questionId];
        if (!q) return;

        const isSubjective = q.q_type === 'written' || q.q_type === 'subjective';
        const qMarks = (q.marks !== null && q.marks !== undefined && !isNaN(parseFloat(q.marks))) ? parseFloat(q.marks) : quiz.marks;
        const origOptions = JSON.parse(q.options || '[]');
        const displayedOptions = item.optionIndices.map(origIdx => origOptions[origIdx]);

        if (isSubjective) {
          hasSubjective = true;
          let writtenText = null;
          let attachmentUrl = null;

          if (Array.isArray(userAnswers)) {
            const rawAns = userAnswers[idx];
            if (rawAns && typeof rawAns === 'object') {
              writtenText = rawAns.writtenText || rawAns.text || null;
              attachmentUrl = rawAns.attachmentUrl || rawAns.attachment || null;
            } else if (typeof rawAns === 'string') {
              writtenText = rawAns;
            }
          } else if (userAnswers && typeof userAnswers === 'object') {
            const rawAns = userAnswers[q.id] || userAnswers[idx];
            if (rawAns && typeof rawAns === 'object') {
              writtenText = rawAns.writtenText || rawAns.text || null;
              attachmentUrl = rawAns.attachmentUrl || rawAns.attachment || null;
            } else if (typeof rawAns === 'string') {
              writtenText = rawAns;
            }
          }

          const hasContent = (writtenText && writtenText.trim().length > 0) || (attachmentUrl && attachmentUrl.length > 0);
          if (!hasContent) {
            skippedCount++;
          }

          answerRecords.push({
            id: uid('ans'),
            attempt_id: attemptId,
            question_id: q.id,
            selected_option: null,
            written_text: writtenText,
            attachment_url: attachmentUrl,
            is_correct: 0,
            marks_awarded: 0
          });

          reviewData.push({
            text: q.text,
            qType: q.q_type || 'written',
            imageUrl: q.image_url || null,
            writtenText: writtenText || '',
            attachmentUrl: attachmentUrl || null,
            options: [],
            selected: null,
            correct: null,
            isCorrect: false,
            isSubjective: true,
            marksAwarded: 0,
            maxMarks: qMarks,
            explanation: q.explanation
          });
        } else {
          // Standard MCQ question
          let selectedDisplay = null;
          if (Array.isArray(userAnswers)) {
            if (typeof userAnswers[idx] === 'object' && userAnswers[idx] !== null) {
              selectedDisplay = userAnswers[idx].selectedOption ?? userAnswers[idx].selected ?? null;
            } else if (userAnswers[idx] !== undefined && userAnswers[idx] !== null) {
              selectedDisplay = parseInt(userAnswers[idx], 10);
            } else {
              const match = userAnswers.find(a => a && (a.questionId === q.id || a.id === q.id));
              if (match && (match.selectedOption !== undefined || match.selected !== undefined)) {
                selectedDisplay = parseInt(match.selectedOption ?? match.selected, 10);
              }
            }
          } else if (typeof userAnswers === 'object' && userAnswers !== null) {
            if (userAnswers[q.id] !== undefined && userAnswers[q.id] !== null) {
              selectedDisplay = parseInt(userAnswers[q.id], 10);
            } else if (userAnswers[idx] !== undefined && userAnswers[idx] !== null) {
              selectedDisplay = parseInt(userAnswers[idx], 10);
            }
          }

          if (selectedDisplay !== null && (isNaN(selectedDisplay) || selectedDisplay < 0 || selectedDisplay >= displayedOptions.length)) {
            selectedDisplay = null;
          }

          const originalSelected = (selectedDisplay !== null) ? item.optionIndices[selectedDisplay] : null;
          const correctDisplay = item.optionIndices.indexOf(q.correct);

          let isCorrect = 0;
          let marksAwarded = 0;

          if (selectedDisplay === null) {
            skippedCount++;
            marksAwarded = 0;
          } else if (originalSelected === q.correct) {
            correctCount++;
            isCorrect = 1;
            marksAwarded = qMarks;
            rawScore += qMarks;
          } else {
            wrongCount++;
            isCorrect = 0;
            const penalty = qMarks * (quiz.negative || 0);
            marksAwarded = -penalty;
            rawScore -= penalty;
          }

          answerRecords.push({
            id: uid('ans'),
            attempt_id: attemptId,
            question_id: q.id,
            selected_option: originalSelected,
            written_text: null,
            attachment_url: null,
            is_correct: isCorrect,
            marks_awarded: marksAwarded
          });

          item.selectedDisplay = selectedDisplay;
          item.originalSelected = originalSelected;

          reviewData.push({
            text: q.text,
            qType: 'mcq',
            imageUrl: q.image_url || null,
            options: displayedOptions,
            selected: selectedDisplay,
            correct: correctDisplay,
            isCorrect: isCorrect === 1,
            isSubjective: false,
            marksAwarded,
            maxMarks: qMarks,
            explanation: q.explanation
          });
        }
      });
    } else {
      questions.forEach((q, idx) => {
        const isSubjective = q.q_type === 'written' || q.q_type === 'subjective';
        const qMarks = (q.marks !== null && q.marks !== undefined && !isNaN(parseFloat(q.marks))) ? parseFloat(q.marks) : quiz.marks;

        if (isSubjective) {
          hasSubjective = true;
          let writtenText = null;
          let attachmentUrl = null;

          if (Array.isArray(userAnswers)) {
            const rawAns = userAnswers[idx];
            if (rawAns && typeof rawAns === 'object') {
              writtenText = rawAns.writtenText || rawAns.text || null;
              attachmentUrl = rawAns.attachmentUrl || rawAns.attachment || null;
            } else if (typeof rawAns === 'string') {
              writtenText = rawAns;
            }
          }

          const hasContent = (writtenText && writtenText.trim().length > 0) || (attachmentUrl && attachmentUrl.length > 0);
          if (!hasContent) skippedCount++;

          answerRecords.push({
            id: uid('ans'),
            attempt_id: attemptId,
            question_id: q.id,
            selected_option: null,
            written_text: writtenText,
            attachment_url: attachmentUrl,
            is_correct: 0,
            marks_awarded: 0
          });

          reviewData.push({
            text: q.text,
            qType: q.q_type || 'written',
            imageUrl: q.image_url || null,
            writtenText: writtenText || '',
            attachmentUrl: attachmentUrl || null,
            options: [],
            selected: null,
            correct: null,
            isCorrect: false,
            isSubjective: true,
            marksAwarded: 0,
            maxMarks: qMarks,
            explanation: q.explanation
          });
        } else {
          let selected = null;
          if (Array.isArray(userAnswers)) {
            selected = userAnswers[idx] !== undefined && userAnswers[idx] !== null ? parseInt(userAnswers[idx], 10) : null;
          }
          const opts = JSON.parse(q.options || '[]');
          let isCorrect = 0;
          let marksAwarded = 0;

          if (selected === null || isNaN(selected)) {
            skippedCount++;
            marksAwarded = 0;
          } else if (selected === q.correct) {
            correctCount++;
            isCorrect = 1;
            marksAwarded = qMarks;
            rawScore += qMarks;
          } else {
            wrongCount++;
            isCorrect = 0;
            const penalty = qMarks * (quiz.negative || 0);
            marksAwarded = -penalty;
            rawScore -= penalty;
          }

          answerRecords.push({
            id: uid('ans'),
            attempt_id: attemptId,
            question_id: q.id,
            selected_option: selected,
            written_text: null,
            attachment_url: null,
            is_correct: isCorrect,
            marks_awarded: marksAwarded
          });

          reviewData.push({
            text: q.text,
            qType: 'mcq',
            imageUrl: q.image_url || null,
            options: opts,
            selected,
            correct: q.correct,
            isCorrect: isCorrect === 1,
            isSubjective: false,
            marksAwarded,
            maxMarks: qMarks,
            explanation: q.explanation
          });
        }
      });
    }

    // Score calculations
    const finalScore = Math.max(0, Math.round(rawScore * 100) / 100);
    let maxScore = 0;
    for (const q of questions) {
      maxScore += (q.marks !== null && q.marks !== undefined && !isNaN(parseFloat(q.marks))) ? parseFloat(q.marks) : quiz.marks;
    }
    const percentage = maxScore > 0 ? Math.round((finalScore / maxScore) * 100) : 0;

    const now = Date.now();
    const durationSeconds = quiz.duration * 60;
    const elapsedSeconds = Math.round((now - attempt.started_at) / 1000);
    const timeTaken = Math.min(durationSeconds, Math.max(1, elapsedSeconds));

    const finalSwitches = parseInt(tabSwitches || attempt.tab_switches || 0, 10);
    const flaggedForCheating = finalSwitches >= 1 || autoSubmitReason === 'cheating';

    // Transactionally save answers and update attempt
    transaction(() => {
      // Clear any partial answers
      run('DELETE FROM answers WHERE attempt_id = ?', [attemptId]);

      // Insert answers
      for (const rec of answerRecords) {
        run(
          `INSERT INTO answers (id, attempt_id, question_id, selected_option, written_text, attachment_url, is_correct, marks_awarded)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [rec.id, rec.attempt_id, rec.question_id, rec.selected_option, rec.written_text || null, rec.attachment_url || null, rec.is_correct, rec.marks_awarded]
        );
      }

      // Update attempt (including updated shuffled_data with student's selections)
      const updatedShuffledJson = layout ? JSON.stringify(layout) : attempt.shuffled_data;
      run(
        `UPDATE attempts
         SET score = ?,
             max_score = ?,
             percentage = ?,
             correct_count = ?,
             wrong_count = ?,
             skipped_count = ?,
             time_taken = ?,
             tab_switches = ?,
             flagged_for_cheating = ?,
             needs_manual_evaluation = ?,
             evaluation_status = ?,
             status = ?,
             submitted_at = ?,
             shuffled_data = ?
         WHERE id = ?`,
        [
          finalScore,
          maxScore,
          percentage,
          correctCount,
          wrongCount,
          skippedCount,
          timeTaken,
          finalSwitches,
          flaggedForCheating ? 1 : 0,
          hasSubjective ? 1 : 0,
          hasSubjective ? 'pending_review' : 'auto_graded',
          flaggedForCheating ? 'terminated_cheating' : 'completed',
          now,
          updatedShuffledJson,
          attemptId
        ]
      );
    });

    res.json({
      success: true,
      result: {
        id: attemptId,
        score: finalScore,
        maxScore,
        percentage,
        correct: correctCount,
        wrong: wrongCount,
        skipped: skippedCount,
        timeTaken,
        tabSwitches: finalSwitches,
        flaggedForCheating,
        needsManualEvaluation: hasSubjective,
        evaluationStatus: hasSubjective ? 'pending_review' : 'auto_graded'
      },
      review: reviewData
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/quizzes/:id/alert - Log suspicious activity / tab-switch / fullscreen / webcam
router.post('/:id/alert', requireStudent, (req, res, next) => {
  try {
    const quizId = req.params.id;
    const { attemptId, type, switchCount, snapshotUrl } = req.body;
    const quiz = get('SELECT title FROM quizzes WHERE id = ?', [quizId]);

    const count = parseInt(switchCount, 10) || 1;
    const now = Date.now();

    // Check if an alert exists for this student + quiz
    const existing = get(
      'SELECT id, switch_count, snapshot_url FROM alerts WHERE student_id = ? AND quiz_id = ? AND resolved = 0',
      [req.user.id, quizId]
    );

    if (existing) {
      run(
        'UPDATE alerts SET switch_count = ?, last_time = ?, event_type = ?, snapshot_url = ? WHERE id = ?',
        [count, now, type || 'tab_hidden', snapshotUrl || existing.snapshot_url || null, existing.id]
      );
    } else {
      run(
        `INSERT INTO alerts (
          id, attempt_id, student_id, student_name, quiz_id, quiz_title,
          event_type, switch_count, snapshot_url, first_time, last_time, resolved
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          uid('al'),
          attemptId || null,
          req.user.id,
          req.user.name,
          quizId,
          quiz ? quiz.title : 'Quiz',
          type || 'tab_hidden',
          count,
          snapshotUrl || null,
          now,
          now
        ]
      );
    }

    if (attemptId) {
      // Block immediately on infractions — admin must manually unblock
      run(
        'UPDATE attempts SET tab_switches = ?, flagged_for_cheating = 1, is_blocked = 1 WHERE id = ?',
        [count, attemptId]
      );
    }

    res.json({
      success: true,
      blocked: true
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/quizzes/:id/leaderboard - Top 10 rankers for quiz
router.get('/:id/leaderboard', requireAuth, (req, res, next) => {
  try {
    const quizId = req.params.id;
    const topAttempts = query(
      `SELECT student_name, student_code, score, max_score, percentage, time_taken, submitted_at
       FROM attempts
       WHERE quiz_id = ? AND status = 'completed'
       ORDER BY score DESC, time_taken ASC
       LIMIT 10`,
      [quizId]
    );

    res.json({
      success: true,
      leaderboard: topAttempts.map((a, idx) => ({
        rank: idx + 1,
        studentName: a.student_name,
        studentCode: a.student_code,
        score: a.score,
        maxScore: a.max_score,
        percentage: a.percentage,
        timeTaken: a.time_taken,
        date: a.submitted_at
      }))
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/quizzes/attempt/:attemptId/block-status - Student polls to check if admin unblocked them
router.get('/attempt/:attemptId/block-status', requireStudent, (req, res, next) => {
  try {
    const { attemptId } = req.params;
    const attempt = get(
      'SELECT is_blocked FROM attempts WHERE id = ? AND student_id = ?',
      [attemptId, req.user.id]
    );
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found.' });
    res.json({ success: true, isBlocked: !!attempt.is_blocked });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

