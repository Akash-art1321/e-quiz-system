# QuizNest — Online Quiz Management System
### Complete A–Z Guide (Hinglish)

Ye ek **complete, self-contained** Online Quiz Management System hai — sirf ek `index.html` file mein pura system hai (HTML + CSS + JavaScript). Koi server, koi database install karne ki zaroorat nahi. Data browser ke **localStorage** mein save hota hai.

---

## 1. Kaise Chalayein (Setup)

1. Zip file extract karo.
2. `index.html` file ko kisi bhi modern browser (Chrome, Edge, Firefox) mein double-click karke open karo.
3. Bas — system ready hai! Koi installation, npm, server ki zaroorat nahi. Ek baar internet connection ho to Google Fonts, aur PDF import/export (jsPDF, pdf.js) ke libraries load ho jayenge; baaki sab features (quiz lena, banana, CSV import, results) bina internet ke bhi chalte hain.

**Better hosting ke liye (optional):** Agar aap ise real users ke sath live share karna chahte ho, to is file ko kisi bhi static hosting (Netlify, GitHub Pages, Vercel) par upload kar sakte ho — koi backend nahi chahiye.

> ⚠️ Note: Data browser-specific hai. Agar aap file ko doosre computer/browser mein khologe, to data (quizzes, students, results) alag honge, kyunki localStorage har browser mein separate hota hai. Real multi-device deployment ke liye future mein backend (Node/Firebase/etc.) add kiya ja sakta hai — Section 7 dekho.

---

## 2. Demo Logins

| Role | Username/Email | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Student (demo, already verified) | `student@demo.com` | `demo123` |

App do demo colleges ke saath seed hota hai:
- **Demo Institute of Technology** — domain `demoinstitute.edu` set hai, isliye is domain se matching institutional email dete hi student auto-verify ho jata hai.
- **City Degree College** — koi domain set nahi hai, isliye is college se registration hamesha admin ki manual approval maangega.

Naye students **Register** tab se apni poori details + college details bhar ke account bana sakte hain (Section 3 mein poora detail hai).

---

## 3. Poora Feature List

### 🔐 Master Login Page (New)
- Ab admin aur student ke liye **ek hi login page** hai — upar ek toggle hai (Student / Admin) jisse role switch kar sakte ho, alag-alag pages nahi hain.
- Registration ke baad, account manage karne ki sari power (edit/remove/promote) sirf **admin** ke pass hoti hai — student khud apna account edit nahi kar sakta.
- Naye admin account sirf ek **existing admin** hi bana sakta hai (dashboard ke andar se) — koi bhi seedha "admin ban jao" wala public signup nahi hai, security ke liye.

### 🎓 College Verification (New)
- Registration form ab sirf naam/email/password nahi maangta — student ko apni **poori details** bharni padti hain: full name, personal email, password, phone number, apna **college select karna** (dropdown), roll number/student ID, course/branch, year of study, aur apna **college (institutional) email**.
- Har college admin ke "Students & Admins" tab mein pehle se add hona chahiye. Agar admin ne kisi college ka official **email domain** set kiya hai (jaise `college.edu`), to us college ke students **automatically verify** ho jaate hain — bas unka institutional email us domain se match hona chahiye (jaise `21cs045@college.edu`). Match nahi hua to registration reject ho jata hai turant, saaf error message ke saath.
- Agar college ka koi domain set nahi hai, to registration ho jayega lekin account **"⏳ Pending"** status mein rahega — student tab tak login nahi kar sakta jab tak admin use manually "Approve" na kar de "Students & Admins" tab se.
- Ek hi roll number se ek hi college mein dobara registration nahi ho sakta (duplicate check), aur ek email se bhi sirf ek hi account banega.
- Admin apne college ki list khud manage kar sakta hai — naya college add karo (naam + optional email domain), ya purana college remove karo.
- Students table mein ab College, Roll No., Course/Year, aur Verification Status (✓ Verified / ⏳ Pending) sab dikhta hai, saath mein Approve/Reject (pending ke liye) ya Make Admin/Remove (verified ke liye) buttons.

