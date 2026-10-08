const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function buildSamplePdf(targetPath) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 45, right: 45 } });
  const writeStream = fs.createWriteStream(targetPath);
  doc.pipe(writeStream);

  // Header Box
  doc.rect(45, 40, 505, 52).fill('#1E3A8A');
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#FFFFFF').text('QuizNest Examination Management System', 55, 48, { align: 'center' });
  doc.font('Helvetica').fontSize(11).fillColor('#93C5FD').text('Standard Examination Paper - Sample Format & Upload Template', 55, 72, { align: 'center' });

  doc.y = 106;
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#1E3A8A').text('FORMATTING GUIDELINES FOR AUTOMATIC QUESTION IMPORT:');
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(
    'When preparing a PDF or text document for automatic parsing into QuizNest, follow this standard pattern:\n' +
    '1. Each question must begin with a question number followed by a period or parenthesis (e.g., "1." or "1)").\n' +
    '2. Each choice option must be on its own line labeled A), B), C), D) or A., B., C., D.\n' +
    '3. The correct answer must be on a separate line starting with "Answer: X" (where X is the correct option letter).\n' +
    '4. An optional explanation can follow starting with "Explanation: ...".',
    { lineGap: 3 }
  );

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#1E3A8A').text('SAMPLE QUESTIONS & ANSWERS:');
  doc.moveDown(0.4);

  const sampleQuestions = [
    {
      num: 1,
      q: 'What does SQL stand for in relational database management systems?',
      opts: ['A) Structured Question Language', 'B) Structured Query Language', 'C) Simple Query Logic', 'D) Standard Query Loop'],
      ans: 'B',
      exp: 'SQL stands for Structured Query Language, the standard ANSI/ISO language for relational databases.'
    },
    {
      num: 2,
      q: 'Which layer of the OSI model provides end-to-end reliable transmission and flow control?',
      opts: ['A) Network Layer', 'B) Data Link Layer', 'C) Transport Layer', 'D) Session Layer'],
      ans: 'C',
      exp: 'The Transport Layer (Layer 4) provides transparent transfer of data between end users and flow control.'
    },
    {
      num: 3,
      q: 'Which data structure follows the Last-In, First-Out (LIFO) operational principle?',
      opts: ['A) Queue', 'B) Binary Search Tree', 'C) Stack', 'D) Linked List'],
      ans: 'C',
      exp: 'A Stack operates under the Last-In First-Out rule where insertion and deletion happen at the top.'
    },
    {
      num: 4,
      q: 'What is the average-case time complexity of the Binary Search algorithm on a sorted array of size n?',
      opts: ['A) O(n)', 'B) O(log n)', 'C) O(n log n)', 'D) O(1)'],
      ans: 'B',
      exp: 'Binary search halves the search space at each iteration, resulting in logarithmic O(log n) time.'
    },
    {
      num: 5,
      q: 'Which of the following is NOT one of Coffman\'s four necessary conditions for deadlock in operating systems?',
      opts: ['A) Mutual Exclusion', 'B) Hold and Wait', 'C) Preemption Allowed', 'D) Circular Wait'],
      ans: 'C',
      exp: 'The necessary condition is No Preemption. If preemption is allowed, deadlocks cannot occur.'
    }
  ];

  sampleQuestions.forEach(sq => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(sq.num + '. ' + sq.q);
    doc.moveDown(0.15);
    doc.font('Helvetica').fontSize(9).fillColor('#4B5563');
    sq.opts.forEach(opt => {
      doc.text('    ' + opt);
    });
    doc.moveDown(0.15);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#059669').text('    Answer: ' + sq.ans, { continued: true });
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#6B7280').text('  —  Explanation: ' + sq.exp);
    doc.moveDown(0.45);
  });

  // Footer
  doc.font('Helvetica').fontSize(8).fillColor('#9CA3AF').text(
    'QuizNest 2026 - Production-Ready Online Examination Platform | Built for Academic & Corporate Assessments',
    45, 780, { align: 'center', width: 505 }
  );

  doc.end();

  return new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

module.exports = { buildSamplePdf };

if (require.main === module) {
  const dest = path.resolve(__dirname, '../public/downloads/quiznest_sample_question_paper.pdf');
  buildSamplePdf(dest).then(() => {
    console.log('Sample PDF successfully built at:', dest);
  }).catch(err => {
    console.error('Failed to build sample PDF:', err);
    process.exit(1);
  });
}
