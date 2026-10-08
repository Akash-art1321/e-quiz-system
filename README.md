# QuizNest – Online Examination & Quiz Management System

**QuizNest** is a modern, production-ready, proctored online examination and quiz management system. Built on a clean full-stack architecture using **Node.js**, **Express**, **SQLite (via better-sqlite3)**, and a responsive vanilla JavaScript / CSS frontend.

---

## 📌 Key Architectural Highlights

* **Unified Single Login Page:** No role toggle (Student/Admin) on the login screen. The backend automatically determines whether the user is an Administrator or a Student, enforces authentication and password hashing server-side, and issues a secure session.
* **Administrator-Governed Student Accounts:** Public student self-registration is permanently disabled. Only authorized administrators can provision student accounts with unique Student IDs, institutional details, and initial credentials.
* **Proctored Exam Engine:** Includes real-time timer countdowns, tab/window switch detection, automated alert logging, customizable negative marking (0%, -25%, -33%, -50%), single-attempt enforcement, and tamper-proof server-side grading.
* **Client Answer Protection:** Correct answers and explanations are stripped when an exam is started; students cannot view solutions in DevTools or network payloads prior to submission.
* **Secure Password Reset Workflow:** Students request password resets without leaking whether an account exists. Administrators review pending requests in the Admin Console and approve them with new credentials.
* **Bulk Question Ingestion & Export:** Question papers can be imported via CSV or PDF layout parsing, and exported as downloadable PDF examination papers complete with teacher answer keys.
* **Zero C++ Build Tool Dependencies:** Runs out of the box on Windows, macOS, and Linux without native compiler compilation errors.

---

## 🚀 Quick Start (Localhost Setup)

### Prerequisites
* **Node.js** (v18.0.0 or higher recommended, tested on Node v22)
* **npm** (v9.0.0 or higher)

### 1-Click Automated Setup (Windows)
Double-click or run:
```cmd
setup.bat
```
`setup.bat` automatically:
1. Checks Node.js and npm versions.
2. Creates necessary directories (`data/`, `logs/`, `public/`).
3. Generates a `.env` file with a cryptographically secure 64-character session secret if missing.
4. Installs all npm dependencies (`npm install`).
5. Initializes the persistent SQLite schema and seeds default data (`node src/db/seed.js`).
6. Verifies code syntax.
7. Launches the server on `http://localhost:3000`.

### Subsequent Starts (Windows)
```cmd
start.bat
```

### Manual Cross-Platform Setup (Linux / macOS / Windows)
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Initialize & seed SQLite database
npm run db:init

# 4. Start the server
npm start
```

Open your browser at **[http://localhost:3000](http://localhost:3000)**.

---

## 🔑 Default Seed Credentials

| Role | Identifier (Username / Student ID / Email) | Password |
|---|---|---|
| **Administrator** | `admin` | `Admin@QuizNest2026!` |
| **Demo Student** | `STU2026001` or `student@demo.com` | `Student@QuizNest2026!` |

> ⚠️ *Important: Change default credentials immediately after your first deployment in production.*

---

## 📋 Comprehensive Feature Walkthrough

### 1. Authentication & Unified Login
* Single login page accepting **Student ID**, **Username**, or **Email** alongside password.
* Server-side role resolution:
  - If the identifier matches an administrator in `admins`, validates bcrypt hash and logs into the Admin Console (`/#admin`).
  - If the identifier matches a student in `students`, verifies that the account is active (`is_active = 1`), validates bcrypt hash, and logs into the Student Dashboard (`/#student`).
* Rate-limited to prevent brute-force attacks.
* Issued session token is stored in SQLite and conveyed via an `HTTPOnly`, `SameSite=Lax` cookie.

### 2. Student Management (Admin-Only)
* **Create Student Account:** Admin supplies Student ID (unique), Full Name, Initial Password (min 6 chars), Email, Phone, College/Institution, Roll Number, Course/Branch, and Academic Year.
* **Student Operations:** Search, filter by institution or status, edit student details, toggle account enable/disable (`is_active = 0` revokes active sessions immediately), direct password reset, view academic history, and delete student.

### 3. Student First Login & Profile
* Students log in with credentials supplied by their administration.
* Profile tab allows students to complete and update their information:
  - Full Name, Phone, Email, College, Roll Number, Course, Year, and Profile Photo.
  - Student ID is permanent and read-only.
* Password change feature with current password verification and length enforcement.

### 4. Password Reset Flow
1. Student clicks **"Forgot password?"** on the login page and submits their Student ID/Email.
2. The server creates an expiring request (`password_reset_requests` table) and returns a generic confirmation to prevent user enumeration.
3. The request surfaces in the Administrator Console under **Reset Requests**.
4. The administrator reviews the candidate's identity, clicks **Approve**, and specifies a new password.
5. The student logs in with the new credentials.

### 5. Examination Engine & Server-Side Grading
* **Instructions Screen:** Displays rules, marks, time limit, and negative marking rules; requires candidate confirmation before starting.
* **Exam View:** Live countdown timer, question palette with answered/marked/skipped visual indicators, and next/previous navigation.
* **Anti-Cheating Surveillance:** Tracks tab switches, window blur events, and minimization. Shows a live warning banner (up to 5 warnings). At 5 warnings, the exam is automatically terminated and flagged for cheating.
* **Server-Side Grading:** Client sends selected option indices upon submit. The server fetches correct answers from the database, computes positive marks and negative mark penalties, saves answers to the `answers` table, updates the `attempts` table, and returns the score and question review.
* **Duplicate Attempt Prevention:** Single-attempt examinations reject subsequent attempts from the same student.