### 🛡️ Anti-Cheating System (New)
- **One active session per quiz:** Jab student ek quiz start karta hai, system ek "lock" bana deta hai us student + us quiz ke liye. Agar wahi student usi quiz ko ek aur tab/window mein isi browser se dobara start karne ki koshish kare, to system rok deta hai.
- **Tab-switch / background detection:** Quiz chalte waqt agar student tab switch kare, window minimize kare, ya kisi aur app/window par jaaye (focus lose ho), to turant ek warning banner dikhta hai: "⚠️ Tab/window switch detected (X/5)". Har event record hoke attempt ke sath save hota hai.
- **Auto-submit on repeated switching:** Agar switching 5 baar se zyada ho jaye, quiz automatically submit ho jata hai aur student ko bataya jata hai ki ye instructor ko report ho chuka hai.
- **Admin ko live notification:** Har suspicious event turant Alerts tab mein record hota hai. Agar admin dashboard isi browser ke kisi doosre tab mein khula ho, to ek turant toast notification bhi aata hai — bina refresh kiye. Admin har alert ko "Mark resolved" karke clear kar sakta hai.
- **Results mein bhi dikhta hai:** Admin ke Results tab mein har attempt ke saamne "Switches" column hai — flag un attempts par lagta hai jo auto-submit hue cheating ki wajah se. CSV export mein bhi ye data shamil hai.
- Important limitation: Ye ek client-side (localStorage-based) app hai — asli multi-device, real-time monitoring ke liye backend/server chahiye hota hai. Ye system sabse achhe se kaam karta hai jab admin aur students ek hi computer/lab ke andar alag tabs use kar rahe ho, ya jab admin baad mein Alerts tab check karta hai. Cross-device live push notification ke liye backend zaroori hoga — Section 8 dekho.

### 👑 Promote to Admin (New)
- Admin, "Students & Admins" tab mein kisi bhi student ke saamne "Make Admin" button click karke unhe naya admin bana sakta hai — username/password set karke.
- Jaise hi promote hota hai, wo student list se hat jata hai aur naye admin ke roop mein login kar sakta hai.
- Isi tab mein sab current admins ki list bhi dikhti hai — zaroorat pade to unhe remove bhi kar sakte ho (last remaining admin ko remove nahi kar sakte).

### 👨‍🎓 Student Side
- Ek email se sirf ek baar registration, phir Login
- Category-wise aur search-based quiz browsing
- Instructions page before every quiz starts
- Timed quiz attempt (auto-submit jab time khatam ho jaye, ya cheating detect ho)
- Question palette (jump to any question)
- "Mark for review" feature
- Answer selection with visual feedback
- Progress bar
- Auto-grading with **negative marking support** (agar admin ne enable kiya ho)
- Result screen: score, percentage, correct/wrong/skipped count, time taken
- Detailed **answer review** (correct vs aapka answer + explanation)
- Attempt history ("My History" tab)
- Leaderboard (per quiz, top 10 rank)

### 🛠️ Admin Side
- Master login (with role toggle) — no separate signup, only existing admin can create new admins
- Dashboard stats (total quizzes, students, attempts, average score, active cheating alerts)
- Create/Edit/Delete quizzes with custom student instructions
- Dynamic question builder (unlimited questions, 4 options each, mark correct answer, optional explanation)
- **Bulk import questions via CSV or PDF**
- **Export any quiz as a PDF question paper (with answer key)**
- Quiz settings: category, duration (minutes), marks per question, negative marking (off / -25% / -50%)
- Student management (view list, remove student + their attempts, promote to admin)
- Admin account management (view/remove other admins)
- Cheating Alerts dashboard (live suspicious-activity log)
- Results table per quiz (auto-sorted leaderboard) with tab-switch counts
- **CSV export** of results for any quiz (Excel mein khol sakte ho)

### 📋 Instructions Page (New)
- Student jab bhi **"Start Quiz"** click karta hai, seedha quiz shuru nahi hota — pehle ek **Instructions page** aata hai.
- Isme dikhta hai: quiz ka naam, category, total questions, duration, marks/question, negative marking status, aur general rules (auto-submit, mark for review, tab band na karna, etc.).
- Agar admin ne quiz banate/edit karte waqt **"Instructions for students"** field mein kuch likha ho, wo bhi yahan alag se "Note from Admin" section mein dikhta hai.
- Student ko "I have read and understood the instructions" checkbox tick karna padta hai, tabhi **"Start Quiz →"** button enable hota hai.

