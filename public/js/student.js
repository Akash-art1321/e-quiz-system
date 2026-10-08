// Student Dashboard & Feature Modules
const Student = {
  quizzes: [],
  history: [],
  currentTab: 'browse',

  pendingPhoto: null,

  async init() {
    App.showView('view-student-dash');
    const firstName = (App.user.name || '').split(' ')[0] || 'Student';
    document.getElementById('stuWelcome').textContent = `Welcome, ${firstName}`;
    document.getElementById('stuSubWelcome').textContent = `${App.user.collegeName || 'Student'} • ID: ${App.user.studentId || '-'}`;

    // Render persistent sidebar student profile card
    Student.updateSidebarProfile(App.user);

    // Render proctoring lock notice if student has a locked attempt
    let blockBanner = document.getElementById('stuDashBlockBanner');
    if (Student.blockedAttempt) {
      if (!blockBanner) {
        blockBanner = document.createElement('div');
        blockBanner.id = 'stuDashBlockBanner';
        const head = document.querySelector('.student-main-content .dash-head');
        if (head && head.parentNode) {
          head.parentNode.insertBefore(blockBanner, head.nextSibling);
        }
      }
      blockBanner.style.cssText = 'margin-bottom: 20px; background: rgba(239, 68, 68, 0.12); border: 1.5px solid #ef4444; border-radius: 12px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; color: #fff;';
      blockBanner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <div>
            <b style="color: #fca5a5; font-size: 14.5px;">Proctoring Alert — Exam Locked:</b>
            <div style="font-size: 13.5px; color: #cbd5e1; margin-top: 2px;">Your attempt for "<strong>${App.escapeHtml(Student.blockedAttempt.quizTitle || 'Exam')}</strong>" is locked due to a proctoring violation. Please wait for an administrator to unblock you.</div>
          </div>
        </div>
        <button class="btn danger sm" onclick="Quiz.showBlockScreen(); Quiz.startBlockPoll();">View Lock Screen</button>
      `;
      blockBanner.style.display = 'flex';
    } else if (blockBanner) {
      blockBanner.style.display = 'none';
    }

    Student.setTab('browse');
    await Promise.all([
      Student.loadQuizzes(),
      Student.loadHistory()
    ]);
  },

  updateSidebarProfile(u) {
    if (!u) return;
    const nameEl = document.getElementById('stuSideName');
    const idEl = document.getElementById('stuSideId');
    const colEl = document.getElementById('stuSideCollege');
    const rollEl = document.getElementById('stuSideRoll');
    const crsEl = document.getElementById('stuSideCourse');
    const fthEl = document.getElementById('stuSideFather');
    const mthEl = document.getElementById('stuSideMother');
    const photoEl = document.getElementById('stuSidePhoto');
    const fallbackEl = document.getElementById('stuSidePhotoFallback');

    if (nameEl) nameEl.textContent = u.name || 'Candidate';
    if (idEl) idEl.textContent = u.studentId || 'STU';
    if (colEl) colEl.textContent = u.collegeName || 'General';
    if (rollEl) rollEl.textContent = u.rollNumber || '-';
    if (crsEl) crsEl.textContent = [u.course, u.year].filter(Boolean).join(' • ') || '-';
    if (fthEl) fthEl.textContent = u.fatherName || '-';
    if (mthEl) mthEl.textContent = u.motherName || '-';

    if (photoEl && fallbackEl) {
      if (u.profilePhoto) {
        photoEl.src = u.profilePhoto;
        photoEl.style.display = 'block';
        fallbackEl.style.display = 'none';
      } else {
        photoEl.style.display = 'none';
        fallbackEl.style.display = 'block';
      }
    }
  },

  openFirstLoginModal() {
    const curPassInput = document.getElementById('firstCurPass');
    if (curPassInput && Auth.lastEnteredPassword) {
      curPassInput.value = Auth.lastEnteredPassword;
    }
    const msgEl = document.getElementById('firstLoginMsg');
    if (msgEl) msgEl.style.display = 'none';
    App.showModal('firstLoginModal');
  },

  async handleFirstLoginPasswordChange(e) {
    e.preventDefault();
    const msgEl = document.getElementById('firstLoginMsg');
    if (msgEl) msgEl.style.display = 'none';

    const currentPassword = document.getElementById('firstCurPass').value;
    const newPassword = document.getElementById('firstNewPass').value;
    const confirmPassword = document.getElementById('firstConfPass').value;

    if (newPassword !== confirmPassword) {
      msgEl.textContent = 'New password and confirmation do not match.';
      msgEl.className = 'msg error';
      msgEl.style.display = 'block';
      return false;
    }

    const submitBtn = document.getElementById('firstLoginSubmitBtn');
    try {
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Updating...'; }

      await App.api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword, confirmPassword }
      });

      if (App.user) {
        App.user.mustChangePassword = false;
      }
      App.closeModal('firstLoginModal');
      App.toast('Your password has been changed successfully! Welcome to QuizNest.', 'ok');
    } catch (err) {
      msgEl.textContent = err.message || 'Failed to update password.';
      msgEl.className = 'msg error';
      msgEl.style.display = 'block';
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save Password & Continue →'; }
    }

    return false;
  },

  setTab(tab) {
    Student.currentTab = tab;
    document.querySelectorAll('#view-student-dash .tabs button, #view-student-dash .side-nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.t === tab);
    });

    ['browse', 'history', 'leader', 'profile'].forEach(t => {
      const el = document.getElementById('stuTab' + t[0].toUpperCase() + t.slice(1));
      if (el) el.classList.toggle('hidden', t !== tab);
    });

    if (tab === 'browse') Student.renderQuizzes();
    if (tab === 'history') Student.loadHistory();
    if (tab === 'leader') Student.loadLeaderboards();
    if (tab === 'profile') Student.loadProfileTab();
  },

  async loadQuizzes() {
    try {
      const res = await App.api('/api/quizzes');
      Student.quizzes = res.quizzes || [];
      Student.populateCategories();
      Student.renderQuizzes();
    } catch (err) {
      App.toast('Failed to load quizzes: ' + err.message, 'error');
    }
  },

  populateCategories() {
    const cats = [...new Set(Student.quizzes.map(q => q.category).filter(Boolean))];
    const sel = document.getElementById('stuCategoryFilter');
    if (!sel) return;
    sel.innerHTML = '<option value="">All categories</option>' +
      cats.map(c => `<option value="${App.escapeHtml(c)}">${App.escapeHtml(c)}</option>`).join('');
  },

  renderQuizzes() {
    const search = (document.getElementById('stuSearch').value || '').toLowerCase();
    const cat = document.getElementById('stuCategoryFilter').value;
    const grid = document.getElementById('stuQuizGrid');
    if (!grid) return;

    const list = Student.quizzes.filter(q => {
      const matchCat = !cat || q.category === cat;
      const matchSearch = q.title.toLowerCase().includes(search) || (q.category || '').toLowerCase().includes(search);
      return matchCat && matchSearch;
    });

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="empty" style="grid-column: 1 / -1">
          No exams found matching your search.
        </div>`;
      return;
    }

    grid.innerHTML = list.map(q => {
      let actionBtn;
      let scheduleBadge = '';
      let branchBadge = '';

      if (q.eligibility && q.eligibility.toLowerCase() !== 'all') {
        branchBadge = `<span class="badge ${q.isEligible === false ? 'danger' : ''}" style="font-size:11px;">${App.escapeHtml(q.eligibility)}</span>`;
      }

      if (q.scheduleStatus === 'upcoming') {
        const sDate = q.startTime ? new Date(q.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Soon';
        scheduleBadge = `<span class="badge warning" title="Scheduled Window">Opens: ${sDate}</span>`;
      } else if (q.scheduleStatus === 'expired') {
        scheduleBadge = `<span class="badge danger" title="Exam window has ended">Expired</span>`;
      } else if (q.endTime) {
        const eTime = new Date(q.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        scheduleBadge = `<span class="badge success" title="Active Window">Ends: ${eTime}</span>`;
      }

      if (Student.blockedAttempt && Student.blockedAttempt.quizId === q.id) {
        actionBtn = `<button class="btn danger block sm" onclick="Quiz.showBlockScreen(); Quiz.startBlockPoll();">Exam Locked by Invigilator</button>`;
      } else if (q.hasAttempted && !q.allowMultipleAttempts) {
        actionBtn = `<button class="btn secondary block sm" onclick="Student.viewQuizResultDirect('${q.id}')">Attempt Completed (View Score)</button>`;
      } else if (q.isEligible === false) {
        actionBtn = `<button class="btn secondary block sm" disabled style="opacity:0.6; cursor:not-allowed">Ineligible (Target: ${App.escapeHtml(q.eligibility)})</button>`;
      } else if (q.scheduleStatus === 'upcoming') {
        const sTime = q.startTime ? new Date(q.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Soon';
        actionBtn = `<button class="btn secondary block sm" disabled style="opacity:0.6; cursor:not-allowed">Opens at ${sTime}</button>`;
      } else if (q.scheduleStatus === 'expired') {
        actionBtn = `<button class="btn secondary block sm" disabled style="opacity:0.6; cursor:not-allowed">Exam Window Closed</button>`;
      } else {
        actionBtn = `<button class="btn block" onclick="Quiz.openInstructions('${q.id}')">Take Exam →</button>`;
      }

      return `
        <div class="quiz-card">
          <div class="flex-between" style="flex-wrap: wrap; gap: 6px;">
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <span class="badge">${App.escapeHtml(q.category || 'General')}</span>
              ${branchBadge}
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              ${scheduleBadge}
              ${q.hasAttempted ? '<span class="badge success">Attempted</span>' : ''}
            </div>
          </div>
          <h3 style="margin-top: 6px">${App.escapeHtml(q.title)}</h3>
          <div class="qmeta">
            <span>${q.questionCount} Questions</span>
            <span>${q.duration} Mins</span>
            <span>${q.marks} pt/Q</span>
            ${q.negative ? `<span style="color:var(--accent)">−${Math.round(q.negative * 100)}%</span>` : ''}
          </div>
          ${actionBtn}
        </div>
      `;
    }).join('');
  },

  async loadHistory() {
    try {
      const res = await App.api('/api/student/history');
      Student.history = res.attempts || [];
      Student.renderHistory();
    } catch (err) {
      App.toast('Failed to load history: ' + err.message, 'error');
    }
  },

  renderHistory() {
    const tbody = document.querySelector('#stuHistoryTable tbody');
    if (!tbody) return;

    if (Student.history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty">No completed exam attempts yet.</div></td></tr>`;
      return;
    }

    tbody.innerHTML = Student.history.map(a => {
      const m = Math.floor(a.timeTaken / 60), s = a.timeTaken % 60;
      const cheatBadge = a.flaggedForCheating
        ? `<span class="badge danger" title="Repeated window/tab switching detected">Flagged (${a.tabSwitches})</span>`
        : (a.tabSwitches > 0 ? `<span class="badge warning">${a.tabSwitches} switches</span>` : `<span style="color:var(--text-dim)">Clean</span>`);

      let scoreDisplay = `<b>${a.score}</b> / ${a.maxScore}`;
      if (a.needsManualEvaluation) {
        scoreDisplay += a.evaluationStatus === 'evaluated'
          ? `<br><small class="badge success" style="font-size:10px;padding:1px 5px;">Evaluated</small>`
          : `<br><small class="badge warning" style="font-size:10px;padding:1px 5px;">Pending Review</small>`;
      }

      return `
        <tr>
          <td><b>${App.escapeHtml(a.quizTitle)}</b><br><small style="color:var(--text-dim)">${App.escapeHtml(a.quizCategory)}</small></td>
          <td>${scoreDisplay}</td>
          <td><b>${a.percentage}%</b></td>
          <td>${m}m ${String(s).padStart(2, '0')}s</td>
          <td>${cheatBadge}</td>
          <td>${new Date(a.date).toLocaleDateString()}</td>
          <td><button class="btn secondary sm" onclick="Student.viewPastResult('${a.id}')">Review</button></td>
        </tr>
      `;
    }).join('');
  },

  async viewPastResult(attemptId) {
    try {
      const res = await App.api(`/api/student/attempts/${attemptId}`);
      Quiz.renderResult(res.attempt, res.review);
      App.showView('view-result');
    } catch (err) {
      App.toast(err.message || 'Could not load attempt review', 'error');
    }
  },

  viewQuizResultDirect(quizId) {
    const found = Student.history.find(h => h.quizId === quizId);
    if (found) {
      Student.viewPastResult(found.id);
    } else {
      Student.setTab('history');
    }
  },

  async loadLeaderboards() {
    const sel = document.getElementById('stuLeaderQuizSelect');
    if (!sel) return;

    sel.innerHTML = Student.quizzes.map(q => `<option value="${q.id}">${App.escapeHtml(q.title)}</option>`).join('');
    if (Student.quizzes.length > 0) {
      sel.value = Student.quizzes[0].id;
      Student.renderLeaderboard();
    }
  },

  async renderLeaderboard() {
    const quizId = document.getElementById('stuLeaderQuizSelect').value;
    if (!quizId) return;

    const tbody = document.querySelector('#stuLeaderTable tbody');
    if (!tbody) return;

    try {
      const res = await App.api(`/api/quizzes/${quizId}/leaderboard`);
      const rows = res.leaderboard || [];

      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty">No attempts recorded yet for this exam.</div></td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map((r, i) => {
        const m = Math.floor(r.timeTaken / 60), s = r.timeTaken % 60;
        const rankCls = i === 0 ? 'rank1' : i === 1 ? 'rank2' : i === 2 ? 'rank3' : '';
        return `
          <tr>
            <td class="${rankCls}"><b>#${r.rank}</b></td>
            <td><b>${App.escapeHtml(r.studentName)}</b> (${App.escapeHtml(r.studentCode)})</td>
            <td>${r.score} / ${r.maxScore}</td>
            <td><b>${r.percentage}%</b></td>
            <td>${m}m ${String(s).padStart(2, '0')}s</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      App.toast('Failed to load leaderboard: ' + err.message, 'error');
    }
  },

  // ---------------- Profile Section ----------------
  async loadProfileTab() {
    try {
      const res = await App.api('/api/student/profile');
      const p = res.profile;

      document.getElementById('profStudentId').value = p.studentId || '';
      document.getElementById('profName').value = p.name || '';
      document.getElementById('profEmail').value = p.email || '';
      document.getElementById('profPhone').value = p.phone || '';
      document.getElementById('profCollege').value = p.collegeName || '';
      document.getElementById('profRoll').value = p.rollNumber || '';
      document.getElementById('profCourse').value = p.course || '';
      document.getElementById('profYear').value = p.year || '';
      if (document.getElementById('profFatherName')) document.getElementById('profFatherName').value = p.fatherName || '';
      if (document.getElementById('profMotherName')) document.getElementById('profMotherName').value = p.motherName || '';

      // If email is configured by admin, lock it
      const emailInput = document.getElementById('profEmail');
      const emailLabel = document.getElementById('profEmailLabel');
      const emailHint = document.getElementById('profEmailHint');
      if (p.isEmailLocked && emailInput) {
        emailInput.readOnly = true;
        emailInput.disabled = true;
        emailInput.style.opacity = '0.75';
        emailInput.style.cursor = 'not-allowed';
        emailInput.style.background = 'var(--surface)';
        if (emailLabel) emailLabel.textContent = 'Email Address (Locked)';
        if (emailHint) emailHint.textContent = 'Official registered email (configured by administrator)';
      }

      Student.pendingPhoto = p.profilePhoto || null;
      const photoEl = document.getElementById('profPhotoPreview');
      const fallbackEl = document.getElementById('profPhotoFallback');
      const rmBtn = document.getElementById('profRemovePhotoBtn');

      if (p.profilePhoto) {
        if (photoEl) { photoEl.src = p.profilePhoto; photoEl.style.display = 'block'; }
        if (fallbackEl) fallbackEl.style.display = 'none';
        if (rmBtn) rmBtn.style.display = 'inline-block';
      } else {
        if (photoEl) photoEl.style.display = 'none';
        if (fallbackEl) fallbackEl.style.display = 'block';
        if (rmBtn) rmBtn.style.display = 'none';
      }

      // Also ensure persistent sidebar profile card matches
      Student.updateSidebarProfile({ ...App.user, ...p });
    } catch (err) {
      App.toast('Failed to load profile: ' + err.message, 'error');
    }
  },

  handlePhotoUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      App.toast('Please select an image file (JPG, PNG, WebP)', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const maxDim = 360;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        Student.pendingPhoto = dataUrl;

        const photoEl = document.getElementById('profPhotoPreview');
        const fallbackEl = document.getElementById('profPhotoFallback');
        const rmBtn = document.getElementById('profRemovePhotoBtn');
        if (photoEl) { photoEl.src = dataUrl; photoEl.style.display = 'block'; }
        if (fallbackEl) fallbackEl.style.display = 'none';
        if (rmBtn) rmBtn.style.display = 'inline-block';

        // Update sidebar preview immediately
        const sidePhoto = document.getElementById('stuSidePhoto');
        const sideFallback = document.getElementById('stuSidePhotoFallback');
        if (sidePhoto) { sidePhoto.src = dataUrl; sidePhoto.style.display = 'block'; }
        if (sideFallback) sideFallback.style.display = 'none';

        App.toast('Photo selected! Click "Save Profile & Contact Details" to commit.', 'ok');
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  },

  removePhoto() {
    Student.pendingPhoto = '';
    const photoEl = document.getElementById('profPhotoPreview');
    const fallbackEl = document.getElementById('profPhotoFallback');
    const rmBtn = document.getElementById('profRemovePhotoBtn');
    if (photoEl) { photoEl.src = ''; photoEl.style.display = 'none'; }
    if (fallbackEl) fallbackEl.style.display = 'block';
    if (rmBtn) rmBtn.style.display = 'none';

    const sidePhoto = document.getElementById('stuSidePhoto');
    const sideFallback = document.getElementById('stuSidePhotoFallback');
    if (sidePhoto) { sidePhoto.src = ''; sidePhoto.style.display = 'none'; }
    if (sideFallback) sideFallback.style.display = 'block';

    const fileInput = document.getElementById('profPhotoFileInput');
    if (fileInput) fileInput.value = '';

    App.toast('Photo removed. Click "Save Profile & Contact Details" to commit.', 'ok');
  },

  openProfileModal() {
    Student.setTab('profile');
  },

  async handleProfileSave(e) {
    e.preventDefault();
    const msgEl = document.getElementById('profMsg');
    msgEl.style.display = 'none';

    const phone = document.getElementById('profPhone').value.trim();
    const fatherName = document.getElementById('profFatherName') ? document.getElementById('profFatherName').value.trim() : '';
    const motherName = document.getElementById('profMotherName') ? document.getElementById('profMotherName').value.trim() : '';
    const emailInput = document.getElementById('profEmail');
    const email = (emailInput && !emailInput.disabled) ? emailInput.value.trim() : undefined;

    try {
      const payload = {
        phone,
        fatherName,
        motherName
      };
      if (email !== undefined) payload.email = email;
      if (Student.pendingPhoto !== null) {
        payload.profilePhoto = Student.pendingPhoto;
      }

      const res = await App.api('/api/student/profile', {
        method: 'PUT',
        body: payload
      });

      if (App.user) {
        App.user.phone = phone;
        App.user.fatherName = fatherName;
        App.user.motherName = motherName;
        if (email) App.user.email = email;
        if (Student.pendingPhoto !== null) App.user.profilePhoto = Student.pendingPhoto;
      }

      Student.updateSidebarProfile(App.user);
      App.renderNav();

      msgEl.textContent = res.message || 'Profile details saved successfully.';
      msgEl.className = 'msg ok';
      msgEl.style.display = 'block';
      App.toast('Profile details updated successfully.', 'ok');
    } catch (err) {
      msgEl.textContent = err.message || 'Error updating profile.';
      msgEl.className = 'msg error';
      msgEl.style.display = 'block';
    }

    return false;
  }
};
