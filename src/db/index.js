const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');
const logger = require('../utils/logger');

// Ensure database directory exists
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db;

try {
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  // Safe runtime column migrations
  try {
    const studentCols = db.prepare("PRAGMA table_info(students)").all().map(c => c.name);
    if (!studentCols.includes('father_name')) {
      db.exec("ALTER TABLE students ADD COLUMN father_name TEXT;");
    }
    if (!studentCols.includes('mother_name')) {
      db.exec("ALTER TABLE students ADD COLUMN mother_name TEXT;");
    }
    if (!studentCols.includes('initial_password')) {
      db.exec("ALTER TABLE students ADD COLUMN initial_password TEXT;");
    }

    const attemptCols = db.prepare("PRAGMA table_info(attempts)").all().map(c => c.name);
    if (!attemptCols.includes('shuffled_data')) {
      db.exec("ALTER TABLE attempts ADD COLUMN shuffled_data TEXT;");
    }
    if (!attemptCols.includes('is_blocked')) {
      db.exec("ALTER TABLE attempts ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0;");
    }
    if (!attemptCols.includes('needs_manual_evaluation')) {
      db.exec("ALTER TABLE attempts ADD COLUMN needs_manual_evaluation INTEGER NOT NULL DEFAULT 0;");
    }
    if (!attemptCols.includes('evaluation_status')) {
      db.exec("ALTER TABLE attempts ADD COLUMN evaluation_status TEXT DEFAULT 'auto_graded';");
    }
    if (!attemptCols.includes('proctor_snapshots')) {
      db.exec("ALTER TABLE attempts ADD COLUMN proctor_snapshots TEXT;");
    }

    const adminCols = db.prepare("PRAGMA table_info(admins)").all().map(c => c.name);
    if (!adminCols.includes('employee_id')) {
      db.exec("ALTER TABLE admins ADD COLUMN employee_id TEXT;");
    }
    if (!adminCols.includes('designation')) {
      db.exec("ALTER TABLE admins ADD COLUMN designation TEXT;");
    }
    if (!adminCols.includes('department')) {
      db.exec("ALTER TABLE admins ADD COLUMN department TEXT;");
    }
    if (!adminCols.includes('college_name')) {
      db.exec("ALTER TABLE admins ADD COLUMN college_name TEXT;");
    }
    if (!adminCols.includes('phone')) {
      db.exec("ALTER TABLE admins ADD COLUMN phone TEXT;");
    }
    if (!adminCols.includes('qualification')) {
      db.exec("ALTER TABLE admins ADD COLUMN qualification TEXT;");
    }
    if (!adminCols.includes('joining_date')) {
      db.exec("ALTER TABLE admins ADD COLUMN joining_date TEXT;");
    }

    const quizCols = db.prepare("PRAGMA table_info(quizzes)").all().map(c => c.name);
    if (!quizCols.includes('start_time')) {
      db.exec("ALTER TABLE quizzes ADD COLUMN start_time INTEGER;");
    }
    if (!quizCols.includes('end_time')) {
      db.exec("ALTER TABLE quizzes ADD COLUMN end_time INTEGER;");
    }
    if (!quizCols.includes('eligibility')) {
      db.exec("ALTER TABLE quizzes ADD COLUMN eligibility TEXT DEFAULT 'all';");
    }
    if (!quizCols.includes('upload_buffer_minutes')) {
      db.exec("ALTER TABLE quizzes ADD COLUMN upload_buffer_minutes INTEGER NOT NULL DEFAULT 0;");
    }
    if (!quizCols.includes('require_webcam')) {
      db.exec("ALTER TABLE quizzes ADD COLUMN require_webcam INTEGER NOT NULL DEFAULT 1;");
    }
    if (!quizCols.includes('require_fullscreen')) {
      db.exec("ALTER TABLE quizzes ADD COLUMN require_fullscreen INTEGER NOT NULL DEFAULT 1;");
    }

    const questionCols = db.prepare("PRAGMA table_info(questions)").all().map(c => c.name);
    if (!questionCols.includes('q_type')) {
      db.exec("ALTER TABLE questions ADD COLUMN q_type TEXT DEFAULT 'mcq';");
    }
    if (!questionCols.includes('image_url')) {
      db.exec("ALTER TABLE questions ADD COLUMN image_url TEXT;");
    }
    if (!questionCols.includes('marks')) {
      db.exec("ALTER TABLE questions ADD COLUMN marks REAL;");
    }

    const answerCols = db.prepare("PRAGMA table_info(answers)").all().map(c => c.name);
    if (!answerCols.includes('written_text')) {
      db.exec("ALTER TABLE answers ADD COLUMN written_text TEXT;");
    }
    if (!answerCols.includes('attachment_url')) {
      db.exec("ALTER TABLE answers ADD COLUMN attachment_url TEXT;");
    }
    if (!answerCols.includes('feedback')) {
      db.exec("ALTER TABLE answers ADD COLUMN feedback TEXT;");
    }
    if (!answerCols.includes('evaluated_by')) {
      db.exec("ALTER TABLE answers ADD COLUMN evaluated_by TEXT;");
    }
    if (!answerCols.includes('evaluated_at')) {
      db.exec("ALTER TABLE answers ADD COLUMN evaluated_at INTEGER;");
    }

    const alertCols = db.prepare("PRAGMA table_info(alerts)").all().map(c => c.name);
    if (!alertCols.includes('snapshot_url')) {
      db.exec("ALTER TABLE alerts ADD COLUMN snapshot_url TEXT;");
    }
  } catch (mErr) {
    logger.warn('Migration column check notice:', mErr.message);
  }

  logger.info(`Database connected and initialized at ${config.dbPath}`);
} catch (err) {
  logger.error('Failed to initialize SQLite database:', err);
  throw err;
}

// Clean expired sessions periodically (every 1 hour)
function cleanExpiredSessions() {
  try {
    const now = Date.now();
    const result = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
    if (result.changes > 0) {
      logger.info(`Cleaned ${result.changes} expired sessions`);
    }
  } catch (err) {
    logger.error('Error cleaning expired sessions:', err);
  }
}
setInterval(cleanExpiredSessions, 1000 * 60 * 60);

module.exports = {
  db,
  query: (sql, params = []) => db.prepare(sql).all(params),
  get: (sql, params = []) => db.prepare(sql).get(params),
  run: (sql, params = []) => db.prepare(sql).run(params),
  transaction: (fn) => db.transaction(fn)(),
  cleanExpiredSessions
};