### 📄 PDF Upload & Download (New)
- **Download Question Paper as PDF:** Admin ke "Quizzes" tab mein har quiz card par **"⬇ PDF"** button hai — click karte hi ek clean PDF question paper download hoga (saare questions + options), aur last page par **Answer Key** bhi hoga (admin ke reference ke liye).
- **Upload Questions via PDF:** "Create Quiz" tab mein **"⬆ Upload PDF"** button se ek PDF file upload kar sakte ho jisme questions likhe hon — system automatically unhe read karke question builder mein bhar dega.
  - PDF ka format bilkul is tarah hona chahiye (har question ke liye):
    ```
    1. What is the capital of India?
    A) Mumbai
    B) New Delhi
    C) Chennai
    D) Kolkata
    Answer: B
    Explanation: New Delhi has been the capital since 1911.
    ```
  - Exact sample dekhne ke liye **"⬇ Download Sample PDF Format"** button use karo — usi PDF ko wapas upload karke test bhi kar sakte ho.
  - ⚠️ PDF text-extraction simple, single-column PDFs ke liye best kaam karta hai. Agar aapki PDF complex layout (tables, multi-column, scanned image) wali hai, to wo reliably parse nahi hogi — us case mein **CSV upload use karna best hai** (neeche dekho), kyunki wo 100% accurate hai.

### 📊 CSV Auto-Import (New)
- "Create Quiz" tab mein **"⬆ Upload CSV"** button se ek CSV file upload karo jisme questions ho — system automatically sab questions ko form mein bhar dega, ready to save.
- Required CSV columns (header row zaroori hai): `Question, OptionA, OptionB, OptionC, OptionD, Answer, Explanation`
  - `Answer` column mein A/B/C/D (ya 1/2/3/4) likho — jo correct option hai.
  - `Explanation` column optional hai.
- Sahi format dekhne ke liye **"⬇ Download CSV Template"** button click karo — Excel/Google Sheets mein khol ke apne questions bhar do, phir wapas upload kar do.
- CSV upload sabse **reliable aur recommended** tarika hai bulk questions add karne ka.

### 🎨 General
- Dark / Light theme toggle (saved automatically)
- Fully responsive (mobile, tablet, desktop)
- Clean, distraction-free UI

---

## 4. File Structure (Zip ke andar)

```
equiz-system/
├── index.html      → Pura system (HTML + CSS + JS ek hi file mein)
└── GUIDE.md         → Ye guide
```

Sab kuch ek file mein isliye rakha gaya hai taaki aap ise kahin bhi (USB drive, email, kisi bhi static host) bina kisi setup ke chala sako.

---

## 5. Kaise Use Karein — Step by Step

### Admin ke liye:
1. Home page par **"I'm an Admin"** click karo (ya student panel se upar "Admin" tab par switch karo — ab dono ek hi login page par hain).
2. `admin` / `admin123` se login karo.
3. **"Students & Admins"** tab mein sabse pehle apne college(s) add karo — naam aur (agar hai to) official email domain daalo. Domain diya to us college ke students auto-verify honge; nahi diya to unhe manually approve karna padega.
4. **"Create Quiz"** tab par jao → title, category, duration, marks, negative marking aur (optional) student instructions set karo.
5. Questions add karne ke 3 tarike hain:
   - Manually: **"+ Add Question"** click karke har question ke 4 options aur correct answer choose karo.
   - CSV se: **"⬆ Upload CSV"** — template download karke Excel mein fill karo, phir upload karo, sab questions auto-fill ho jayenge.
   - PDF se: **"⬆ Upload PDF"** — sample format download karke us format mein PDF banao, phir upload karo.
6. **"Save Quiz"** click karo — quiz turant students ko dikhne lagega.
7. **"Quizzes"** tab mein kisi bhi quiz card par **"⬇ PDF"** click karke uska question paper (answer key ke sath) PDF mein download kar sakte ho.
8. **"Results & Leaderboard"** tab se kisi bhi quiz ke results dekho (tab-switch count bhi dikhega) aur CSV export karo.
9. **"Students & Admins"** tab mein wapas jao — jo students "⏳ Pending" dikh rahe hain, unki college/roll details check karke **"Approve"** ya **"Reject"** karo. Verified students ko chaho to **"Make Admin"** bhi bana sakte ho.
10. **"🚨 Alerts"** tab mein dekho ki kaun sa student quiz ke dauraan tab switch/cheating kar raha hai — har alert ko "Mark resolved" kar sakte ho.

