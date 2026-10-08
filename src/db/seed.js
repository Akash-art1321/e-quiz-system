const crypto = require('crypto');
const { get, run, transaction } = require('./index');
const { hashPassword } = require('../utils/password');
const config = require('../config');
const logger = require('../utils/logger');

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

async function seedDatabase() {
  logger.info('Checking database seed state...');

  const now = Date.now();

  // 1. Seed Admin
  const existingAdmin = get('SELECT id, username FROM admins LIMIT 1');
  if (!existingAdmin) {
    const adminId = uid('adm');
    const adminUser = config.adminSeed.username;
    const adminPass = config.adminSeed.password;
    const adminHash = await hashPassword(adminPass);

    run(
      'INSERT INTO admins (id, username, password_hash, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [adminId, adminUser, adminHash, 'System Administrator', 'admin@quiznest.local', now, now]
    );
    logger.info(`Seeded initial admin: ${adminUser}`);
  }

  // 2. Seed Colleges
  const existingColleges = get('SELECT COUNT(*) as count FROM colleges');
  let col1Id = uid('col');
  let col2Id = uid('col');
  if (existingColleges.count === 0) {
    run('INSERT INTO colleges (id, name, domain, created_at) VALUES (?, ?, ?, ?)', [
      col1Id,
      'Demo Institute of Technology',
      'demoinstitute.edu',
      now
    ]);
    run('INSERT INTO colleges (id, name, domain, created_at) VALUES (?, ?, ?, ?)', [
      col2Id,
      'City Degree College',
      null,
      now
    ]);
    logger.info('Seeded default colleges');
  } else {
    const c1 = get('SELECT id FROM colleges WHERE name = ?', ['Demo Institute of Technology']);
    if (c1) col1Id = c1.id;
  }

  // 3. Seed Demo Student
  const existingStudent = get('SELECT id FROM students WHERE student_id = ?', ['STU2026001']);
  if (!existingStudent) {
    const stuId = uid('stu');
    const stuPassHash = await hashPassword('Student@QuizNest2026!');

    run(
      `INSERT INTO students (
        id, student_id, name, password_hash, email, phone, college_id, college_name,
        roll_number, course, year, father_name, mother_name, initial_password,
        is_active, verified, must_change_password, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        stuId,
        'STU2026001',
        'Alex Sharma',
        stuPassHash,
        'student@demo.com',
        '9876543210',
        col1Id,
        'Demo Institute of Technology',
        '21CS045',
        'B.Tech Computer Science',
        '2nd Year',
        'Rajesh Sharma',
        'Sunita Sharma',
        'Student@QuizNest2026!',
        1, // is_active
        1, // verified
        0, // must_change_password (demo student is already verified)
        now,
        now
      ]
    );
    logger.info('Seeded demo student STU2026001 / student@demo.com');
  }

  // 4. Seed Quizzes & Questions
  const existingQuizzes = get('SELECT COUNT(*) as count FROM quizzes');
  if (existingQuizzes.count === 0) {
    transaction(() => {
      // Quiz 1: General Science Basics
      const q1Id = uid('quiz');
      run(
        `INSERT INTO quizzes (id, title, category, duration, marks, negative, instructions, is_active, allow_multiple_attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          q1Id,
          'General Science Basics',
          'Science',
          10,
          1.0,
          0.0,
          'Attempt all questions. Calculators and external references are strictly forbidden.',
          1,
          0,
          now,
          now
        ]
      );

      const q1Questions = [
        {
          text: 'What is the chemical symbol for water?',
          options: ['H2O', 'HO2', 'O2H', 'H2O2'],
          correct: 0,
          explanation: 'Water is composed of two hydrogen atoms and one oxygen atom, hence H2O.'
        },
        {
          text: 'Which planet is known as the Red Planet?',
          options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
          correct: 1,
          explanation: 'Mars appears red due to iron oxide (rust) on its surface.'
        },
        {
          text: 'What gas do plants absorb from the atmosphere for photosynthesis?',
          options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Helium'],
          correct: 2,
          explanation: 'Plants use carbon dioxide along with sunlight and water to produce glucose and oxygen.'
        },
        {
          text: 'What is the powerhouse of the cell?',
          options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi apparatus'],
          correct: 2,
          explanation: 'Mitochondria generate most of the chemical energy needed to power the cell\'s biochemical reactions.'
        }
      ];

      q1Questions.forEach((q, idx) => {
        run(
          `INSERT INTO questions (id, quiz_id, q_order, text, options, correct, explanation, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uid('qq'), q1Id, idx, q.text, JSON.stringify(q.options), q.correct, q.explanation, now]
        );
      });

      // Quiz 2: World Geography Quiz
      const q2Id = uid('quiz');
      run(
        `INSERT INTO quizzes (id, title, category, duration, marks, negative, instructions, is_active, allow_multiple_attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          q2Id,
          'World Geography Quiz',
          'Geography',
          8,
          2.0,
          0.25,
          'Negative marking is enabled. For each incorrect answer, 25% of the question marks will be deducted.',
          1,
          0,
          now,
          now
        ]
      );

      const q2Questions = [
        {
          text: 'Which is the largest continent by area?',
          options: ['Africa', 'Asia', 'Europe', 'Antarctica'],
          correct: 1,
          explanation: 'Asia is Earth\'s largest and most populous continent, covering approximately 30% of total land area.'
        },
        {
          text: 'The Nile river flows primarily through which continent?',
          options: ['Asia', 'South America', 'Africa', 'Australia'],
          correct: 2,
          explanation: 'The Nile is a major north-flowing river in northeastern Africa.'
        },
        {
          text: 'Which country has the most official time zones (including overseas territories)?',
          options: ['USA', 'Russia', 'China', 'France'],
          correct: 3,
          explanation: 'France, including its overseas territories, spans 12 different time zones.'
        }
      ];

      q2Questions.forEach((q, idx) => {
        run(
          `INSERT INTO questions (id, quiz_id, q_order, text, options, correct, explanation, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uid('qq'), q2Id, idx, q.text, JSON.stringify(q.options), q.correct, q.explanation, now]
        );
      });

      // Quiz 3: Computer Science Fundamentals
      const q3Id = uid('quiz');
      run(
        `INSERT INTO quizzes (id, title, category, duration, marks, negative, instructions, is_active, allow_multiple_attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          q3Id,
          'Computer Science Fundamentals',
          'Technology',
          12,
          2.0,
          0.5,
          'Each incorrect response carries a -50% penalty. Choose your answers carefully.',
          1,
          0,
          now,
          now
        ]
      );

      const q3Questions = [
        {
          text: 'What does CPU stand for?',
          options: ['Central Process Unit', 'Central Processing Unit', 'Computer Personal Unit', 'Central Processor Utility'],
          correct: 1,
          explanation: 'CPU stands for Central Processing Unit, the primary component that executes instructions.'
        },
        {
          text: 'Which data structure follows the Last-In First-Out (LIFO) principle?',
          options: ['Queue', 'Array', 'Stack', 'Linked List'],
          correct: 2,
          explanation: 'A Stack operates on the LIFO principle, where elements are pushed and popped from the same end.'
        },
        {
          text: 'What is the time complexity of binary search on a sorted array of size N?',
          options: ['O(1)', 'O(log N)', 'O(N)', 'O(N^2)'],
          correct: 1,
          explanation: 'Binary search halves the search space in each step, resulting in O(log N) time complexity.'
        }
      ];

      q3Questions.forEach((q, idx) => {
        run(
          `INSERT INTO questions (id, quiz_id, q_order, text, options, correct, explanation, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uid('qq'), q3Id, idx, q.text, JSON.stringify(q.options), q.correct, q.explanation, now]
        );
      });
    });

    logger.info('Seeded sample quizzes and questions');
  }

  logger.info('Database seeding completed successfully');
}

if (require.main === module) {
  seedDatabase()
    .then(() => {
      logger.info('Seed script finished');
      process.exit(0);
    })
    .catch(err => {
      logger.error('Seed script failed:', err);
      process.exit(1);
    });
}

module.exports = seedDatabase;