### 6. Admin Control Console
* **Overview:** High-level metrics (total exams, students, attempts, average %, active cheating alerts, pending password requests).
* **Examinations:** Create and edit exams, set duration and negative marking, question builder with 4 options, CSV/PDF upload, and PDF question paper download (with answer key).
* **Results & Leaderboards:** Per-quiz student scores, percentages, tab switch frequencies, cheating flags, and 1-click CSV export for Excel.
* **Security Alerts:** Log of suspicious candidate focus losses with student ID, exam name, switch counts, and resolution toggles.
* **Reports:** Visual score distribution bands (≥90%, 75-89%, 50-74%, <50%), pass rates, and top performers.
* **Settings:** Add/remove colleges, register secondary administrator accounts, and review system audit logs.

---

## 🗄️ Database Architecture (SQLite)

The system utilizes SQLite with WAL mode (`PRAGMA journal_mode = WAL`) and foreign key constraints (`PRAGMA foreign_keys = ON`).

```
quizzes ──< questions ──< answers
   │                          │
   └──< attempts >────────────┘
            │
students ───┼──< alerts
            ├──< password_reset_requests
            └──< sessions

admins ──< audit_logs
colleges
```

### Table Summary
1. `admins`: Administrator usernames, bcrypt password hashes, and names.
2. `colleges`: Configured educational institutions and optional email domains.
3. `students`: Student records, unique `student_id`, institutional details, and account status (`is_active`).
4. `sessions`: Cryptographic session tokens, user IDs, user types, and expiry timestamps.
5. `password_reset_requests`: Pending student reset requests with administrative approval status.
6. `quizzes`: Examination metadata, duration, marks, negative marking ratio, and attempt rules.
7. `questions`: Question statements, JSON options array, 0-indexed correct answers, and explanations.
8. `attempts`: Student exam attempts, raw scores, max scores, percentages, and cheating flags.
9. `answers`: Detailed student responses recorded per question with awarded marks.
10. `alerts`: Surveillance logs for tab switches and exam terminations.
11. `audit_logs`: Timestamped system actions for security and accountability.

---

## 🛡️ Security Audit & Hardening

* **Password Hashing:** Uses `bcryptjs` with 10 salt rounds. Plaintext passwords are never stored.
* **Session Management:** Session IDs generated via `crypto.randomBytes(32).toString('hex')`. Verified server-side per request with automatic cleanup of expired sessions.
* **Cookies:** `HTTPOnly`, `SameSite=Lax`, and `Secure` (enabled when `COOKIE_SECURE=true` or in production).
* **Rate Limiting:**
  - Login attempts: 20 requests per 15 minutes per IP.
  - Password reset requests: 5 requests per 15 minutes per IP.
  - General API: 300 requests per 15 minutes.
* **Authorization Checks:** Every administrative route enforces `requireAdmin` (403 Forbidden for students). Every student route enforces `requireStudent` and checks that the user owns the resource being accessed.
* **SQL Injection Protection:** 100% parameterized queries via prepared statements.
* **XSS & Content Security Policy:** Configured via `helmet`, with strict origin headers, X-Frame-Options (`DENY`), and X-Content-Type-Options (`nosniff`).
* **Zero Log Leakage:** Built-in logger automatically redacts passwords, tokens, cookies, and secrets.

---

## 🧪 Automated Testing

QuizNest includes an automated end-to-end test suite testing 18 functional suites and 47 individual assertions:

```bash
npm test
```

### Verified Test Cases:
1. Syntax and module loading integrity.
2. Database initialization and seeding.
3. Server startup and `/api/health` response.
4. Admin login & server-side role resolution.
5. Student login & server-side role resolution.
6. Student self-registration rejection (HTTP 403).
7. Invalid credentials rejection & user enumeration protection.
8. Admin student creation & student login with initial password.
9. Duplicate Student ID rejection.
10. Student profile update & verification.
11. Student authorization rejection on admin endpoints (HTTP 403).
12. Password change flow & verification.
13. Password reset request submission & admin approval flow.
14. Examination creation with multiple questions.
15. Quiz exam start & client answer protection (correct answers withheld).
16. Server-side grading & negative marking accuracy.
17. Duplicate attempt restriction.
18. Anti-cheating surveillance alert generation & auto-termination at 5 switches.

---

## 🌐 Production Deployment Guide

1. **Environment Configuration:**
   Copy `.env.example` to `.env` and set:
   ```env
   NODE_ENV=production
   PORT=3000
   SESSION_SECRET=<generate_a_random_64_char_hex_string>
   COOKIE_SECURE=true
   ADMIN_USERNAME=sysadmin
   ADMIN_PASSWORD=<strong_unique_password>
   DB_PATH=/var/data/quiznest.db
   ```
2. **Reverse Proxy (Nginx / Cloudflare):**
   Terminate SSL/TLS at Nginx and forward to port 3000:
   ```nginx
   server {
       listen 443 ssl http2;
       server_name exam.yourdomain.edu;

       ssl_certificate /etc/letsencrypt/live/exam.yourdomain.edu/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/exam.yourdomain.edu/privkey.pem;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
3. **Process Supervision (PM2):**
   ```bash
   npm install -g pm2
   pm2 start src/server.js --name "quiznest"
   pm2 save
   pm2 startup
   ```

---

## 📄 License
This project is licensed under the ISC License.