### Student ke liye:
1. Home page par **"I'm a Student"** click karke **"Register"** tab par jao (register sirf pehli baar hi kaam karega, uske baad sirf login).
2. Apni poori details bharo: naam, personal email, password, phone number, apna **college select karo** dropdown se, roll number, course/branch, year, aur apna **college (institutional) email**.
   - Agar tumhara college auto-verify list mein hai (domain wala), to sahi institutional email dete hi turant verify ho ke login ho jaoge.
   - Nahi to registration "Pending" status mein chala jayega — admin approve karega tabhi login ho payega.
3. **"Available Quizzes"** mein search/category filter se quiz dhundo.
4. **"Start Quiz"** click karo — pehle Instructions page khulega, jisme quiz ke rules aur admin ke notes (agar hain) dikhenge. Checkbox tick karke **"Start Quiz →"** click karo — tabhi timer start hoga.
   - ⚠️ Agar ye quiz aapke isi account se kisi aur tab/window mein pehle se chal raha ho, to system aapko rok dega.
5. Questions answer karo, jaroorat pade to "Mark for review" use karo, side panel se kisi bhi question par jump karo.
   - ⚠️ Quiz ke dauraan tab switch karna ya kisi doosri window par jaana **track hota hai** — baar baar aisa karne par quiz automatically submit ho jayega aur ye aapke instructor ko record ho jayega.
6. **"Submit Quiz"** click karo (ya time khatam hone par auto-submit ho jayega).
7. Result dekho aur **"Review Answers"** se apne sahi/galat jawab explanation ke sath dekho.
8. **"My History"** tab se purane attempts dekho, **"Leaderboards"** se rank check karo.

---

## 6. Customization Tips

- **Colors/Branding:** `index.html` ke `<style>` section mein `:root { ... }` variables change karo (`--primary`, `--accent`, etc.)
- **Admin password change karna ho:** Sabse aasaan tarika — dashboard se khud login karke "Students & Admins" tab mein khud ko promote/remove karke naya account bana lo. Ya seedha console se:
  ```js
  localStorage.setItem('eq_admins', JSON.stringify([{id:'adm_1', username:'admin', password:'YOUR_NEW_PASSWORD', name:'Admin'}]));
  ```
- **Sara data reset karna ho** (fresh start): Browser console mein:
  ```js
  localStorage.clear(); location.reload();
  ```
- **Negative marking:** Quiz create/edit karte waqt "Negative marking" dropdown se -25% ya -50% per wrong answer set kar sakte ho.

---

## 7. Ye System Real-World Production ke liye Aage Kaise Badhayein

Ye version **client-side demo/single-browser** ke liye perfect hai (college project, internal training, prototype, chhoti team). Agar aap ise real multi-user product banana chahte ho (jahan students alag-alag devices se login karein aur data ek shared jagah save ho), to ye add karna hoga:

1. **Backend + Database:** Node.js/Express + MongoDB ya Firebase/Supabase — taaki data sab devices par sync ho, aur session-lock/cheating-alerts cross-device (student ka phone + admin ka laptop) bhi kaam karein real-time mein (WebSockets/Firestore listeners ke through).
2. **Real Authentication:** JWT tokens, password hashing (bcrypt), email verification, one-device-per-session enforcement server-side.
3. **API Layer:** Quizzes, questions, attempts ko REST/GraphQL API se serve karo.
4. **Advanced proctoring:** Full-screen lock, question randomization per student, webcam proctoring, browser-lockdown extension (yaha di gayi tab-switch detection ek achhi shuruaat hai, ye usse aage ka level hai).
5. **Question types:** Multiple-select, true/false, fill-in-the-blank, image-based questions.
6. **Notifications:** Email/SMS/push reminders for scheduled quizzes aur cheating alerts (abhi ye sirf same-browser cross-tab tak kaam karta hai).

Agar aap chahte ho, main aapke liye ye backend version (Node.js + database ke sath) bhi bana sakta hoon — bas bata dena!

---

## 8. Troubleshooting

| Problem | Solution |
|---|---|
| Data gayab ho gaya | Browser ka cache/localStorage clear ho gaya hoga. Har browser/device ka data alag hota hai. |
| Timer kaam nahi kar raha | Browser tab ko background mein mat rakho lambe time tak, kuch mobile browsers timers throttle karte hain. |
| Fonts default dikh rahe hain | Internet connection check karo (Google Fonts CDN ke liye chahiye), warna system-default font use hoga — functionality par asar nahi padega. |

---

Made with ❤️ — Enjoy your Quiz Management System!
