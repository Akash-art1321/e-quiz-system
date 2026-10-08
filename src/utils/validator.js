function sanitizeString(str, maxLength = 255) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

function isValidStudentId(id) {
  if (!id || typeof id !== 'string') return false;
  // Alphanumeric with hyphens/underscores, 3 to 32 chars
  return /^[a-zA-Z0-9_-]{3,32}$/.test(id.trim());
}

function isValidPhone(phone) {
  if (!phone) return true; // Optional
  if (typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  return cleaned.length >= 7 && cleaned.length <= 15 && /^\d+$/.test(cleaned);
}

function validateStudentInput(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    if (data.studentId && typeof data.studentId === 'string' && data.studentId.trim().length > 0 && !isValidStudentId(data.studentId)) {
      errors.push('Student ID must be 3-32 alphanumeric characters, hyphens, or underscores');
    }
    if (!data.name || data.name.trim().length < 2) {
      errors.push('Full name must be at least 2 characters');
    }
    if (!data.initialPassword || data.initialPassword.length < 6) {
      errors.push('Initial password must be at least 6 characters');
    }
  } else {
    if (data.name !== undefined && data.name.trim().length < 2) {
      errors.push('Full name must be at least 2 characters');
    }
  }

  if (data.email && !isValidEmail(data.email)) {
    errors.push('Email is not a valid email address');
  }

  if (data.phone && !isValidPhone(data.phone)) {
    errors.push('Phone number is not valid');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function validateQuizInput(data) {
  const errors = [];

  if (!data.title || typeof data.title !== 'string' || data.title.trim().length < 3) {
    errors.push('Quiz title must be at least 3 characters long');
  }

  const duration = parseInt(data.duration, 10);
  if (isNaN(duration) || duration < 1 || duration > 360) {
    errors.push('Duration must be between 1 and 360 minutes');
  }

  const marks = parseFloat(data.marks);
  if (isNaN(marks) || marks <= 0) {
    errors.push('Marks per question must be greater than 0');
  }

  const negative = parseFloat(data.negative || 0);
  if (isNaN(negative) || negative < 0 || negative > 1) {
    errors.push('Negative marking value must be between 0 and 1');
  }

  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    errors.push('Quiz must contain at least one question');
  } else {
    data.questions.forEach((q, idx) => {
      const qNum = idx + 1;
      if (!q.text || typeof q.text !== 'string' || q.text.trim().length === 0) {
        errors.push(`Question ${qNum} text is required`);
      }
      const isSubjective = q.qType === 'written' || q.qType === 'subjective';
      if (!isSubjective) {
        if (!Array.isArray(q.options) || q.options.length < 2) {
          errors.push(`Question ${qNum} must have at least 2 options`);
        } else {
          q.options.forEach((opt, oIdx) => {
            if (!opt || typeof opt !== 'string' || opt.trim().length === 0) {
              errors.push(`Question ${qNum} Option ${String.fromCharCode(65 + oIdx)} cannot be empty`);
            }
          });
          const correct = parseInt(q.correct, 10);
          if (isNaN(correct) || correct < 0 || correct >= q.options.length) {
            errors.push(`Question ${qNum} correct option is invalid`);
          }
        }
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  sanitizeString,
  isValidEmail,
  isValidStudentId,
  isValidPhone,
  validateStudentInput,
  validateQuizInput
};
