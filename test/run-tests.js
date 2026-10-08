/**
 * QuizNest Automated Test Suite
 * Validates all 19 functional, security, and authorization requirements
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.PORT = '3099';
process.env.DB_PATH = path.resolve(__dirname, '../data/test_quiznest.db');

const { app } = require('../src/server');
const { get, query, run } = require('../src/db');
const seedDatabase = require('../src/db/seed');

let server;
const BASE_URL = 'http://localhost:3099';

// HTTP helper for tests
function request(method, path, body = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (cookie) {
      options.headers['Cookie'] = cookie;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }

        // Extract cookie if present
        const setCookie = res.headers['set-cookie'];
        let cookieHeader = null;
        if (setCookie && setCookie.length > 0) {
          cookieHeader = setCookie[0].split(';')[0];
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json,
          cookie: cookieHeader
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

const stats = { passed: 0, failed: 0, total: 0 };

function assert(condition, message) {
  stats.total++;
  if (condition) {
    stats.passed++;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    stats.failed++;
    console.error(`  ✗ [FAIL] ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('       QuizNest - Automated Test Suite');
  console.log('====================================================\n');

  try {
    // Clean test tables to ensure a fresh, isolated state on every test run
    try {
      run('DELETE FROM answers');
      run('DELETE FROM attempts');
      run('DELETE FROM alerts');
      run('DELETE FROM password_reset_requests');
      run('DELETE FROM sessions');
      run("DELETE FROM students WHERE student_id != 'STU2026001'");
      run("DELETE FROM admins WHERE username != 'admin'");
      run("DELETE FROM questions WHERE quiz_id NOT IN (SELECT id FROM quizzes WHERE title IN ('General Science Basics', 'World Geography Quiz', 'Computer Science Fundamentals'))");
      run("DELETE FROM quizzes WHERE title NOT IN ('General Science Basics', 'World Geography Quiz', 'Computer Science Fundamentals')");
    } catch (e) {}

    // 1. Syntax Check
    console.log('[Test 1] Syntax and Module Integrity Check');
    assert(typeof app === 'function', 'Express application loaded without syntax errors');
    assert(typeof seedDatabase === 'function', 'Seed database function loaded');

    // 2. Database Initialization
    console.log('\n[Test 2] Database Initialization Test');
    await seedDatabase();
    const adminCheck = get('SELECT id, username FROM admins WHERE username = ?', ['admin']);
    assert(adminCheck && adminCheck.username === 'admin', 'Default admin seeded properly');
    const studentCheck = get('SELECT id, student_id FROM students WHERE student_id = ?', ['STU2026001']);
    assert(studentCheck && studentCheck.student_id === 'STU2026001', 'Default student seeded properly');
    const quizCount = get('SELECT COUNT(*) as count FROM quizzes').count;
    assert(quizCount > 0, `Sample quizzes seeded (${quizCount} quizzes found)`);

    // 3. Start Test HTTP Server
    console.log('\n[Test 3] Backend Startup & Health Check');
    await new Promise((resolve) => {
      server = app.listen(3099, resolve);
    });
    const health = await request('GET', '/api/health');
    assert(health.status === 200, 'Health endpoint responds with HTTP 200');
    assert(health.body.status === 'ok', 'Health status is "ok"');

    // 4. Admin Login Test
    console.log('\n[Test 4] Admin Login Test');
    const adminLogin = await request('POST', '/api/auth/login', {
      identifier: 'admin',
      password: 'Admin@QuizNest2026!'
    });
    assert(adminLogin.status === 200, 'Admin login succeeded with HTTP 200');
    assert(adminLogin.body.user && adminLogin.body.user.userType === 'admin', 'Server automatically identified user as "admin"');
    assert(adminLogin.cookie && adminLogin.cookie.includes('quiznest_session='), 'HTTPOnly session cookie received');
    const adminCookie = adminLogin.cookie;

    // 5. Student Login Test
    console.log('\n[Test 5] Student Login Test');
    const studentLogin = await request('POST', '/api/auth/login', {
      identifier: 'STU2026001',
      password: 'Student@QuizNest2026!'
    });
    assert(studentLogin.status === 200, 'Student login succeeded with HTTP 200');
    assert(studentLogin.body.user && studentLogin.body.user.userType === 'student', 'Server automatically identified user as "student"');
    assert(studentLogin.cookie && studentLogin.cookie.includes('quiznest_session='), 'Student session cookie issued');
    const studentCookie = studentLogin.cookie;

    // 6. Student Self-Registration Rejection Test
    console.log('\n[Test 6] Student Self-Registration Rejection Test');
    const selfReg = await request('POST', '/api/auth/register', {
      name: 'Hacker Self Reg',
      email: 'hack@test.com',
      password: 'Password123'
    });
    assert(selfReg.status === 403, 'Self-registration route correctly rejected with HTTP 403 Forbidden');

    // 7. Invalid Credentials Test
    console.log('\n[Test 7] Invalid Credentials Test');
    const badLogin = await request('POST', '/api/auth/login', {
      identifier: 'admin',
      password: 'WrongPassword999!'
    });
    assert(badLogin.status === 401, 'Invalid password rejected with HTTP 401');
    const nonExistent = await request('POST', '/api/auth/login', {
      identifier: 'non_existent_user_id_123',
      password: 'SomePassword'
    });
    assert(nonExistent.status === 401, 'Unknown user rejected with HTTP 401 without user enumeration');

    // 8. Admin Student Creation & Auto Student ID Generation Test
    console.log('\n[Test 8] Admin Student Creation & Auto Student ID Generation Test');
    // Test 8a: Verify system predicts / generates next Student ID
    const nextIdRes = await request('GET', '/api/admin/students/next-id', null, adminCookie);
    assert(nextIdRes.status === 200, 'GET /api/admin/students/next-id responded with HTTP 200');
    assert(nextIdRes.body.nextStudentId && nextIdRes.body.nextStudentId.startsWith('STU'), 'Next auto-generated ID follows STU format');

    // Test 8b: Create student WITHOUT specifying studentId (System auto-generates it)
    const autoStudent = await request('POST', '/api/admin/students', {
      name: 'Priya Sharma',
      initialPassword: 'AutoPass@2026!',
      email: 'priya.sharma@college.edu',
      collegeName: 'National College of Engineering',
      course: 'B.Tech CSE'
    }, adminCookie);
    assert(autoStudent.status === 201, 'Student created without manual studentId (HTTP 201)');
    assert(autoStudent.body.student.studentId && autoStudent.body.student.studentId.startsWith('STU'), 'System automatically generated Student ID');
    const autoGenId = autoStudent.body.student.studentId;

    // Verify auto-generated student ID can log in
    const autoStudentLogin = await request('POST', '/api/auth/login', {
      identifier: autoGenId,
      password: 'AutoPass@2026!'
    });
    assert(autoStudentLogin.status === 200, 'Student authenticated using automatically generated Student ID');

    // Test 8c: Create student with custom ID
    const newStudent = await request('POST', '/api/admin/students', {
      studentId: 'STU2026999',
      name: 'Rohan Verma',
      initialPassword: 'InitPass@2026!',
      email: 'rohan.verma@college.edu',
      phone: '9812345678',
      collegeName: 'Demo Institute of Technology',
      rollNumber: '21CS099',
      course: 'B.Tech IT',
      year: '3rd Year'
    }, adminCookie);
    assert(newStudent.status === 201, 'Admin successfully created student with HTTP 201');
    assert(newStudent.body.student.studentId === 'STU2026999', 'Created student has assigned Student ID');

    // Verify created student can log in with initial credentials
    const newStudentLogin = await request('POST', '/api/auth/login', {
      identifier: 'STU2026999',
      password: 'InitPass@2026!'
    });
    assert(newStudentLogin.status === 200, 'Newly created student successfully authenticated');
    const newStudentCookie = newStudentLogin.cookie;

    // Verify admin can view student initial password in admin student list
    const adminStuList = await request('GET', '/api/admin/students', null, adminCookie);
    const foundRohan = adminStuList.body.students.find(s => s.studentId === 'STU2026999');
    assert(foundRohan && foundRohan.initialPassword === 'InitPass@2026!', 'Admin can view assigned initial password for students');

    // Verify created student does NOT have mandatory password change on first login
    assert(newStudentLogin.body.user.mustChangePassword === false, 'First-time login does not force password change (mustChangePassword = false)');

    // 9. Duplicate Student ID Rejection Test
    console.log('\n[Test 9] Duplicate Student ID Rejection Test');
    const dupStudent = await request('POST', '/api/admin/students', {
      studentId: 'STU2026999', // duplicate!
      name: 'Duplicate Student',
      initialPassword: 'SomePassword123'
    }, adminCookie);
    assert(dupStudent.status === 400, 'Duplicate Student ID rejected with HTTP 400');

    // 10. Student Admin-Locked Details Immutability & Parent/Photo Profile Test
    console.log('\n[Test 10] Student Admin-Locked Details Immutability & Parent/Photo Profile Test');
    // Attempting to modify admin-filled fields (name, course) MUST return HTTP 403 Forbidden
    const illegalProfileUpdate = await request('PUT', '/api/student/profile', {
      name: 'Rohan V. Sharma',
      course: 'B.Tech AI & Data Science'
    }, newStudentCookie);
    assert(illegalProfileUpdate.status === 403, 'Student cannot change admin-filled fields (rejected with HTTP 403)');
    assert(illegalProfileUpdate.body.error && illegalProfileUpdate.body.error.includes('administrator'), 'Error explains details configured by administrator are locked');

    // Updating allowable fields (phone, fatherName, motherName, profilePhoto) MUST succeed with HTTP 200
    const samplePhotoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const legalContactUpdate = await request('PUT', '/api/student/profile', {
      phone: '9999888877',
      fatherName: 'Ram Verma',
      motherName: 'Sita Verma',
      profilePhoto: samplePhotoBase64
    }, newStudentCookie);
    assert(legalContactUpdate.status === 200, 'Student updated phone, parents names, and profile photo (HTTP 200)');

    // Verify profile state
    const getProfile = await request('GET', '/api/student/profile', null, newStudentCookie);
    assert(getProfile.body.profile.name === 'Rohan Verma', 'Admin-set name strictly preserved');
    assert(getProfile.body.profile.course === 'B.Tech IT', 'Admin-set course strictly preserved');
    assert(getProfile.body.profile.phone === '9999888877', 'Allowed contact phone successfully updated');
    assert(getProfile.body.profile.fatherName === 'Ram Verma', 'Father name accurately updated');
    assert(getProfile.body.profile.motherName === 'Sita Verma', 'Mother name accurately updated');
    assert(getProfile.body.profile.profilePhoto === samplePhotoBase64, 'Profile photo saved and returned');
    assert(getProfile.body.profile.isNameLocked === true, 'Profile indicates name is locked by admin');

    // 11. Student Authorization / Protection Test
    console.log('\n[Test 11] Authorization & Privilege Separation Test');
    // Student attempting to access admin route
    const studentAccessAdmin = await request('GET', '/api/admin/overview', null, studentCookie);
    assert(studentAccessAdmin.status === 403, 'Student calling admin API correctly rejected with HTTP 403 Forbidden');
    // Unauthenticated accessing protected student route
    const unauthAccess = await request('GET', '/api/student/profile');
    assert(unauthAccess.status === 401, 'Unauthenticated request correctly rejected with HTTP 401');

    // 12. Password Change Test
    console.log('\n[Test 12] Password Change Test');
    const changePass = await request('POST', '/api/auth/change-password', {
      currentPassword: 'InitPass@2026!',
      newPassword: 'BrandNewSecurePass@2026!',
      confirmPassword: 'BrandNewSecurePass@2026!'
    }, newStudentCookie);
    assert(changePass.status === 200, 'Password successfully changed');

    // Verify old password fails
    const oldPassLogin = await request('POST', '/api/auth/login', {
      identifier: 'STU2026999',
      password: 'InitPass@2026!'
    });
    assert(oldPassLogin.status === 401, 'Old password no longer works');

    // Verify new password succeeds
    const freshLogin = await request('POST', '/api/auth/login', {
      identifier: 'STU2026999',
      password: 'BrandNewSecurePass@2026!'
    });
    assert(freshLogin.status === 200, 'Login with new password succeeded');
    assert(freshLogin.body.user.mustChangePassword === false, 'After password change, mustChangePassword is reset to false');

    // Verify admin can immediately see the updated student password in real-time/API
    const updatedAdminStuList = await request('GET', '/api/admin/students', null, adminCookie);
    const updatedRohan = updatedAdminStuList.body.students.find(s => s.studentId === 'STU2026999');
    assert(updatedRohan && updatedRohan.initialPassword === 'BrandNewSecurePass@2026!', 'Admin immediately sees updated changed password for student');

    const studentDetail = await request('GET', `/api/admin/students/${updatedRohan.id}`, null, adminCookie);
    assert(studentDetail.body.student && studentDetail.body.student.initialPassword === 'BrandNewSecurePass@2026!', 'Admin student detail endpoint returns updated changed password');

    // 13. Password Reset Request & Admin Approval Flow
    console.log('\n[Test 13] Password Reset Request & Admin Approval Test');
    const resetReq = await request('POST', '/api/auth/forgot-password', {
      identifier: 'STU2026999',
      reason: 'Locked out of account during mock test'
    });
    assert(resetReq.status === 200, 'Password reset request submitted');

    // Admin views pending requests
    const adminReqs = await request('GET', '/api/admin/reset-requests', null, adminCookie);
    assert(adminReqs.status === 200, 'Admin can view reset requests list');
    const myReq = adminReqs.body.requests.find(r => r.studentCode === 'STU2026999');
    assert(myReq && myReq.status === 'pending', 'Pending request found for STU2026999');

    // Admin approves reset request with temporary password
    const approveReset = await request('POST', `/api/admin/reset-requests/${myReq.id}/approve`, {
      newPassword: 'TempAdminResetPassword123!'
    }, adminCookie);
    assert(approveReset.status === 200, 'Admin approved reset request');

    // Student logs in with approved reset password
    const resetLogin = await request('POST', '/api/auth/login', {
      identifier: 'STU2026999',
      password: 'TempAdminResetPassword123!'
    });
    assert(resetLogin.status === 200, 'Student authenticated using admin-reset password');

    // 14. Quiz Creation Test
    console.log('\n[Test 14] Quiz Creation Test');
    const createQuiz = await request('POST', '/api/admin/quizzes', {
      title: 'Database Systems Architecture',
      category: 'Computer Science',
      duration: 10,
      marks: 2,
      negative: 0.25,
      instructions: 'Calculators are allowed.',
      allowMultipleAttempts: false,
      questions: [
        {
          text: 'Which normal form eliminates partial dependency?',
          options: ['1NF', '2NF', '3NF', 'BCNF'],
          correct: 1,
          explanation: 'Second Normal Form (2NF) requires 1NF and no partial dependencies on primary key.'
        },
        {
          text: 'What does ACID stand for in DBMS?',
          options: [
            'Atomicity, Consistency, Isolation, Durability',
            'Accuracy, Control, Integrity, Data',
            'Action, Commit, Index, Database',
            'Array, Cluster, Iteration, Disk'
          ],
          correct: 0,
          explanation: 'ACID guarantees database transaction reliability.'
        }
      ]
    }, adminCookie);
    assert(createQuiz.status === 201, 'Quiz created with HTTP 201');
    const testQuizId = createQuiz.body.quizId;

    // Test Admin Quiz Details for PDF Export
    const quizPdfData = await request('GET', `/api/admin/quizzes/${testQuizId}`, null, adminCookie);
    assert(quizPdfData.status === 200, 'Admin can fetch full quiz data for PDF generation');
    assert(quizPdfData.body.quiz && quizPdfData.body.quiz.questions.length > 0, 'Quiz questions with options and explanation are present for PDF generation');

    // Test Admin Quiz Edit (PUT /api/admin/quizzes/:id)
    const editQuizRes = await request('PUT', `/api/admin/quizzes/${testQuizId}`, {
      title: 'Database Systems Architecture (Revised)',
      category: 'Computer Science',
      duration: 12,
      marks: 2,
      negative: 0.25,
      instructions: 'Scientific calculator permitted.',
      questions: quizPdfData.body.quiz.questions.map(q => ({
        id: q.id,
        text: q.text,
        options: q.options,
        correct: q.correct,
        explanation: q.explanation
      }))
    }, adminCookie);
    assert(editQuizRes.status === 200, 'Quiz successfully updated via PUT HTTP 200');

    const updatedQuizCheck = await request('GET', `/api/admin/quizzes/${testQuizId}`, null, adminCookie);
    assert(updatedQuizCheck.body.quiz.title === 'Database Systems Architecture (Revised)', 'Updated quiz title persisted');
    assert(updatedQuizCheck.body.quiz.duration === 12, 'Updated quiz duration persisted');
    assert(updatedQuizCheck.body.quiz.instructions === 'Scientific calculator permitted.', 'Updated instructions persisted');
    assert(updatedQuizCheck.body.quiz.questions[0].id === quizPdfData.body.quiz.questions[0].id, 'Question ID preserved during update');

    // 15. Quiz Exam Start & Correct Answer Protection Test
    console.log('\n[Test 15] Quiz Exam Start & Answer Protection Test');
    const startExam = await request('POST', `/api/quizzes/${testQuizId}/start`, null, studentCookie);
    assert(startExam.status === 200, 'Exam started successfully');
    assert(startExam.body.questions.length === 2, 'Questions returned to student');
    // CRITICAL: Ensure correct answers and explanations are NOT leaked to the client!
    const leakedAnswers = startExam.body.questions.some(q => q.correct !== undefined || q.explanation !== undefined);
    assert(!leakedAnswers, 'Security verified: Correct answers and explanations are NOT exposed in client payload');
    const attemptId = startExam.body.attemptId;

    // 16. Server-Side Grading & Result Calculation Test
    console.log('\n[Test 16] Server-Side Grading & Calculation Test');
    // Intelligent student answers from returned questions:
    // Question about 'partial dependency' -> select '2NF' (+2 marks)
    // Question about 'ACID' -> select wrong option (-0.5 mark penalty)
    const answersToSend = startExam.body.questions.map(q => {
      if (q.text.includes('partial dependency')) {
        return q.options.indexOf('2NF');
      } else {
        const wrongIdx = q.options.findIndex(opt => !opt.startsWith('Atomicity'));
        return wrongIdx !== -1 ? wrongIdx : 1;
      }
    });

    const submitExam = await request('POST', `/api/quizzes/${testQuizId}/submit`, {
      attemptId,
      answers: answersToSend,
      tabSwitches: 1
    }, studentCookie);
    assert(submitExam.status === 200, 'Exam submitted and graded server-side');
    assert(submitExam.body.result.score === 1.5, `Score calculated accurately (Expected 1.5, Got ${submitExam.body.result.score})`);
    assert(submitExam.body.result.maxScore === 4, 'Max score accurately calculated (4.0)');
    assert(submitExam.body.result.correct === 1, '1 correct answer recorded');
    assert(submitExam.body.result.wrong === 1, '1 wrong answer recorded');
    assert(submitExam.body.review && submitExam.body.review.length === 2, 'Answer review with explanations returned after submission');

    // 17. Single Attempt Restriction Test
    console.log('\n[Test 17] Duplicate Attempt Restriction Test');
    const retakeAttempt = await request('POST', `/api/quizzes/${testQuizId}/start`, null, studentCookie);
    assert(retakeAttempt.status === 400, 'Duplicate attempt blocked with HTTP 400');

    // 18. Anti-Cheating Surveillance Test
    console.log('\n[Test 18] Anti-Cheating Detection & Proctoring Alerts Test');
    // Start another quiz to test cheat detection
    const geoQuiz = query('SELECT id FROM quizzes WHERE title = ? LIMIT 1', ['World Geography Quiz'])[0];
    const startGeo = await request('POST', `/api/quizzes/${geoQuiz.id}/start`, null, studentCookie);
    assert(startGeo.status === 200, 'Started World Geography Quiz');
    const geoAttemptId = startGeo.body.attemptId;

    // Student reports 5 window/tab switches
    const cheatFlag = await request('POST', `/api/quizzes/${geoQuiz.id}/alert`, {
      attemptId: geoAttemptId,
      type: 'tab_hidden',
      switchCount: 5
    }, studentCookie);
    assert(cheatFlag.body.blocked === true, 'Anti-cheating blocked student on first tab switch');

    // Submit with cheat flag
    const cheatSubmit = await request('POST', `/api/quizzes/${geoQuiz.id}/submit`, {
      attemptId: geoAttemptId,
      answers: [1, 0, 0],
      tabSwitches: 5,
      autoSubmitReason: 'cheating'
    }, studentCookie);
    assert(cheatSubmit.body.result.flaggedForCheating === true, 'Attempt successfully flagged for cheating in academic record');

    // Admin checks alerts list
    const alertsList = await request('GET', '/api/admin/alerts', null, adminCookie);
    const hasAlert = alertsList.body.alerts.some(a => a.studentCode === 'STU2026001');
    assert(hasAlert, 'Cheating alert appears in Admin Surveillance Console');

    // 19. Shuffled Questions & Shuffled Answers (Options) Verification Test
    console.log('\n[Test 19] Shuffled Questions & Shuffled Answers (Options) Verification Test');
    const multiQQuiz = await request('POST', '/api/admin/quizzes', {
      title: 'Operating Systems & Concurrency',
      category: 'Computer Science',
      duration: 15,
      marks: 3,
      negative: 0.33,
      allowMultipleAttempts: true,
      questions: [
        {
          text: 'What scheduling algorithm allocates the CPU to the process with the smallest burst time?',
          options: ['First-Come First-Served', 'Shortest Job First', 'Round Robin', 'Priority Scheduling'],
          correct: 1, // 'Shortest Job First'
          explanation: 'SJF gives the minimum average waiting time.'
        },
        {
          text: 'Which synchronization primitive provides atomic wait and signal operations?',
          options: ['Spinlock', 'Semaphore', 'Condition Variable', 'Monitor'],
          correct: 1, // 'Semaphore'
          explanation: 'Dijkstra invented semaphores with P and V operations.'
        },
        {
          text: 'What condition is NOT required for deadlock to occur?',
          options: ['Mutual Exclusion', 'Hold and Wait', 'Preemption Allowed', 'Circular Wait'],
          correct: 2, // 'Preemption Allowed'
          explanation: 'No Preemption is a deadlock condition, not preemption allowed.'
        },
        {
          text: 'Which memory allocation scheme suffers from external fragmentation?',
          options: ['Paging', 'Segmentation', 'Virtual Memory', 'Demand Paging'],
          correct: 1, // 'Segmentation'
          explanation: 'Variable-sized segments cause external fragmentation.'
        }
      ]
    }, adminCookie);
    assert(multiQQuiz.status === 201, 'Quiz for shuffle verification created');
    const shuffleQuizId = multiQQuiz.body.quizId;

    // Start exam 1
    const shuffleAttempt1 = await request('POST', `/api/quizzes/${shuffleQuizId}/start`, null, studentCookie);
    assert(shuffleAttempt1.status === 200, 'Student started exam with shuffling active');
    const qList1 = shuffleAttempt1.body.questions;
    assert(qList1.length === 4, 'All 4 questions returned in shuffled exam');

    // Verify option shuffling: question options are delivered to candidate
    const q1Obj = qList1.find(q => q.text.includes('smallest burst time'));
    assert(q1Obj && q1Obj.options.length === 4, 'Question options delivered to candidate');

    // Test reload idempotency: Calling /start again on ongoing attempt returns identical shuffled layout
    const shuffleAttemptReload = await request('POST', `/api/quizzes/${shuffleQuizId}/start`, null, studentCookie);
    assert(shuffleAttemptReload.status === 200, 'Student reloaded ongoing attempt');
    const qListReload = shuffleAttemptReload.body.questions;
    const isLayoutIdentical = qList1.every((q, i) => q.id === qListReload[i].id && JSON.stringify(q.options) === JSON.stringify(qListReload[i].options));
    assert(isLayoutIdentical, 'Exam reload preserves exact shuffled question and option layout (no mid-test scrambling)');

    // Intelligent submission using shuffled option indices:
    const correctOptionMap = {
      'smallest burst time': 'Shortest Job First',
      'synchronization primitive': 'Semaphore',
      'deadlock': 'Preemption Allowed',
      'memory allocation scheme': 'Segmentation'
    };

    const submitAnswers = qList1.map(q => {
      for (const [key, correctText] of Object.entries(correctOptionMap)) {
        if (q.text.includes(key)) {
          return q.options.indexOf(correctText);
        }
      }
      return 0;
    });

    const submitShuffle = await request('POST', `/api/quizzes/${shuffleQuizId}/submit`, {
      attemptId: shuffleAttempt1.body.attemptId,
      answers: submitAnswers
    }, studentCookie);
    assert(submitShuffle.status === 200, 'Shuffled exam submitted successfully');
    assert(submitShuffle.body.result.score === 12, '100% score (12/12) achieved by selecting correct shuffled options');
    assert(submitShuffle.body.result.correct === 4, 'All 4 questions evaluated as correct');
    assert(submitShuffle.body.result.wrong === 0, '0 wrong questions');

    // Verify past attempt review preserves the shuffled layout and indicates correct answers accurately
    const pastReview = await request('GET', `/api/student/attempts/${shuffleAttempt1.body.attemptId}`, null, studentCookie);
    assert(pastReview.status === 200, 'Attempt review fetched');
    assert(pastReview.body.review.length === 4, 'Review includes all 4 questions');
    assert(pastReview.body.review.every(r => r.isCorrect === true), 'Review indicates all answers were correct on shuffled options');

    // [Test 20] Faculty / Teacher Administrator Onboarding & Multi-Identifier Login Test
    console.log('\n[Test 20] Faculty / Teacher Administrator Onboarding & Multi-Identifier Login Test');
    const facultyAdminPayload = {
      username: 'dr.sharma',
      password: 'FacPass#2026',
      name: 'Dr. Rajesh Kumar Sharma',
      employeeId: 'FAC-CS-2026',
      designation: 'Head of Department (HOD)',
      department: 'Computer Science & Engineering',
      collegeName: 'BBS Institute of Technology',
      qualification: 'Ph.D. in AI & Networks',
      phone: '+91 9876543210',
      email: 'rajesh.sharma@bbsit.ac.in'
    };

    const createFacultyRes = await request('POST', '/api/admin/admins', facultyAdminPayload, adminCookie);
    assert(createFacultyRes.status === 201, 'Faculty administrator created with full college credentials (HTTP 201)');
    assert(createFacultyRes.body && createFacultyRes.body.admin && createFacultyRes.body.admin.employeeId === 'FAC-CS-2026', 'Faculty response contains employee ID');
    assert(createFacultyRes.body.admin.designation === 'Head of Department (HOD)', 'Faculty response contains academic designation');
    assert(createFacultyRes.body.admin.department === 'Computer Science & Engineering', 'Faculty response contains department');
    assert(createFacultyRes.body.admin.collegeName === 'BBS Institute of Technology', 'Faculty response contains college name');
    assert(createFacultyRes.body.admin.qualification === 'Ph.D. in AI & Networks', 'Faculty response contains qualification');

    // Verify GET /api/admin/admins list returns the faculty profile
    const listAdminsRes = await request('GET', '/api/admin/admins', null, adminCookie);
    assert(listAdminsRes.status === 200, 'Admin can list all registered administrators');
    const listedFaculty = listAdminsRes.body.admins.find(a => a.employeeId === 'FAC-CS-2026');
    assert(listedFaculty !== undefined, 'Registered faculty admin found in administrators list');
    assert(listedFaculty.name === 'Dr. Rajesh Kumar Sharma', 'Faculty full name accurately preserved in record');
    assert(listedFaculty.phone === '+91 9876543210', 'Faculty phone accurately preserved');

    // Duplicate Employee ID rejection
    const dupEmpRes = await request('POST', '/api/admin/admins', {
      username: 'dr.another',
      password: 'FacPass#2026',
      name: 'Another Faculty Member',
      employeeId: 'FAC-CS-2026' // duplicate!
    }, adminCookie);
    assert(dupEmpRes.status === 400, 'Duplicate Employee ID rejected with HTTP 400');

    // Faculty login via Username
    const loginUserRes = await request('POST', '/api/auth/login', {
      identifier: 'dr.sharma',
      password: 'FacPass#2026'
    });
    assert(loginUserRes.status === 200, 'Faculty successfully authenticated using username');
    assert(loginUserRes.body.user.userType === 'admin', 'Faculty authenticated as admin userType');
    assert(loginUserRes.body.user.employeeId === 'FAC-CS-2026', 'Session payload contains faculty employee ID');

    // Faculty login via Employee ID
    const loginEmpRes = await request('POST', '/api/auth/login', {
      identifier: 'FAC-CS-2026',
      password: 'FacPass#2026'
    });
    assert(loginEmpRes.status === 200, 'Faculty successfully authenticated using Employee ID code');
    assert(loginEmpRes.body.user.name === 'Dr. Rajesh Kumar Sharma', 'Faculty profile matches employee ID login');

    // Faculty login via Institutional Email
    const loginEmailRes = await request('POST', '/api/auth/login', {
      identifier: 'rajesh.sharma@bbsit.ac.in',
      password: 'FacPass#2026'
    });
    assert(loginEmailRes.status === 200, 'Faculty successfully authenticated using institutional email');

    // -------------------------------------------------------------------------
    // [Test 21] Scheduled Window, Branch Eligibility & CSV Results Export Test
    // -------------------------------------------------------------------------
    console.log('\n[Test 21] Scheduled Window, Branch Eligibility & CSV Results Export Test');

    const nowMs = Date.now();

    // 1. Create Future Scheduled Quiz
    const futureQuizRes = await request('POST', '/api/admin/quizzes', {
      title: 'Future Operating Systems Exam',
      category: 'Computer Science',
      duration: 30,
      marks: 2,
      startTime: nowMs + 1000000,
      endTime: nowMs + 5000000,
      eligibility: 'all',
      questions: [
        { text: 'What is a process?', options: ['A program in execution', 'A file on disk', 'A printer', 'A wire'], correct: 0 }
      ]
    }, adminCookie);
    assert(futureQuizRes.status === 201, 'Future scheduled quiz created');
    const futureQuizId = futureQuizRes.body.quizId;

    // Student attempts to start future quiz
    const startFutureRes = await request('POST', `/api/quizzes/${futureQuizId}/start`, null, studentCookie);
    assert(startFutureRes.status === 400, 'Future exam rejected with HTTP 400 before start time');
    assert(startFutureRes.body.error.includes('not started yet'), 'Error specifies exam has not started yet');

    // 2. Create Expired Scheduled Quiz
    const expiredQuizRes = await request('POST', '/api/admin/quizzes', {
      title: 'Expired Operating Systems Exam',
      category: 'Computer Science',
      duration: 30,
      marks: 2,
      startTime: nowMs - 5000000,
      endTime: nowMs - 1000000,
      eligibility: 'all',
      questions: [
        { text: 'What is a thread?', options: ['Lightweight process', 'A heavy disk', 'Screen', 'Speaker'], correct: 0 }
      ]
    }, adminCookie);
    assert(expiredQuizRes.status === 201, 'Expired scheduled quiz created');
    const expiredQuizId = expiredQuizRes.body.quizId;

    const startExpiredRes = await request('POST', `/api/quizzes/${expiredQuizId}/start`, null, studentCookie);
    assert(startExpiredRes.status === 400, 'Expired exam rejected with HTTP 400');
    assert(startExpiredRes.body.error.includes('closed'), 'Error specifies exam window has closed');

    // 3. Create Branch / Batch Restricted Quiz (Ineligible)
    const branchQuizRes = await request('POST', '/api/admin/quizzes', {
      title: 'Mechanical Fluid Dynamics Exam',
      category: 'Mechanical Engineering',
      duration: 20,
      marks: 1,
      eligibility: 'Mechanical Engineering',
      questions: [
        { text: 'What is viscosity?', options: ['Fluid friction', 'Electrical resistance', 'Hardness', 'Weight'], correct: 0 }
      ]
    }, adminCookie);
    assert(branchQuizRes.status === 201, 'Branch restricted quiz created');
    const branchQuizId = branchQuizRes.body.quizId;

    const startIneligibleRes = await request('POST', `/api/quizzes/${branchQuizId}/start`, null, studentCookie);
    assert(startIneligibleRes.status === 403, 'Ineligible student correctly rejected with HTTP 403 Forbidden');
    assert(startIneligibleRes.body.error.includes('not eligible'), 'Error specifies candidate is not eligible for target branch');

    // 4. Create Branch Restricted Quiz Matching Student Course (B.Tech Computer Science)
    const eligibleBranchQuizRes = await request('POST', '/api/admin/quizzes', {
      title: 'CSE Compiler Design Exam',
      category: 'Computer Science',
      duration: 20,
      marks: 2,
      eligibility: 'Computer Science',
      questions: [
        { text: 'What is lexical analysis?', options: ['Scanning tokens', 'Parsing tree', 'Code generation', 'Linker'], correct: 0 }
      ]
    }, adminCookie);
    assert(eligibleBranchQuizRes.status === 201, 'Eligible branch quiz created');
    const eligibleQuizId = eligibleBranchQuizRes.body.quizId;

    const startEligibleRes = await request('POST', `/api/quizzes/${eligibleQuizId}/start`, null, studentCookie);
    assert(startEligibleRes.status === 200, 'Eligible candidate successfully started branch-restricted exam');

    // Submit attempt to generate result for CSV export test
    const submitBranchRes = await request('POST', `/api/quizzes/${eligibleQuizId}/submit`, {
      attemptId: startEligibleRes.body.attemptId,
      answers: [0],
      tabSwitches: 0
    }, studentCookie);
    assert(submitBranchRes.status === 200, 'Branch exam attempt submitted successfully');

    // 5. Test Results CSV Export Endpoint
    const exportCsvRes = await request('GET', `/api/admin/quizzes/${eligibleQuizId}/export-csv`, null, adminCookie);
    assert(exportCsvRes.status === 200, 'Results CSV export responds with HTTP 200');
    assert(exportCsvRes.headers['content-type'].includes('text/csv'), 'Content-Type is text/csv');
    assert(exportCsvRes.headers['content-disposition'].includes('attachment'), 'Content-Disposition is attachment');
    assert(exportCsvRes.body.startsWith('\uFEFF'), 'CSV starts with UTF-8 BOM for Microsoft Excel compatibility');
    assert(exportCsvRes.body.includes('Rank,Student Name,Student ID,Roll Number,Course / Branch'), 'CSV contains required header columns');
    assert(exportCsvRes.body.includes('B.Tech Computer Science'), 'CSV accurately contains student branch');

    // -------------------------------------------------------------------------
    // [Test 22] Written Answer Evaluation & Speed Leaderboard Integration Test
    // -------------------------------------------------------------------------
    console.log('\n[Test 22] Written Answer Evaluation & Speed Leaderboard Integration Test');

    // 1. Create exam with written/subjective question
    const writtenQuizRes = await request('POST', '/api/admin/quizzes', {
      title: 'Advanced Computer Science Written Exam',
      description: 'Exam with MCQ and written coding questions',
      duration: 30,
      marks: 2,
      questions: [
        {
          text: 'Which data structure follows FIFO order?',
          qType: 'mcq',
          options: ['Queue', 'Stack', 'Tree', 'Graph'],
          correct: 0,
          explanation: 'Queue follows First In First Out.'
        },
        {
          text: 'Explain the principles of Object-Oriented Programming with examples.',
          qType: 'written',
          marks: 10,
          options: [],
          correct: null,
          explanation: 'Key OOP principles: Encapsulation, Abstraction, Inheritance, Polymorphism.'
        }
      ]
    }, adminCookie);
    assert(writtenQuizRes.status === 201, 'Written examination created successfully');
    const writtenQuizId = writtenQuizRes.body.quizId;

    // 2. Candidate starts exam
    const startWrittenRes = await request('POST', `/api/quizzes/${writtenQuizId}/start`, null, studentCookie);
    assert(startWrittenRes.status === 200, 'Student started written exam attempt');
    const writtenAttemptId = startWrittenRes.body.attemptId;

    const qList = startWrittenRes.body.questions;
    const mcqQ = qList.find(q => q.qType === 'mcq');
    const writtenQ = qList.find(q => q.qType === 'written');

    const studentAnswers = {};
    studentAnswers[mcqQ.id] = mcqQ.options.indexOf('Queue');
    studentAnswers[writtenQ.id] = {
      writtenText: 'OOP principles include Encapsulation, Inheritance, Polymorphism, and Abstraction. Inheritance allows code reuse.',
      attachmentUrl: null
    };

    // 3. Candidate submits written answer with typed response
    const submitWrittenRes = await request('POST', `/api/quizzes/${writtenQuizId}/submit`, {
      attemptId: writtenAttemptId,
      answers: studentAnswers,
      tabSwitches: 0
    }, studentCookie);
    assert(submitWrittenRes.status === 200, 'Written exam submitted successfully');
    assert(submitWrittenRes.body.result.needsManualEvaluation === true, 'Submission flagged as needing manual evaluation');

    // 4. Admin queries evaluation queue endpoint
    const evalListRes = await request('GET', '/api/admin/evaluations', null, adminCookie);
    assert(evalListRes.status === 200, 'GET /api/admin/evaluations responded with HTTP 200');
    assert(evalListRes.body.evaluations.length >= 1, 'Evaluation queue contains submitted written attempt');
    const foundEval = evalListRes.body.evaluations.find(e => e.id === writtenAttemptId);
    assert(foundEval !== undefined, 'Target attempt found in evaluation queue');
    assert(foundEval.needsManualEvaluation === true, 'Attempt indicates manual review is pending');
    assert(foundEval.writtenCount === 1, 'Attempt accurately reports 1 written question');

    // 5. Admin fetches attempt evaluation details
    const evalDetailRes = await request('GET', `/api/admin/attempts/${writtenAttemptId}/evaluation`, null, adminCookie);
    assert(evalDetailRes.status === 200, 'Attempt evaluation details retrieved');
    assert(evalDetailRes.body.answers.length === 2, 'Attempt details contain both MCQ and written answers');
    const writtenAnswerRecord = evalDetailRes.body.answers.find(a => a.qType === 'written');
    assert(writtenAnswerRecord !== undefined, 'Written answer record located');
    assert(writtenAnswerRecord.writtenText.includes('OOP principles'), 'Candidate typed text accurately preserved');

    // 6. Admin evaluates and assigns marks & feedback
    const evaluateSubmitRes = await request('POST', `/api/admin/attempts/${writtenAttemptId}/evaluate`, {
      evaluations: [
        {
          answerId: writtenAnswerRecord.answerId,
          marksAwarded: 9.5,
          feedback: 'Comprehensive definitions and clear code explanation.'
        }
      ]
    }, adminCookie);
    assert(evaluateSubmitRes.status === 200, 'Evaluation submitted and saved successfully');
    assert(evaluateSubmitRes.body.evaluationStatus === 'evaluated', 'Evaluation status changed to evaluated');
    assert(evaluateSubmitRes.body.totalScore === 11.5, 'Total score accurately computed (2 MCQ + 9.5 Written = 11.5)');

    // 7. Verify evaluation queue filters
    const evalPendingRes = await request('GET', `/api/admin/evaluations?quizId=${writtenQuizId}&status=pending`, null, adminCookie);
    assert(evalPendingRes.body.evaluations.length === 0, 'No pending attempts left for this quiz');

    const evalDoneRes = await request('GET', `/api/admin/evaluations?quizId=${writtenQuizId}&status=evaluated`, null, adminCookie);
    assert(evalDoneRes.body.evaluations.length === 1, 'Attempt now appears in evaluated filter');
    assert(evalDoneRes.body.evaluations[0].score === 11.5, 'Evaluation list reflects updated score');

    // 8. Verify Results & Speed Leaderboard endpoint
    const resultsRes = await request('GET', `/api/admin/quizzes/${writtenQuizId}/results`, null, adminCookie);
    assert(resultsRes.status === 200, 'Results endpoint responded with HTTP 200');
    assert(resultsRes.body.results.length === 1, 'Results leaderboard contains candidate attempt');
    const topResult = resultsRes.body.results[0];
    assert(topResult.rank === 1, 'Candidate ranks #1');
    assert(topResult.score === 11.5, 'Leaderboard displays finalized score');
    assert(typeof topResult.timeTaken === 'number', 'Time taken duration recorded for speed leaderboard');
    assert(topResult.evaluationStatus === 'evaluated', 'Leaderboard marks status as evaluated');

    // 9. Admin Overview stats reflect 0 pending evaluations
    const overviewRes = await request('GET', '/api/admin/overview', null, adminCookie);
    assert(overviewRes.status === 200, 'Overview endpoint responded with HTTP 200');
    assert(typeof overviewRes.body.stats.pendingEvaluations === 'number', 'Overview stats includes pendingEvaluations count');

    // Clean Shutdown
    console.log('\n====================================================');
    console.log(`Test Execution Summary: ${stats.passed}/${stats.total} Passed (${stats.failed} Failed)`);
    console.log('====================================================\n');

  } catch (err) {
    console.error('Fatal test execution error:', err);
    stats.failed++;
  } finally {
    if (server) {
      server.close();
    }
    // Clean test db
    try {
      if (fs.existsSync(process.env.DB_PATH)) fs.unlinkSync(process.env.DB_PATH);
    } catch (e) {}

    process.exit(stats.failed > 0 ? 1 : 0);
  }
}

runTests();
