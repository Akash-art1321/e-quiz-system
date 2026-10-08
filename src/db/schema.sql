-- QuizNest Database Schema
-- SQLite3 with Foreign Keys enabled

PRAGMA foreign_keys = ON;

-- 1. Colleges Table
CREATE TABLE IF NOT EXISTS colleges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    domain TEXT,
    created_at INTEGER NOT NULL
);

-- 2. Admins Table (Institutional Administrators & Faculty Teachers)
CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    employee_id TEXT,
    designation TEXT,
    department TEXT,
    college_name TEXT,
    phone TEXT,
    qualification TEXT,
    joining_date TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 3. Students Table (Self-registration disabled; admin-created only)
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    college_id TEXT REFERENCES colleges(id) ON DELETE SET NULL,
    college_name TEXT,
    roll_number TEXT,
    course TEXT,
    year TEXT,
    father_name TEXT,
    mother_name TEXT,
    profile_photo TEXT,
    initial_password TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    verified INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 4. Sessions Table (Secure session-based auth)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_type TEXT NOT NULL, -- 'admin' or 'student'
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

-- 5. Password Reset Requests Table
CREATE TABLE IF NOT EXISTS password_reset_requests (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    student_code TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'expired'
    token TEXT UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    resolved_by TEXT REFERENCES admins(id) ON DELETE SET NULL
);

-- 6. Quizzes Table
CREATE TABLE IF NOT EXISTS quizzes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    duration INTEGER NOT NULL DEFAULT 10, -- in minutes
    marks REAL NOT NULL DEFAULT 1.0,
    negative REAL NOT NULL DEFAULT 0.0, -- fraction deducted per wrong, e.g. 0.25
    instructions TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    start_time INTEGER,
    end_time INTEGER,
    eligibility TEXT DEFAULT 'all',
    allow_multiple_attempts INTEGER NOT NULL DEFAULT 0,
    upload_buffer_minutes INTEGER NOT NULL DEFAULT 0, -- extra grace time for handwritten copy uploads
    require_webcam INTEGER NOT NULL DEFAULT 1,
    require_fullscreen INTEGER NOT NULL DEFAULT 1,
    created_by TEXT REFERENCES admins(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 7. Questions Table
CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    q_order INTEGER NOT NULL DEFAULT 0,
    q_type TEXT NOT NULL DEFAULT 'mcq', -- 'mcq' or 'written'/'subjective'
    text TEXT NOT NULL,
    image_url TEXT, -- diagram or image attachment
    options TEXT NOT NULL, -- JSON array of strings: '["Option A", "Option B", ...]'
    correct INTEGER NOT NULL DEFAULT 0, -- 0-based option index for MCQ
    marks REAL, -- custom question marks (if null, falls back to quiz marks)
    explanation TEXT,
    created_at INTEGER NOT NULL
);

-- 8. Attempts Table
CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    student_code TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 0.0,
    max_score REAL NOT NULL DEFAULT 0.0,
    percentage REAL NOT NULL DEFAULT 0.0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    time_taken INTEGER NOT NULL DEFAULT 0, -- in seconds
    tab_switches INTEGER NOT NULL DEFAULT 0,
    flagged_for_cheating INTEGER NOT NULL DEFAULT 0,
    is_blocked INTEGER NOT NULL DEFAULT 0,
    needs_manual_evaluation INTEGER NOT NULL DEFAULT 0,
    evaluation_status TEXT DEFAULT 'auto_graded', -- 'auto_graded', 'pending_review', 'evaluated'
    proctor_snapshots TEXT, -- JSON array of proctoring webcam snapshots
    status TEXT NOT NULL DEFAULT 'completed', -- 'in_progress', 'completed', 'timed_out', 'terminated_cheating'
    started_at INTEGER NOT NULL,
    submitted_at INTEGER NOT NULL,
    shuffled_data TEXT
);

-- 9. Answers Table (Individual question answers for each attempt)
CREATE TABLE IF NOT EXISTS answers (
    id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected_option INTEGER, -- NULL if skipped or subjective
    written_text TEXT, -- typed response for subjective questions
    attachment_url TEXT, -- uploaded handwritten copy image or pdf
    is_correct INTEGER NOT NULL DEFAULT 0,
    marks_awarded REAL NOT NULL DEFAULT 0.0,
    feedback TEXT, -- examiner remarks/feedback
    evaluated_by TEXT, -- admin ID who checked
    evaluated_at INTEGER -- epoch ms
);

-- 10. Alerts Table (Suspicious activity / cheating detections)
CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    attempt_id TEXT REFERENCES attempts(id) ON DELETE SET NULL,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    quiz_title TEXT NOT NULL,
    event_type TEXT NOT NULL, -- 'tab_hidden', 'window_blur', 'fullscreen_exit', 'camera_blocked', 'auto_submit'
    switch_count INTEGER NOT NULL DEFAULT 1,
    snapshot_url TEXT, -- webcam evidence snapshot
    first_time INTEGER NOT NULL,
    last_time INTEGER NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,
    resolved_at INTEGER,
    resolved_by TEXT REFERENCES admins(id) ON DELETE SET NULL
);

-- 11. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    user_type TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at INTEGER NOT NULL
);

-- Indexes for Query Performance & Security
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);
CREATE INDEX IF NOT EXISTS idx_students_roll ON students(roll_number);
CREATE INDEX IF NOT EXISTS idx_quizzes_active ON quizzes(is_active);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_reset_reqs_status ON password_reset_requests(status);
