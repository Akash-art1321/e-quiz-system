// Exam Engine & Anti-Cheating System with WebCam, Fullscreen & Written Exams
const Quiz = {
  activeQuiz: null,
  attemptId: null,
  questions: [],
  answers: [],
  marked: [],
  visited: [],
  currentIndex: 0,
  secondsRemaining: 0,
  totalSeconds: 0,
  tabSwitches: 0,
  timerHandle: null,
  lastSwitchTime: 0,
  webcamStream: null,
  inUploadBuffer: false,
  uploadBufferRemaining: 0,
  _blockPollTimer: null,

  async openInstructions(quizId) {
    try {
      // Check if student has a blocked attempt first
      const auth = await App.api('/api/auth/me');
      if (auth && auth.blockedAttempt) {
        Quiz.attemptId = auth.blockedAttempt.attemptId;
        Quiz.activeQuiz = { id: auth.blockedAttempt.quizId, title: auth.blockedAttempt.quizTitle };
        Quiz.showBlockScreen();
        Quiz.startBlockPoll();
        App.toast('Your exam is currently locked due to a proctoring violation. Please wait for the invigilator to unblock you.', 'error');
        return;
      }

      const res = await App.api(`/api/quizzes/${quizId}`);
      const q = res.quiz;
      Quiz.activeQuiz = q;

      document.getElementById('instrCategory').textContent = q.category || 'General';
      document.getElementById('instrTitle').textContent = q.title;

      let metaHtml = `
        <span>${q.questionCount} Questions</span>
        <span>${q.duration} Minutes</span>
        <span>${q.marks} Mark${q.marks > 1 ? 's' : ''}/Question</span>
      `;
      if (q.negative) {
        metaHtml += `<span style="color:var(--accent)">Negative marking: −${Math.round(q.negative * 100)}%</span>`;
      }
      document.getElementById('instrMeta').innerHTML = metaHtml;

      const points = [
        `This exam contains ${q.questionCount} questions with a total time limit of ${q.duration} minutes.`,
        `Each correct answer awards +${q.marks} mark(s) unless customized per question.`,
        q.negative
          ? `Negative marking is ACTIVE: each wrong answer deducts ${Math.round(q.marks * q.negative * 100) / 100} mark(s). Skipped questions carry no penalty.`
          : `There is no negative marking: incorrect or skipped answers score 0.`,
        `The exam will automatically submit when the countdown timer reaches 00:00.`
      ];

      if (q.requireFullscreen !== false) {
        points.push('Mandatory Kiosk Fullscreen Lock: The exam browser locks into fullscreen mode. Exiting fullscreen will log security warnings.');
      }
      if (q.requireWebcam !== false) {
        points.push('Live WebCam Surveillance: Your camera will be monitored for live invigilation. Please ensure good lighting and face camera.');
      }
      if (q.uploadBufferMinutes > 0) {
        points.push(`Written Copy Upload Buffer: You have ${q.uploadBufferMinutes} minutes extra grace buffer after the exam timer ends to scan/photo handwritten sheets.`);
      }

      points.push('Anti-cheating detection is active. Switching tabs, minimizing windows, or navigating away will be flagged and reported. Blocked students can only be resumed by administrator.');
      points.push('Written questions can be answered by typing directly online (with LaTeX math support) OR uploading handwritten paper sheet photos/PDF.');
      points.push('Use "Mark for review" to flag questions and navigate anytime using the question palette on the right.');

      document.getElementById('instrList').innerHTML = points.map(p => `<li>${App.escapeHtml(p)}</li>`).join('');

      const customWrap = document.getElementById('instrCustomWrap');
      if (q.instructions && q.instructions.trim()) {
        customWrap.classList.remove('hidden');
        document.getElementById('instrCustom').textContent = q.instructions;
      } else {
        customWrap.classList.add('hidden');
      }

      document.getElementById('instrAgree').checked = false;
      document.getElementById('instrStartBtn').disabled = true;

      App.showView('view-instructions');
    } catch (err) {
      App.toast(err.message || 'Error loading exam instructions', 'error');
    }
  },

  async startExam() {
    if (!Quiz.activeQuiz) return;

    try {
      const res = await App.api(`/api/quizzes/${Quiz.activeQuiz.id}/start`, { method: 'POST' });

      Quiz.attemptId = res.attemptId;
      Quiz.questions = res.questions || [];
      Quiz.answers = new Array(Quiz.questions.length).fill(null);
      Quiz.marked = new Array(Quiz.questions.length).fill(false);
      Quiz.visited = new Array(Quiz.questions.length).fill(false);
      Quiz.visited[0] = true;
      Quiz.currentIndex = 0;
      Quiz.totalSeconds = res.durationSeconds;
      Quiz.secondsRemaining = res.secondsRemaining;
      Quiz.tabSwitches = res.tabSwitches || 0;
      Quiz.inUploadBuffer = false;
      Quiz.uploadBufferRemaining = 0;

      document.getElementById('attemptTitle').textContent = res.quiz.title;

      // 1. Mandatory Fullscreen Kiosk Mode
      const fsBadge = document.getElementById('attemptKioskBadge');
      if (res.quiz.requireFullscreen !== false) {
        if (fsBadge) fsBadge.style.display = 'inline-block';
        try {
          if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen().catch(() => {});
          }
        } catch (e) {}
        document.addEventListener('fullscreenchange', Quiz.onFullscreenChange);
      } else {
        if (fsBadge) fsBadge.style.display = 'none';
      }

      // 2. WebCam Surveillance
      const camBadge = document.getElementById('attemptCameraBadge');
      const camCard = document.getElementById('attemptWebcamCard');
      const camPill = document.getElementById('cameraStatusPill');
      if (res.quiz.requireWebcam !== false) {
        if (camBadge) camBadge.style.display = 'inline-block';
        if (camCard) camCard.style.display = 'block';
        if (camPill) {
          camPill.textContent = 'Connecting…';
          camPill.className = 'badge warning';
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
          Quiz.webcamStream = stream;
          const video = document.getElementById('attemptWebcamVideo');
          if (video) {
            video.srcObject = stream;
            video.play().catch(() => {});
          }
          if (camPill) {
            camPill.textContent = 'Live Feed';
            camPill.className = 'badge ok';
          }
        } catch (camErr) {
          console.warn('WebCam access failed or blocked:', camErr);
          if (camPill) {
            camPill.textContent = 'Camera Blocked';
            camPill.className = 'badge danger';
          }
        }
      } else {
        if (camBadge) camBadge.style.display = 'none';
        if (camCard) camCard.style.display = 'none';
      }

      // Hide upload buffer banner initially
      const bufferBanner = document.getElementById('attemptUploadBufferBanner');
      if (bufferBanner) bufferBanner.style.display = 'none';

      // Start Countdown Timer
      clearInterval(Quiz.timerHandle);
      Quiz.timerHandle = setInterval(Quiz.tickTimer, 1000);
      Quiz.updateTimerDisplay();

      // Attach Anti-Cheating Observers
      Quiz.attachCheatDetection();

      Quiz.renderAttempt();
      App.showView('view-attempt');
    } catch (err) {
      if (err.data && err.data.blocked) {
        Quiz.attemptId = err.data.attemptId || Quiz.attemptId;
        Quiz.showBlockScreen();
        Quiz.startBlockPoll();
      }
      App.toast(err.message || 'Failed to start exam', 'error');
    }
  },

  tickTimer() {
    Quiz.secondsRemaining--;
    Quiz.updateTimerDisplay();

    if (Quiz.secondsRemaining <= 0) {
      clearInterval(Quiz.timerHandle);
      if (Quiz.activeQuiz && Quiz.activeQuiz.uploadBufferMinutes > 0 && !Quiz.inUploadBuffer) {
        Quiz.enterUploadBuffer();
      } else {
        App.toast('Time is up! Submitting your exam…', 'info');
        Quiz.submit(true);
      }
    }
  },

  enterUploadBuffer() {
    Quiz.inUploadBuffer = true;
    Quiz.uploadBufferRemaining = Quiz.activeQuiz.uploadBufferMinutes * 60;
    const banner = document.getElementById('attemptUploadBufferBanner');
    if (banner) banner.style.display = 'block';
    Quiz.updateUploadBufferDisplay();
    App.toast(`Exam time ended! You have ${Quiz.activeQuiz.uploadBufferMinutes} minutes grace buffer to upload your handwritten answer sheets.`, 'warning');
    Quiz.timerHandle = setInterval(Quiz.tickUploadBuffer, 1000);
  },

  tickUploadBuffer() {
    Quiz.uploadBufferRemaining--;
    Quiz.updateUploadBufferDisplay();
    if (Quiz.uploadBufferRemaining <= 0) {
      clearInterval(Quiz.timerHandle);
      App.toast('Upload grace period has ended! Submitting your exam…', 'info');
      Quiz.submit(true);
    }
  },

  updateUploadBufferDisplay() {
    const el = document.getElementById('uploadBufferRemaining');
    if (!el) return;
    const m = Math.floor(Math.max(0, Quiz.uploadBufferRemaining) / 60);
    const s = Math.max(0, Quiz.uploadBufferRemaining) % 60;
    el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  updateTimerDisplay() {
    const timerEl = document.getElementById('attemptTimer');
    if (!timerEl) return;

    const m = Math.floor(Math.max(0, Quiz.secondsRemaining) / 60);
    const s = Math.max(0, Quiz.secondsRemaining) % 60;
    timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    if (Quiz.secondsRemaining < 60) {
      timerEl.classList.add('warning');
    } else {
      timerEl.classList.remove('warning');
    }
  },

  // ---------------- Anti-Cheating & Proctoring System ----------------
  attachCheatDetection() {
    document.addEventListener('visibilitychange', Quiz.onVisibilityChange);
    window.addEventListener('blur', Quiz.onWindowBlur);
  },

  detachCheatDetection() {
    document.removeEventListener('visibilitychange', Quiz.onVisibilityChange);
    window.removeEventListener('blur', Quiz.onWindowBlur);
    const banner = document.getElementById('cheatBanner');
    if (banner) banner.style.display = 'none';
  },

  onVisibilityChange() {
    if (document.hidden && Quiz.attemptId) {
      Quiz.flagCheatEvent('tab_hidden');
    }
  },

  onWindowBlur() {
    if (Quiz.attemptId) {
      Quiz.flagCheatEvent('window_blur');
    }
  },

  onFullscreenChange() {
    if (!document.fullscreenElement && Quiz.attemptId && Quiz.activeQuiz && Quiz.activeQuiz.requireFullscreen !== false) {
      App.showModal('fullscreenWarningModal');
      Quiz.flagCheatEvent('fullscreen_exit');
    }
  },

  reEnterFullscreen() {
    App.closeModal('fullscreenWarningModal');
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (e) {}
  },

  captureWebcamSnapshot() {
    try {
      const video = document.getElementById('attemptWebcamVideo');
      const canvas = document.getElementById('attemptWebcamCanvas');
      if (!video || !canvas || !video.videoWidth) return null;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.6);
    } catch (e) {
      return null;
    }
  },

  async flagCheatEvent(type) {
    const now = Date.now();
    if (now - Quiz.lastSwitchTime < 1000) return; // Debounce events
    Quiz.lastSwitchTime = now;

    Quiz.tabSwitches++;
    Quiz.showCheatBanner(Quiz.tabSwitches);

    const snapshotUrl = Quiz.captureWebcamSnapshot();

    try {
      const res = await App.api(`/api/quizzes/${Quiz.activeQuiz.id}/alert`, {
        method: 'POST',
        body: {
          attemptId: Quiz.attemptId,
          type,
          switchCount: Quiz.tabSwitches,
          snapshotUrl: snapshotUrl || null
        }
      });

      if (res.blocked) {
        Quiz.detachCheatDetection();
        Quiz.showBlockScreen();
        Quiz.startBlockPoll();
      }
    } catch (e) {
      // Offline or network error
    }
  },

  showCheatBanner(count) {
    let el = document.getElementById('cheatBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cheatBanner';
      document.body.appendChild(el);
    }
    el.textContent = `Proctoring Alert: Tab/Window Switch Detected. Your exam has been paused. Please wait for the invigilator to unblock you.`;
    el.style.display = 'block';

    clearTimeout(window._cheatTimeout);
    window._cheatTimeout = setTimeout(() => {
      el.style.display = 'none';
    }, 4500);
  },

  showBlockScreen() {
    let overlay = document.getElementById('blockOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'blockOverlay';
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:9999999',
        'background:rgba(15,15,25,0.98)',
        'display:flex', 'flex-direction:column',
        'align-items:center', 'justify-content:center',
        'color:#fff', 'font-family:inherit', 'text-align:center', 'padding:2rem',
        'backdrop-filter:blur(16px)', '-webkit-backdrop-filter:blur(16px)'
      ].join(';');
      overlay.innerHTML = `
        <div style="max-width:520px;background:rgba(30,18,24,0.95);border:2px solid #ef4444;border-radius:20px;padding:36px 30px;box-shadow:0 24px 60px rgba(0,0,0,0.7),0 0 35px rgba(239,68,68,0.25);">
          <div style="margin-bottom:1.25rem;">
            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 style="font-size:1.6rem;font-weight:700;margin-bottom:0.85rem;color:#ef4444;">Examination Paused &amp; Locked</h2>
          <p style="color:#e2e8f0;margin-bottom:1.5rem;line-height:1.65;font-size:15px;">
            A browser switch or proctoring violation was detected.<br>
            Your exam is <strong style="color:#fca5a5;">temporarily locked</strong>.<br>
            The invigilator has been notified. Please wait for an administrator to unblock your exam.
          </p>
          <div id="blockPollStatus" style="color:#94a3b8;font-size:0.9rem;font-weight:500;background:rgba(0,0,0,0.35);padding:10px 18px;border-radius:10px;display:inline-block;border:1px solid rgba(255,255,255,0.08);">
            Waiting for invigilator unblock...
          </div>
          <div style="margin-top: 1.5rem; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
            <button class="btn secondary sm" onclick="Quiz.closeBlockScreenToDashboard()">Back to Dashboard</button>
            <button class="btn ghost sm" onclick="Quiz.closeBlockScreenAndLogout()">Logout</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
  },

  closeBlockScreenToDashboard() {
    const overlay = document.getElementById('blockOverlay');
    if (overlay) overlay.remove();
    if (Quiz._blockPollTimer) {
      clearInterval(Quiz._blockPollTimer);
      Quiz._blockPollTimer = null;
    }
    Student.init();
  },

  closeBlockScreenAndLogout() {
    const overlay = document.getElementById('blockOverlay');
    if (overlay) overlay.remove();
    if (Quiz._blockPollTimer) {
      clearInterval(Quiz._blockPollTimer);
      Quiz._blockPollTimer = null;
    }
    App.logout();
  },

  startBlockPoll() {
    if (Quiz._blockPollTimer) return;
    Quiz._blockPollTimer = setInterval(async () => {
      try {
        if (!Quiz.attemptId) return;
        const res = await App.api(`/api/quizzes/attempt/${Quiz.attemptId}/block-status`);
        if (res.success && !res.isBlocked) {
          // Admin unblocked — resume exam
          clearInterval(Quiz._blockPollTimer);
          Quiz._blockPollTimer = null;
          const overlay = document.getElementById('blockOverlay');
          if (overlay) overlay.remove();

          if (!Quiz.questions || Quiz.questions.length === 0) {
            if (Quiz.activeQuiz && Quiz.activeQuiz.id) {
              await Quiz.startExam();
            } else {
              Student.init();
            }
          } else {
            Quiz.attachCheatDetection();
          }
          App.toast('Invigilator has unblocked your exam. You may continue.', 'ok');
        }
      } catch (e) {
        // Network issue — keep polling
      }
    }, 3000);
  },

  // ---------------- Attempt UI Rendering ----------------
  renderAttempt() {
    const q = Quiz.questions[Quiz.currentIndex];
    if (!q) return;

    document.getElementById('attemptQNum').textContent = `Question ${Quiz.currentIndex + 1} of ${Quiz.questions.length}`;
    document.getElementById('attemptQText').textContent = q.text;

    // Question Marks Badge
    const marksBadge = document.getElementById('attemptQMarks');
    if (marksBadge) {
      const mVal = q.marks !== null && q.marks !== undefined ? q.marks : (Quiz.activeQuiz ? Quiz.activeQuiz.marks : 1);
      marksBadge.textContent = `${mVal} Mark${mVal > 1 ? 's' : ''}`;
      marksBadge.style.display = 'inline-block';
    }

    // Question Diagram / Image
    const diagWrap = document.getElementById('attemptQDiagramWrap');
    const diagImg = document.getElementById('attemptQDiagramImg');
    if (diagWrap && diagImg) {
      if (q.imageUrl) {
        diagImg.src = q.imageUrl;
        diagWrap.style.display = 'block';
      } else {
        diagWrap.style.display = 'none';
      }
    }

    const pct = Math.round(((Quiz.currentIndex + 1) / Quiz.questions.length) * 100);
    document.getElementById('attemptProgress').style.width = pct + '%';

    const isWritten = q.qType === 'written' || q.q_type === 'written';
    const optWrap = document.getElementById('attemptOptions');
    const writtenWrap = document.getElementById('attemptWrittenWrap');

    if (isWritten) {
      if (optWrap) optWrap.style.display = 'none';
      if (writtenWrap) writtenWrap.style.display = 'block';

      const curAns = Quiz.answers[Quiz.currentIndex];
      const curText = curAns && typeof curAns === 'object' ? (curAns.writtenText || '') : (typeof curAns === 'string' ? curAns : '');
      const curAttach = curAns && typeof curAns === 'object' ? (curAns.attachmentUrl || null) : null;

      const writtenTextarea = document.getElementById('attemptWrittenText');
      if (writtenTextarea) writtenTextarea.value = curText;
      Quiz.updateCopyPreview(curAttach);
    } else {
      if (writtenWrap) writtenWrap.style.display = 'none';
      if (optWrap) {
        optWrap.style.display = 'block';
        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        const currentAnswer = Quiz.answers[Quiz.currentIndex];

        optWrap.innerHTML = (q.options || []).map((opt, i) => {
          const isSelected = currentAnswer === i;
          return `
            <label class="opt-choice ${isSelected ? 'selected' : ''}" onclick="Quiz.selectOption(${i})">
              <input type="radio" name="opt_choice" ${isSelected ? 'checked' : ''} readonly>
              <span class="opt-letter">${letters[i]}</span>
              <span class="math-content">${App.escapeHtml(opt)}</span>
            </label>
          `;
        }).join('');
      }
    }

    // Render Math (LaTeX) on question statement and options
    App.renderMath(document.getElementById('attemptQText'));
    if (optWrap && optWrap.style.display !== 'none') {
      App.renderMath(optWrap);
    }

    const isMarked = Quiz.marked[Quiz.currentIndex];
    const markBtn = document.getElementById('markReviewBtn');
    if (markBtn) {
      markBtn.innerHTML = isMarked ? 'Marked for Review' : 'Mark for Review &amp; Next';
      markBtn.className = isMarked ? 'btn secondary sm active' : 'btn secondary sm';
    }

    // Dynamic Previous Button state
    const prevBtn = document.getElementById('prevQuestionBtn');
    if (prevBtn) {
      const isFirst = Quiz.currentIndex === 0;
      prevBtn.disabled = isFirst;
      prevBtn.style.opacity = isFirst ? '0.45' : '1';
      prevBtn.style.cursor = isFirst ? 'not-allowed' : 'pointer';
    }

    // Dynamic Next / Submit Button state
    const nextBtn = document.getElementById('nextQuestionBtn');
    if (nextBtn) {
      const isLast = Quiz.currentIndex === Quiz.questions.length - 1;
      if (isLast) {
        nextBtn.innerHTML = 'Submit Examination';
        nextBtn.className = 'btn success sm';
        nextBtn.title = 'Complete and submit your examination';
      } else {
        nextBtn.innerHTML = 'Save &amp; Next →';
        nextBtn.className = 'btn sm';
        nextBtn.title = 'Save answer and go to next question';
      }
    }

    Quiz.renderQuestionPalette();
  },

  updateWrittenText(val) {
    const cur = Quiz.answers[Quiz.currentIndex];
    const attach = cur && typeof cur === 'object' ? cur.attachmentUrl : null;
    if (!val.trim() && !attach) {
      Quiz.answers[Quiz.currentIndex] = null;
    } else {
      Quiz.answers[Quiz.currentIndex] = {
        writtenText: val,
        attachmentUrl: attach
      };
    }
    Quiz.visited[Quiz.currentIndex] = true;
    Quiz.renderQuestionPalette();
  },

  handleCopyUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      const dataUrl = ev.target.result;
      const cur = Quiz.answers[Quiz.currentIndex];
      const text = cur && typeof cur === 'object' ? cur.writtenText : (typeof cur === 'string' ? cur : '');
      Quiz.answers[Quiz.currentIndex] = {
        writtenText: text,
        attachmentUrl: dataUrl
      };
      Quiz.visited[Quiz.currentIndex] = true;
      Quiz.updateCopyPreview(dataUrl);
      Quiz.renderQuestionPalette();
      App.toast('Handwritten answer sheet attached successfully!', 'ok');
    };
    reader.readAsDataURL(file);
  },

  removeUploadedCopy() {
    const cur = Quiz.answers[Quiz.currentIndex];
    const text = cur && typeof cur === 'object' ? cur.writtenText : '';
    if (!text.trim()) {
      Quiz.answers[Quiz.currentIndex] = null;
    } else {
      Quiz.answers[Quiz.currentIndex] = {
        writtenText: text,
        attachmentUrl: null
      };
    }
    Quiz.updateCopyPreview(null);
    Quiz.renderQuestionPalette();
    App.toast('Attached file removed.', 'info');
  },

  updateCopyPreview(url) {
    const removeBtn = document.getElementById('attemptCopyRemoveBtn');
    const status = document.getElementById('attemptCopyStatus');
    const previewWrap = document.getElementById('attemptCopyPreviewWrap');
    const previewImg = document.getElementById('attemptCopyPreviewImg');
    const pdfPreview = document.getElementById('attemptCopyPdfPreview');

    if (!url) {
      if (removeBtn) removeBtn.style.display = 'none';
      if (status) status.textContent = 'No file attached';
      if (previewWrap) previewWrap.style.display = 'none';
      if (previewImg) previewImg.style.display = 'none';
      if (pdfPreview) pdfPreview.style.display = 'none';
      const fileInput = document.getElementById('attemptCopyInput');
      if (fileInput) fileInput.value = '';
      return;
    }

    if (removeBtn) removeBtn.style.display = 'inline-block';
    if (status) status.textContent = 'File attached';
    if (previewWrap) previewWrap.style.display = 'block';

    if (url.startsWith('data:image/') || url.match(/\.(png|jpe?g|webp|gif)$/i)) {
      if (previewImg) {
        previewImg.src = url;
        previewImg.style.display = 'block';
      }
      if (pdfPreview) pdfPreview.style.display = 'none';
    } else {
      if (previewImg) previewImg.style.display = 'none';
      if (pdfPreview) pdfPreview.style.display = 'block';
    }
  },

  selectOption(optIdx) {
    Quiz.answers[Quiz.currentIndex] = optIdx;
    Quiz.visited[Quiz.currentIndex] = true;
    Quiz.renderAttempt();
  },

  clearResponse() {
    const q = Quiz.questions[Quiz.currentIndex];
    const isWritten = q && (q.qType === 'written' || q.q_type === 'written');
    Quiz.answers[Quiz.currentIndex] = null;
    Quiz.visited[Quiz.currentIndex] = true;

    if (isWritten) {
      const textarea = document.getElementById('attemptWrittenText');
      if (textarea) textarea.value = '';
      Quiz.updateCopyPreview(null);
    }

    Quiz.renderAttempt();
    App.toast('Selected response cleared.', 'info');
  },

  markForReviewAndNext() {
    Quiz.marked[Quiz.currentIndex] = true;
    Quiz.visited[Quiz.currentIndex] = true;
    if (Quiz.currentIndex < Quiz.questions.length - 1) {
      Quiz.currentIndex++;
      Quiz.visited[Quiz.currentIndex] = true;
      Quiz.renderAttempt();
    } else {
      Quiz.renderAttempt();
      Quiz.confirmSubmit();
    }
  },

  saveAndNext() {
    Quiz.visited[Quiz.currentIndex] = true;
    if (Quiz.currentIndex < Quiz.questions.length - 1) {
      Quiz.currentIndex++;
      Quiz.visited[Quiz.currentIndex] = true;
      Quiz.renderAttempt();
    } else {
      Quiz.confirmSubmit();
    }
  },

  toggleMarkReview() {
    Quiz.marked[Quiz.currentIndex] = !Quiz.marked[Quiz.currentIndex];
    Quiz.visited[Quiz.currentIndex] = true;
    Quiz.renderAttempt();
  },

  prevQuestion() {
    if (Quiz.currentIndex > 0) {
      Quiz.currentIndex--;
      Quiz.visited[Quiz.currentIndex] = true;
      Quiz.renderAttempt();
    }
  },

  nextQuestion() {
    Quiz.saveAndNext();
  },

  jumpTo(idx) {
    if (idx >= 0 && idx < Quiz.questions.length) {
      Quiz.currentIndex = idx;
      Quiz.visited[idx] = true;
      Quiz.renderAttempt();
    }
  },

  renderQuestionPalette() {
    const grid = document.getElementById('qnavGrid');
    if (!grid) return;

    let cntAnswered = 0;
    let cntNotAnswered = 0;
    let cntReview = 0;
    let cntAnsReview = 0;
    let cntNotVisited = 0;

    const html = Quiz.questions.map((_, i) => {
      const ans = Quiz.answers[i];
      let isAns = false;
      if (ans !== null && ans !== undefined) {
        if (typeof ans === 'object') {
          isAns = !!((ans.writtenText && ans.writtenText.trim().length > 0) || ans.attachmentUrl);
        } else {
          isAns = true;
        }
      }

      const isRev = !!Quiz.marked[i];
      const isVis = !!Quiz.visited[i];

      let state = 'not-visited';
      let stateLabel = 'Not Visited';

      if (isAns && isRev) {
        state = 'answered-review';
        stateLabel = 'Answered & Marked for Review';
        cntAnsReview++;
      } else if (isRev) {
        state = 'review';
        stateLabel = 'Marked for Review';
        cntReview++;
      } else if (isAns) {
        state = 'answered';
        stateLabel = 'Answered';
        cntAnswered++;
      } else if (isVis) {
        state = 'not-answered';
        stateLabel = 'Not Answered';
        cntNotAnswered++;
      } else {
        state = 'not-visited';
        stateLabel = 'Not Visited';
        cntNotVisited++;
      }

      let cls = `qnav-btn ${state}`;
      if (i === Quiz.currentIndex) cls += ' current';

      return `<button class="${cls}" onclick="Quiz.jumpTo(${i})" title="Question ${i + 1}: ${stateLabel}">${i + 1}</button>`;
    }).join('');

    grid.innerHTML = html;

    // Update live NTA counter badges in palette card
    const elAns = document.getElementById('cntAnswered');
    const elNotAns = document.getElementById('cntNotAnswered');
    const elRev = document.getElementById('cntReview');
    const elAnsRev = document.getElementById('cntAnsReview');
    const elNotVis = document.getElementById('cntNotVisited');

    if (elAns) elAns.textContent = cntAnswered;
    if (elNotAns) elNotAns.textContent = cntNotAnswered;
    if (elRev) elRev.textContent = cntReview;
    if (elAnsRev) elAnsRev.textContent = cntAnsReview;
    if (elNotVis) elNotVis.textContent = cntNotVisited;
  },

  confirmSubmit() {
    const unanswered = Quiz.questions.filter((q, i) => {
      const ans = Quiz.answers[i];
      if (ans === null || ans === undefined) return true;
      if (typeof ans === 'object') {
        return !((ans.writtenText && ans.writtenText.trim().length > 0) || ans.attachmentUrl);
      }
      return false;
    }).length;

    document.getElementById('confirmModalText').textContent = unanswered > 0
      ? `You have ${unanswered} unanswered question(s). Are you sure you want to finish and submit?`
      : `You have answered all ${Quiz.questions.length} questions. Ready to submit your exam?`;
    App.showModal('confirmModal');
  },

  async submit(auto = false, cheat = false) {
    App.closeModal('confirmModal');
    clearInterval(Quiz.timerHandle);
    Quiz.detachCheatDetection();

    try {
      const res = await App.api(`/api/quizzes/${Quiz.activeQuiz.id}/submit`, {
        method: 'POST',
        body: {
          attemptId: Quiz.attemptId,
          answers: Quiz.answers,
          tabSwitches: Quiz.tabSwitches,
          autoSubmitReason: cheat ? 'cheating' : (auto ? 'timeout' : 'normal')
        }
      });

      Quiz.renderResult(res.result, res.review);
      App.showView('view-result');
      App.toast('Exam submitted successfully!', 'ok');
    } catch (err) {
      App.toast('Submission error: ' + err.message, 'error');
    } finally {
      Quiz.cleanup();
    }
  },

  renderResult(result, review) {
    document.getElementById('resultTitle').textContent = Quiz.activeQuiz ? Quiz.activeQuiz.title : 'Exam Result';
    const pct = result.percentage || 0;

    document.getElementById('scoreRing').style.setProperty('--pct', Math.max(0, pct));
    document.getElementById('scorePctText').textContent = pct + '%';
    document.getElementById('resultScoreDisplay').textContent = `${result.score} / ${result.maxScore} marks`;

    document.getElementById('rCorrect').textContent = result.correct;
    document.getElementById('rWrong').textContent = result.wrong;
    document.getElementById('rSkipped').textContent = result.skipped;

    const m = Math.floor(result.timeTaken / 60), s = result.timeTaken % 60;
    document.getElementById('rTime').textContent = `${m}:${String(s).padStart(2, '0')}`;

    if (pct >= 50 && window.Tilt3D && typeof window.Tilt3D.confetti === 'function') {
      setTimeout(() => {
        window.Tilt3D.confetti(window.innerWidth / 2, window.innerHeight * 0.35, 45);
      }, 300);
    }

    // Render Answer Review
    const reviewArea = document.getElementById('reviewArea');
    if (review && review.length > 0) {
      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
      reviewArea.innerHTML = review.map((q, idx) => {
        const isWritten = q.isSubjective || q.qType === 'written';

        if (isWritten) {
          let statusBadge = '<span class="badge warning">Under Evaluation</span>';
          if (q.marksAwarded !== null && q.marksAwarded !== undefined && (result.evaluationStatus === 'evaluated' || !result.needsManualEvaluation)) {
            statusBadge = `<span class="badge success">${q.marksAwarded} / ${q.maxMarks} Marks</span>`;
          }

          return `
            <div class="review-q">
              <div class="flex-between" style="margin-bottom:8px">
                <b>Written Question ${idx + 1}</b>
                ${statusBadge}
              </div>
              <p style="margin-bottom: 12px; color: var(--text)" class="math-content">${App.escapeHtml(q.text)}</p>
              ${q.imageUrl ? `
                <div style="margin-bottom: 12px;">
                  <img src="${q.imageUrl}" alt="Question diagram" style="max-height: 180px; max-width: 100%; border-radius: 6px; border: 1px solid var(--border);" />
                </div>
              ` : ''}
              <div style="background: var(--surface-2); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                <div style="font-size: 12px; font-weight: 700; color: var(--accent); margin-bottom: 4px; text-transform: uppercase;">Your Written Response:</div>
                ${q.writtenText ? `
                  <div style="white-space: pre-wrap; font-size: 13.5px; line-height: 1.6; margin-bottom: 8px;" class="math-content">${App.escapeHtml(q.writtenText)}</div>
                ` : '<div style="font-size: 13px; color: var(--text-dim); margin-bottom: 8px;">(No typed response provided)</div>'}

                ${q.attachmentUrl ? `
                  <div style="margin-top: 8px; border-top: 1px dashed var(--border); padding-top: 8px;">
                    <div style="font-size: 12px; font-weight: 700; color: var(--accent); margin-bottom: 4px;">Uploaded Copy / Sheet:</div>
                    ${q.attachmentUrl.startsWith('data:image/') || q.attachmentUrl.match(/\.(png|jpe?g|webp|gif)$/i) ? `
                      <a href="${q.attachmentUrl}" target="_blank">
                        <img src="${q.attachmentUrl}" alt="Handwritten sheet" style="max-height: 180px; max-width: 100%; border-radius: 6px; border: 1px solid var(--border);" />
                      </a>
                    ` : `
                      <a href="${q.attachmentUrl}" target="_blank" class="btn secondary sm" download="handwritten_sheet">Download Uploaded Copy</a>
                    `}
                  </div>
                ` : ''}
              </div>

              ${q.feedback ? `
                <div style="padding: 10px 14px; background: rgba(16, 185, 129, 0.08); border-radius: 8px; margin-bottom: 10px; font-size: 13px;">
                  <b>Examiner Remarks:</b> ${App.escapeHtml(q.feedback)}
                </div>
              ` : ''}

              ${q.explanation ? `<p style="margin-top:10px; font-size:13px; color:var(--text-dim)"><b>Model Answer / Rubric:</b> ${App.escapeHtml(q.explanation)}</p>` : ''}
            </div>
          `;
        }

        const optsHtml = (q.options || []).map((opt, oIdx) => {
          let cls = 'review-opt';
          let indicator = '';

          if (oIdx === q.correct) {
            cls += ' correct';
            indicator = 'Correct Answer';
          } else if (oIdx === q.selected) {
            cls += ' wrong';
            indicator = 'Your Choice';
          }

          return `
            <div class="${cls}">
              <span><b>${letters[oIdx]}.</b> <span class="math-content">${App.escapeHtml(opt)}</span></span>
              <span>${indicator}</span>
            </div>
          `;
        }).join('');

        return `
          <div class="review-q">
            <div class="flex-between" style="margin-bottom:8px">
              <b>Question ${idx + 1}</b>
              <span class="badge ${q.isCorrect ? 'success' : (q.selected === null ? 'warning' : 'danger')}">
                ${q.isCorrect ? `+${q.marksAwarded} Marks` : (q.selected === null ? 'Skipped (0)' : `${q.marksAwarded} Marks`)}
              </span>
            </div>
            <p style="margin-bottom: 12px; color: var(--text)" class="math-content">${App.escapeHtml(q.text)}</p>
            ${q.imageUrl ? `
              <div style="margin-bottom: 12px;">
                <img src="${q.imageUrl}" alt="Question diagram" style="max-height: 180px; max-width: 100%; border-radius: 6px; border: 1px solid var(--border);" />
              </div>
            ` : ''}
            <div>${optsHtml}</div>
            ${q.explanation ? `<p style="margin-top:10px; font-size:13px; color:var(--text-dim)"><b>Explanation:</b> ${App.escapeHtml(q.explanation)}</p>` : ''}
          </div>
        `;
      }).join('');

      reviewArea.classList.remove('hidden');
      App.renderMath(reviewArea);
    } else {
      reviewArea.classList.add('hidden');
    }
  },

  cleanup() {
    clearInterval(Quiz.timerHandle);
    if (Quiz._blockPollTimer) {
      clearInterval(Quiz._blockPollTimer);
      Quiz._blockPollTimer = null;
    }
    Quiz.detachCheatDetection();

    // Stop WebCam Stream
    if (Quiz.webcamStream) {
      try {
        Quiz.webcamStream.getTracks().forEach(track => track.stop());
      } catch (e) {}
      Quiz.webcamStream = null;
    }

    // Exit Fullscreen
    try {
      document.removeEventListener('fullscreenchange', Quiz.onFullscreenChange);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch (e) {}

    // Reset banners and badges
    const fsBadge = document.getElementById('attemptKioskBadge');
    if (fsBadge) fsBadge.style.display = 'none';

    const camBadge = document.getElementById('attemptCameraBadge');
    if (camBadge) camBadge.style.display = 'none';

    const camCard = document.getElementById('attemptWebcamCard');
    if (camCard) camCard.style.display = 'none';

    const bufferBanner = document.getElementById('attemptUploadBufferBanner');
    if (bufferBanner) bufferBanner.style.display = 'none';

    Quiz.attemptId = null;
    Quiz.answers = [];
    Quiz.marked = [];
    Quiz.questions = [];
    Quiz.inUploadBuffer = false;
    Quiz.uploadBufferRemaining = 0;
  }
};
