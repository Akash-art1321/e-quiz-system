// Admin Control Panel & Management
const Admin = {
  currentTab: 'overview',
  quizzes: [],
  students: [],
  qBuilderState: [],
  selectedStudentId: null,
  revealedPasswords: new Set(),
  _eventSource: null,
  _autoRefreshInterval: null,

  async init() {
    App.showView('view-admin-dash');
    Admin.initRealtimeStream();
    Admin.setTab('overview');
  },

  setTab(tab, refresh = true) {
    Admin.currentTab = tab;
    document.querySelectorAll('#view-admin-dash .tabs button, #view-admin-dash .side-nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.t === tab);
    });

    ['overview', 'quizzes', 'create', 'students', 'evaluation', 'results', 'alerts', 'reports', 'settings'].forEach(t => {
      const el = document.getElementById('adminTab' + t[0].toUpperCase() + t.slice(1));
      if (el) el.classList.toggle('hidden', t !== tab);
    });

    if (tab === 'overview') Admin.loadOverview();
    if (tab === 'quizzes') Admin.loadQuizzes();
    if (tab === 'create' && refresh) Admin.prepareCreateQuiz();
    if (tab === 'students') Admin.loadStudents();
    if (tab === 'evaluation') Admin.loadEvaluationView();
    if (tab === 'results') Admin.loadResultsView();
    if (tab === 'alerts') Admin.loadAlerts();
    if (tab === 'reports') Admin.loadReports();
    if (tab === 'settings') Admin.loadSettings();
  },

  // ---------------- 1. Overview ----------------
  async loadOverview() {
    try {
      const res = await App.api('/api/admin/overview');
      const s = res.stats;

      const statQ = document.getElementById('statQuizzes');
      if (statQ) statQ.textContent = s.totalQuizzes;
      const statS = document.getElementById('statStudents');
      if (statS) statS.textContent = s.totalStudents;
      const statA = document.getElementById('statAttempts');
      if (statA) statA.textContent = s.totalAttempts;
      const statAvg = document.getElementById('statAvgScore');
      if (statAvg) statAvg.textContent = s.averageScore + '%';
      const statAlt = document.getElementById('statAlerts');
      if (statAlt) statAlt.textContent = s.activeAlerts;
      const statResets = document.getElementById('statPendingResets');
      if (statResets) statResets.textContent = s.pendingResetRequests;

      const statEval = document.getElementById('statEvaluationsPending');
      if (statEval) statEval.textContent = s.pendingEvaluations || 0;

      // Update badges in tabs
      const reqBadge = document.getElementById('reqBadge');
      if (reqBadge) {
        reqBadge.textContent = s.pendingResetRequests;
        reqBadge.classList.toggle('hidden', s.pendingResetRequests === 0);
      }
      const evalBadge = document.getElementById('evalPendingBadge');
      if (evalBadge) {
        evalBadge.textContent = s.pendingEvaluations || 0;
        evalBadge.classList.toggle('hidden', !s.pendingEvaluations || s.pendingEvaluations === 0);
      }
      const alertBadge = document.getElementById('alertsBadge');
      if (alertBadge) {
        alertBadge.textContent = s.activeAlerts;
        alertBadge.classList.toggle('hidden', s.activeAlerts === 0);
      }

      // Recent attempts table
      const tbody = document.querySelector('#adminRecentAttemptsTable tbody');
      if (tbody) {
        if (!res.recentAttempts || res.recentAttempts.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6"><div class="empty">No attempts recorded yet.</div></td></tr>`;
        } else {
          tbody.innerHTML = res.recentAttempts.map(a => `
            <tr>
              <td><b>${App.escapeHtml(a.studentName)}</b> (${App.escapeHtml(a.studentCode)})</td>
              <td>${App.escapeHtml(a.quizTitle)}</td>
              <td><b>${a.score}/${a.maxScore}</b> (${a.percentage}%)</td>
              <td>${a.flagged ? `<span class="badge danger">Flagged (${a.switches})</span>` : (a.switches > 0 ? `<span class="badge warning">${a.switches}</span>` : '0')}</td>
              <td>${new Date(a.date).toLocaleDateString()}</td>
            </tr>
          `).join('');
        }
      }
    } catch (err) {
      App.toast('Failed to load overview: ' + err.message, 'error');
    }
  },

  // ---------------- 2. Quizzes ----------------
  async loadQuizzes() {
    try {
      const res = await App.api('/api/quizzes');
      Admin.quizzes = res.quizzes || [];
      const grid = document.getElementById('adminQuizGrid');
      if (!grid) return;

      if (Admin.quizzes.length === 0) {
        grid.innerHTML = `<div class="empty" style="grid-column: 1 / -1">No quizzes found. Click "Create Exam" to build your first quiz.</div>`;
        return;
      }

      grid.innerHTML = Admin.quizzes.map(q => `
        <div class="quiz-card">
          <div class="flex-between">
            <span class="badge">${App.escapeHtml(q.category || 'General')}</span>
            <span class="badge ${q.isActive ? 'success' : 'warning'}">${q.isActive ? 'Active' : 'Disabled'}</span>
          </div>
          <h3>${App.escapeHtml(q.title)}</h3>
          <div class="qmeta">
            <span>${q.questionCount} Qs</span>
            <span>${q.duration}m</span>
            <span>${q.marks}pt/Q</span>
            ${q.negative ? `<span>−${Math.round(q.negative * 100)}%</span>` : ''}
            <span>${q.totalAttempts || 0} attempts</span>
          </div>
          <div class="flex-between" style="margin-top: 8px">
            <button class="btn secondary sm" onclick="Admin.editQuiz('${q.id}')">Edit</button>
            <button class="btn secondary sm" onclick="Admin.toggleQuizStatus('${q.id}')">${q.isActive ? 'Disable' : 'Enable'}</button>
            <button class="btn ghost sm" onclick="Admin.downloadQuizPDF('${q.id}')">PDF</button>
            <button class="btn danger sm" onclick="Admin.deleteQuiz('${q.id}')">Delete</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      App.toast('Error loading quizzes: ' + err.message, 'error');
    }
  },

  async toggleQuizStatus(quizId) {
    try {
      await App.api(`/api/admin/quizzes/${quizId}/status`, { method: 'PATCH' });
      Admin.loadQuizzes();
      App.toast('Quiz status updated.', 'ok');
    } catch (err) {
      App.toast('Error toggling status: ' + err.message, 'error');
    }
  },

  async deleteQuiz(quizId) {
    if (!confirm('Are you sure you want to delete this quiz? All question items and attempt records will be permanently removed.')) return;
    try {
      await App.api(`/api/admin/quizzes/${quizId}`, { method: 'DELETE' });
      App.toast('Quiz deleted.', 'ok');
      Admin.loadQuizzes();
    } catch (err) {
      App.toast(err.message || 'Failed to delete quiz', 'error');
    }
  },

  // ---------------- 3. Question Builder & Create/Edit Quiz ----------------
  prepareCreateQuiz(clearAll = true) {
    if (clearAll) {
      const editIdEl = document.getElementById('qEditId');
      if (editIdEl) editIdEl.value = '';

      const headingEl = document.getElementById('quizFormHeading');
      if (headingEl) headingEl.textContent = 'Create New Examination';

      const submitBtn = document.getElementById('saveQuizSubmitBtn');
      if (submitBtn) submitBtn.textContent = 'Save & Publish Examination';

      const cancelBtn = document.getElementById('cancelQuizEditBtn');
      if (cancelBtn) cancelBtn.textContent = 'Cancel';

      const titleEl = document.getElementById('qTitle');
      if (titleEl) titleEl.value = '';

      const catEl = document.getElementById('qCategory');
      if (catEl) catEl.value = 'General';

      const durEl = document.getElementById('qDuration');
      if (durEl) durEl.value = 15;

      const marksEl = document.getElementById('qMarks');
      if (marksEl) marksEl.value = 1;

      const negEl = document.getElementById('qNegative');
      if (negEl) negEl.value = '0';

      const instEl = document.getElementById('qInstructions');
      if (instEl) instEl.value = '';

      const allowMultEl = document.getElementById('qAllowMultiple');
      if (allowMultEl) allowMultEl.checked = false;

      const eligEl = document.getElementById('qEligibility');
      if (eligEl) eligEl.value = 'all';

      const eligSel = document.getElementById('qEligibilitySelect');
      if (eligSel) eligSel.value = '';

      const schedCheck = document.getElementById('qScheduleEnable');
      if (schedCheck) schedCheck.checked = false;
      Admin.toggleScheduleInputs(false);

      const sTime = document.getElementById('qStartTime');
      if (sTime) sTime.value = '';
      const eTime = document.getElementById('qEndTime');
      if (eTime) eTime.value = '';

      const upStatusEl = document.getElementById('uploadStatus');
      if (upStatusEl) upStatusEl.textContent = '';

      const upBufferEl = document.getElementById('qUploadBuffer');
      if (upBufferEl) upBufferEl.value = 0;

      const reqCamEl = document.getElementById('qRequireWebcam');
      if (reqCamEl) reqCamEl.checked = true;

      const reqFsEl = document.getElementById('qRequireFullscreen');
      if (reqFsEl) reqFsEl.checked = true;

      Admin.qBuilderState = [];
      Admin.addQuestionBlock();
    }
  },

  toggleScheduleInputs(enabled) {
    const fields = document.getElementById('qScheduleFields');
    const badge = document.getElementById('scheduleNoticeBadge');
    if (fields) fields.style.display = enabled ? 'grid' : 'none';
    if (badge) {
      badge.textContent = enabled ? '⏰ Window Active' : 'Disabled (Open Anytime)';
      badge.className = enabled ? 'badge warning' : 'badge';
    }
  },

  addQuestionBlock(data = null) {
    const id = data && data.id ? data.id : ('blk_' + Math.random().toString(36).substring(2, 9));
    Admin.qBuilderState.push({
      id,
      text: data ? data.text : '',
      qType: data && data.qType ? data.qType : (data && data.q_type ? data.q_type : 'mcq'),
      imageUrl: data && data.imageUrl ? data.imageUrl : (data && data.image_url ? data.image_url : ''),
      marks: data && data.marks !== undefined && data.marks !== null ? data.marks : null,
      options: data && Array.isArray(data.options) && data.options.length ? data.options.slice() : ['', '', '', ''],
      correct: data && data.correct !== undefined ? data.correct : 0,
      explanation: data ? data.explanation : ''
    });
    Admin.renderQBuilder();
  },

  removeQuestionBlock(id) {
    if (Admin.qBuilderState.length <= 1) {
      App.toast('An examination must contain at least one question.', 'error');
      return;
    }
    Admin.qBuilderState = Admin.qBuilderState.filter(b => b.id !== id);
    Admin.renderQBuilder();
  },

  renderQBuilder() {
    const list = document.getElementById('qBuilderList');
    if (!list) return;

    list.innerHTML = Admin.qBuilderState.map((b, idx) => `
      <div class="q-block" data-id="${b.id}" style="margin-bottom:16px; border:1px solid var(--border); border-radius:10px; padding:16px; background:var(--surface);">
        <div class="flex-between" style="margin-bottom: 12px">
          <div style="display:flex; align-items:center; gap:12px;">
            <b>Question ${idx + 1}</b>
            <select style="font-size:12px; padding:4px 8px; width:auto;" onchange="Admin.updateBlock('${b.id}', 'qType', this.value); Admin.renderQBuilder();">
              <option value="mcq" ${b.qType !== 'written' ? 'selected' : ''}>Multiple Choice (MCQ)</option>
              <option value="written" ${b.qType === 'written' ? 'selected' : ''}>Written / Descriptive</option>
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="number" step="0.5" min="0.5" placeholder="Custom Marks" title="Custom marks for this question (leave blank to use exam default marks)" style="width:110px; font-size:12px; padding:4px 8px;" value="${b.marks !== null && b.marks !== undefined ? b.marks : ''}" oninput="Admin.updateBlock('${b.id}', 'marks', this.value ? parseFloat(this.value) : null)">
            <button class="btn ghost sm" onclick="Admin.removeQuestionBlock('${b.id}')">Remove</button>
          </div>
        </div>

        <div class="field">
          <label style="font-size:12.5px; color:var(--text-dim); margin-bottom:4px;">Question Statement (Supports LaTeX math like $E=mc^2$ or $$\\frac{a}{b}$$):</label>
          <textarea rows="2" placeholder="Enter question statement…" oninput="Admin.updateBlock('${b.id}', 'text', this.value)">${App.escapeHtml(b.text)}</textarea>
        </div>

        <!-- Diagram / Formula Image Attachment -->
        <div class="field" style="margin-top:8px;">
          <label style="font-size:12.5px; color:var(--text-dim); margin-bottom:4px;">Diagram / Formula / Image Attachment (Optional):</label>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <input type="text" placeholder="Image URL or upload diagram…" style="flex:1; min-width:200px;" value="${App.escapeHtml(b.imageUrl || '')}" oninput="Admin.updateBlock('${b.id}', 'imageUrl', this.value)">
            <input type="file" accept="image/*" id="imgUpload_${b.id}" style="display:none;" onchange="Admin.handleQuestionImageUpload('${b.id}', event)">
            <button type="button" class="btn secondary sm" onclick="document.getElementById('imgUpload_${b.id}').click()">Upload Diagram</button>
            ${b.imageUrl ? `<button type="button" class="btn ghost sm" onclick="Admin.updateBlock('${b.id}', 'imageUrl', ''); Admin.renderQBuilder();">Clear Image</button>` : ''}
          </div>
          ${b.imageUrl ? `
            <div style="margin-top:8px;">
              <img src="${b.imageUrl}" alt="Diagram preview" style="max-height:140px; max-width:100%; border-radius:6px; border:1px solid var(--border);" />
            </div>
          ` : ''}
        </div>

        ${b.qType === 'written' ? `
          <div style="margin: 12px 0; padding: 10px 14px; background: rgba(79, 91, 255, 0.08); border: 1px dashed var(--primary); border-radius: 8px; font-size: 13px; color: var(--text-dim); line-height: 1.5;">
            <b>Written / Descriptive Question:</b> Candidates will have two options:
            1) Type their response online (with LaTeX formula support), OR 2) Write on paper/copy and upload photo/PDF of their handwritten sheet.
            Examiner can evaluate, award marks, and provide feedback in the Results tab.
          </div>
        ` : `
          <div style="margin-top: 10px;">
            <div style="font-size:12.5px; color:var(--text-dim); margin-bottom:6px;">Options (Select radio for correct answer):</div>
            ${b.options.map((opt, i) => `
              <div class="opt-row" style="margin-bottom:6px;">
                <input type="radio" name="corr_${b.id}" ${b.correct === i ? 'checked' : ''} onchange="Admin.updateBlock('${b.id}', 'correct', ${i})">
                <input type="text" placeholder="Option ${String.fromCharCode(65 + i)}" value="${App.escapeHtml(opt)}" oninput="Admin.updateOption('${b.id}', ${i}, this.value)">
              </div>
            `).join('')}
          </div>
        `}

        <div class="field" style="margin-top: 10px">
          <input placeholder="Explanation / Model Answer / Evaluation Criteria (shown during review)" value="${App.escapeHtml(b.explanation || '')}" oninput="Admin.updateBlock('${b.id}', 'explanation', this.value)">
        </div>
      </div>
    `).join('');

    App.renderMath(list);
  },

  handleQuestionImageUpload(id, e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      App.toast('Please select a valid image file.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = function(ev) {
      Admin.updateBlock(id, 'imageUrl', ev.target.result);
      Admin.renderQBuilder();
    };
    reader.readAsDataURL(file);
  },

  updateBlock(id, key, val) {
    const b = Admin.qBuilderState.find(x => x.id === id);
    if (b) b[key] = val;
  },

  updateOption(id, i, val) {
    const b = Admin.qBuilderState.find(x => x.id === id);
    if (b) b.options[i] = val;
  },

  async saveQuiz() {
    const editId = document.getElementById('qEditId').value;
    const title = document.getElementById('qTitle').value.trim();
    const category = document.getElementById('qCategory').value.trim();
    const duration = parseInt(document.getElementById('qDuration').value, 10);
    const marks = parseFloat(document.getElementById('qMarks').value);
    const negative = parseFloat(document.getElementById('qNegative').value || 0);
    const instructions = document.getElementById('qInstructions').value.trim();
    const allowMultipleAttempts = document.getElementById('qAllowMultiple').checked;

    const eligibility = (document.getElementById('qEligibility')?.value || 'all').trim();
    const scheduleEnabled = document.getElementById('qScheduleEnable')?.checked;
    let startTime = null;
    let endTime = null;
    if (scheduleEnabled) {
      const sVal = document.getElementById('qStartTime')?.value;
      const eVal = document.getElementById('qEndTime')?.value;
      if (sVal) startTime = new Date(sVal).getTime();
      if (eVal) endTime = new Date(eVal).getTime();
      if (startTime && endTime && startTime >= endTime) {
        App.toast('Exam window Start Time must be earlier than End Time.', 'error');
        return;
      }
    }

    const uploadBufferMinutes = parseInt(document.getElementById('qUploadBuffer')?.value || 0, 10);
    const requireWebcam = document.getElementById('qRequireWebcam')?.checked ?? true;
    const requireFullscreen = document.getElementById('qRequireFullscreen')?.checked ?? true;

    if (!title) {
      App.toast('Please provide a quiz title.', 'error');
      return;
    }

    if (Admin.qBuilderState.length === 0) {
      App.toast('Please add at least one question.', 'error');
      return;
    }

    // Validate questions
    for (let i = 0; i < Admin.qBuilderState.length; i++) {
      const q = Admin.qBuilderState[i];
      if (!q.text.trim()) {
        App.toast(`Question ${i + 1} text cannot be empty.`, 'error');
        return;
      }
      if (q.qType !== 'written' && q.options.some(o => !o.trim())) {
        App.toast(`Question ${i + 1} has blank options. Please fill all options.`, 'error');
        return;
      }
    }

    const payload = {
      title,
      category,
      duration,
      marks,
      negative,
      instructions,
      allowMultipleAttempts,
      eligibility,
      startTime,
      endTime,
      uploadBufferMinutes,
      requireWebcam,
      requireFullscreen,
      questions: Admin.qBuilderState.map(b => ({
        id: b.id && !b.id.startsWith('blk_') ? b.id : undefined,
        text: b.text.trim(),
        qType: b.qType === 'written' ? 'written' : 'mcq',
        imageUrl: (b.imageUrl || '').trim(),
        marks: b.marks !== null && b.marks !== undefined && !isNaN(parseFloat(b.marks)) ? parseFloat(b.marks) : null,
        options: b.qType === 'written' ? [] : b.options.map(o => o.trim()),
        correct: b.qType === 'written' ? 0 : b.correct,
        explanation: (b.explanation || '').trim()
      }))
    };

    try {
      if (editId) {
        await App.api(`/api/admin/quizzes/${editId}`, { method: 'PUT', body: payload });
        App.toast('Examination updated successfully!', 'ok');
      } else {
        await App.api('/api/admin/quizzes', { method: 'POST', body: payload });
        App.toast('Examination published successfully!', 'ok');
      }
      Admin.prepareCreateQuiz(true);
      Admin.setTab('quizzes');
    } catch (err) {
      App.toast('Error saving quiz: ' + err.message, 'error');
    }
  },

  cancelQuizEdit() {
    Admin.prepareCreateQuiz(true);
    Admin.setTab('quizzes');
  },

  async editQuiz(quizId) {
    try {
      const res = await App.api(`/api/admin/quizzes/${quizId}`);
      const q = res.quiz;
      if (!q) {
        App.toast('Quiz data not found', 'error');
        return;
      }

      // Switch to create tab without wiping the form
      Admin.setTab('create', false);

      const editIdEl = document.getElementById('qEditId');
      if (editIdEl) editIdEl.value = q.id;

      const headingEl = document.getElementById('quizFormHeading');
      if (headingEl) headingEl.textContent = 'Edit Examination: ' + q.title;

      const submitBtn = document.getElementById('saveQuizSubmitBtn');
      if (submitBtn) submitBtn.textContent = 'Update Examination';

      const cancelBtn = document.getElementById('cancelQuizEditBtn');
      if (cancelBtn) cancelBtn.textContent = 'Cancel Edit';

      const titleEl = document.getElementById('qTitle');
      if (titleEl) titleEl.value = q.title || '';

      const catEl = document.getElementById('qCategory');
      if (catEl) catEl.value = q.category || 'General';

      const durEl = document.getElementById('qDuration');
      if (durEl) durEl.value = q.duration || 15;

      const marksEl = document.getElementById('qMarks');
      if (marksEl) marksEl.value = q.marks || 1;

      const negVal = parseFloat(q.negative || 0);
      const negSelect = document.getElementById('qNegative');
      if (negSelect) {
        let matched = false;
        for (let i = 0; i < negSelect.options.length; i++) {
          if (parseFloat(negSelect.options[i].value) === negVal) {
            negSelect.selectedIndex = i;
            matched = true;
            break;
          }
        }
        if (!matched) negSelect.value = String(q.negative ?? 0);
      }

      const instEl = document.getElementById('qInstructions');
      if (instEl) instEl.value = q.instructions || '';

      const allowMultEl = document.getElementById('qAllowMultiple');
      if (allowMultEl) allowMultEl.checked = !!q.allowMultipleAttempts;

      const eligEl = document.getElementById('qEligibility');
      if (eligEl) eligEl.value = q.eligibility || 'all';
      const eligSel = document.getElementById('qEligibilitySelect');
      if (eligSel) eligSel.value = q.eligibility || '';

      const hasSchedule = !!(q.startTime || q.endTime);
      const schedCheck = document.getElementById('qScheduleEnable');
      if (schedCheck) schedCheck.checked = hasSchedule;
      Admin.toggleScheduleInputs(hasSchedule);

      const sTime = document.getElementById('qStartTime');
      if (sTime) {
        if (q.startTime) {
          const d = new Date(q.startTime);
          sTime.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        } else {
          sTime.value = '';
        }
      }
      const eTime = document.getElementById('qEndTime');
      if (eTime) {
        if (q.endTime) {
          const d = new Date(q.endTime);
          eTime.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        } else {
          eTime.value = '';
        }
      }

      const upBufferEl = document.getElementById('qUploadBuffer');
      if (upBufferEl) upBufferEl.value = q.uploadBufferMinutes || 0;

      const reqCamEl = document.getElementById('qRequireWebcam');
      if (reqCamEl) reqCamEl.checked = q.requireWebcam !== false;

      const reqFsEl = document.getElementById('qRequireFullscreen');
      if (reqFsEl) reqFsEl.checked = q.requireFullscreen !== false;

      const upStatusEl = document.getElementById('uploadStatus');
      if (upStatusEl) upStatusEl.textContent = '';

      Admin.qBuilderState = [];
      if (Array.isArray(q.questions) && q.questions.length > 0) {
        q.questions.forEach(qq => {
          Admin.addQuestionBlock(qq);
        });
      } else {
        Admin.addQuestionBlock();
      }

      const formTop = document.getElementById('adminTabCreate');
      if (formTop) {
        formTop.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      App.toast('Error loading quiz for edit: ' + err.message, 'error');
    }
  },

  // ---------------- Bulk Question Import (CSV / PDF) ----------------
  handleCSVUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (ev) {
      try {
        const text = String(ev.target.result);
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length < 2) {
          Admin.setUploadStatus('CSV file has no question rows.', true);
          return;
        }

        const blocks = [];
        for (let i = 1; i < lines.length; i++) {
          const row = Admin.csvSplitLine(lines[i]);
          if (!row[0]) continue;
          const options = [row[1] || '', row[2] || '', row[3] || '', row[4] || ''];
          const ansRaw = (row[5] || 'A').trim().toUpperCase();
          const map = { A: 0, B: 1, C: 2, D: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
          const correct = map[ansRaw] !== undefined ? map[ansRaw] : 0;
          const explanation = row[6] || '';
          blocks.push({ text: row[0], options, correct, explanation });
        }

        if (blocks.length === 0) {
          Admin.setUploadStatus('No questions parsed from CSV.', true);
          return;
        }

        if (Admin.qBuilderState.length === 1 && !Admin.qBuilderState[0].text.trim()) {
          Admin.qBuilderState = [];
        }
        blocks.forEach(b => Admin.addQuestionBlock(b));
        Admin.setUploadStatus(`Imported ${blocks.length} questions from CSV`, false);
      } catch (err) {
        Admin.setUploadStatus('Failed to parse CSV: ' + err.message, true);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  },

  csvSplitLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result.map(s => s.trim());
  },

  setUploadStatus(msg, isErr) {
    const el = document.getElementById('uploadStatus');
    if (el) {
      el.textContent = msg;
      el.style.color = isErr ? 'var(--danger)' : 'var(--success)';
    }
  },

  downloadCSVTemplate() {
    const csv = 'Question,OptionA,OptionB,OptionC,OptionD,Answer,Explanation\n' +
      '"What is the primary function of RAM in a computer?","Permanent storage","Temporary working memory","Power management","Network connectivity","B","RAM provides fast read and write access for active programs."\n' +
      '"Which protocol is used to secure HTTP communication?","FTP","SSH","TLS/SSL","SMTP","C","TLS/SSL encrypts the transport layer for HTTPS."\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quiznest_question_import_template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  async handlePDFUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (typeof pdfjsLib === 'undefined') {
      Admin.setUploadStatus('PDF parsing library is unavailable. Please check your internet connection.', true);
      e.target.value = '';
      return;
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    Admin.setUploadStatus('Reading and analyzing PDF document…', false);

    const reader = new FileReader();
    reader.onload = async function (ev) {
      try {
        const typedArray = new Uint8Array(ev.target.result);
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
        let fullText = '';
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          fullText += content.items.map(it => it.str).join(' ') + ' ';
        }

        const blocks = Admin.parseQuestionsFromText(fullText);
        if (blocks.length === 0) {
          Admin.setUploadStatus('No questions detected in PDF. Ensure questions follow standard Q1. / A) / Answer: format.', true);
        } else {
          if (Admin.qBuilderState.length === 1 && !Admin.qBuilderState[0].text.trim()) {
            Admin.qBuilderState = [];
          }
          blocks.forEach(b => Admin.addQuestionBlock(b));
          Admin.setUploadStatus(`Extracted and loaded ${blocks.length} questions from PDF`, false);
        }
      } catch (err) {
        Admin.setUploadStatus('Could not read PDF: ' + err.message, true);
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  },

  parseQuestionsFromText(text) {
    const results = [];
    const chunks = text.split(/(?=\bQ?\d{1,3}[\.\)]\s)/g);
    chunks.forEach(chunk => {
      chunk = chunk.trim();
      if (!chunk) return;
      const head = chunk.match(/^Q?(\d{1,3})[\.\)]\s*([\s\S]*)/);
      if (!head) return;
      const rest = head[2];
      const aPos = rest.search(/\bA[\.\)]\s/);
      if (aPos === -1) return;
      const qText = rest.slice(0, aPos).trim();
      const optMatch = rest.match(/A[\.\)]\s*([\s\S]*?)\s*B[\.\)]\s*([\s\S]*?)\s*C[\.\)]\s*([\s\S]*?)\s*D[\.\)]\s*([\s\S]*?)(?=\s*Answer\s*[:\-]|$)/i);
      if (!optMatch) return;
      const options = [optMatch[1], optMatch[2], optMatch[3], optMatch[4]].map(s => s.trim());
      if (!qText || options.some(o => !o)) return;

      let correct = 0;
      const ansMatch = rest.match(/Answer\s*[:\-]\s*([A-D1-4])/i);
      if (ansMatch) {
        const map = { A: 0, B: 1, C: 2, D: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
        correct = map[ansMatch[1].toUpperCase()] ?? 0;
      }
      let explanation = '';
      const expMatch = rest.match(/Explanation\s*[:\-]\s*([\s\S]*)/i);
      if (expMatch) explanation = expMatch[1].trim();

      results.push({ text: qText, options, correct, explanation });
    });
    return results;
  },

  downloadSamplePDFFormat() {
    const a = document.createElement('a');
    a.href = '/downloads/quiznest_sample_question_paper.pdf';
    a.download = 'quiznest_sample_question_paper.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (window.App && typeof App.toast === 'function') {
      App.toast('Sample question paper PDF downloaded successfully.', 'ok');
    }
  },

  async downloadQuizPDF(quizId) {
    try {
      const res = await App.api(`/api/admin/quizzes/${quizId}`);
      const quiz = res.quiz;
      if (!quiz) {
        App.toast('Quiz data not found', 'error');
        return;
      }

      const letters = ['A', 'B', 'C', 'D'];

      // Attempt jsPDF if available in browser
      if (window.jspdf && window.jspdf.jsPDF) {
        try {
          const { jsPDF } = window.jspdf;
          const doc = new jsPDF();
          let y = 20;

          // Header
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.text(quiz.title, 14, y);
          y += 8;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.text(
            `Category: ${quiz.category || 'General'}   |   Duration: ${quiz.duration} min   |   Marks/Q: ${quiz.marks}` +
            (quiz.negative ? `   |   Negative Marking: -${Math.round(quiz.negative * 100)}%` : ''),
            14,
            y
          );
          y += 12;
          doc.setFontSize(11);

          (quiz.questions || []).forEach((q, i) => {
            const qLines = doc.splitTextToSize(`${i + 1}. ${q.text}`, 180);
            if (y + qLines.length * 6 > 280) { doc.addPage(); y = 20; }
            doc.setFont('helvetica', 'bold');
            doc.text(qLines, 14, y);
            y += qLines.length * 6 + 2;

            doc.setFont('helvetica', 'normal');
            (q.options || []).forEach((opt, idx) => {
              const optLines = doc.splitTextToSize(`${letters[idx] || (idx + 1)}) ${opt}`, 170);
              if (y + optLines.length * 6 > 285) { doc.addPage(); y = 20; }
              doc.text(optLines, 20, y);
              y += optLines.length * 6;
            });
            y += 5;
          });

          // Answer Key Page
          doc.addPage();
          y = 20;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(14);
          doc.text('Examination Answer Key (Administrator Confidential)', 14, y);
          y += 10;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(11);

          (quiz.questions || []).forEach((q, i) => {
            if (y > 280) { doc.addPage(); y = 20; }
            const correctLetter = letters[q.correct] !== undefined ? letters[q.correct] : `Option ${q.correct + 1}`;
            doc.text(`${i + 1}. ${correctLetter}   ${q.explanation ? '— ' + q.explanation : ''}`, 14, y);
            y += 7;
          });

          const filename = `${(quiz.title || 'Exam').replace(/[^a-zA-Z0-9_-]/g, '_')}_Paper.pdf`;
          doc.save(filename);
          App.toast('PDF paper downloaded successfully!', 'ok');
          return;
        } catch (pdfErr) {
          console.warn('jsPDF generation failed, falling back to printable view:', pdfErr);
        }
      }

      // High-fidelity printable fallback (works 100% in all browsers even without external libraries)
      Admin.printQuizFallback(quiz);
    } catch (err) {
      App.toast('Failed to download PDF: ' + err.message, 'error');
    }
  },

  printQuizFallback(quiz) {
    const letters = ['A', 'B', 'C', 'D'];
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      App.toast('Please allow popups to export printable examination paper.', 'warning');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${App.escapeHtml(quiz.title)} - Examination Paper</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 30px; color: #111; line-height: 1.5; }
          .header { border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; margin: 0 0 6px 0; }
          .meta { font-size: 13px; color: #555; }
          .q-block { margin-bottom: 18px; page-break-inside: avoid; }
          .q-text { font-weight: bold; font-size: 15px; margin-bottom: 6px; }
          .opt { margin-left: 20px; margin-bottom: 4px; font-size: 14px; }
          .page-break { page-break-before: always; margin-top: 40px; padding-top: 20px; border-top: 2px dashed #999; }
          .ans-title { font-size: 18px; font-weight: bold; margin-bottom: 12px; color: #c00; }
          .ans-item { font-size: 14px; margin-bottom: 6px; }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 20px; background: #eef2ff; padding: 12px; border-radius: 6px; border: 1px solid #c7d2fe;">
          <button onclick="window.print()" style="padding: 8px 16px; background: #4f46e5; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Print / Save as PDF</button>
          <span style="margin-left: 12px; font-size: 13px; color: #4338ca;">Tip: Select "Save as PDF" in print destinations to download a PDF file.</span>
        </div>
        <div class="header">
          <div class="title">${App.escapeHtml(quiz.title)}</div>
          <div class="meta">Category: ${App.escapeHtml(quiz.category || 'General')} | Duration: ${quiz.duration} Mins | Marks/Question: ${quiz.marks} ${quiz.negative ? `| Negative Marking: -${Math.round(quiz.negative * 100)}%` : ''}</div>
        </div>
        <div class="questions">
          ${(quiz.questions || []).map((q, i) => `
            <div class="q-block">
              <div class="q-text">${i + 1}. ${App.escapeHtml(q.text)}</div>
              ${(q.options || []).map((opt, idx) => `<div class="opt">${letters[idx] || (idx + 1)}) ${App.escapeHtml(opt)}</div>`).join('')}
            </div>
          `).join('')}
        </div>
        <div class="page-break">
          <div class="ans-title">Confidential Answer Key & Explanations (Administrator Copy)</div>
          ${(quiz.questions || []).map((q, i) => `
            <div class="ans-item">
              <b>Question ${i + 1}:</b> Option ${letters[q.correct] || (q.correct + 1)}
              ${q.explanation ? `<span style="color: #555;">— ${App.escapeHtml(q.explanation)}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  },

  // ---------------- 4. Student Management ----------------
  async loadStudents(silent = false) {
    try {
      const search = (document.getElementById('studentSearchInput') ? document.getElementById('studentSearchInput').value : '').trim();
      const res = await App.api(`/api/admin/students?search=${encodeURIComponent(search)}`);
      Admin.students = res.students || [];

      const tbody = document.getElementById('adminStudentsTbody');
      if (!tbody) return;

      if (Admin.students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty">No student accounts found. Click "Create Student Account" to add one.</div></td></tr>`;
        return;
      }

      tbody.innerHTML = Admin.students.map(s => {
        const isRevealed = Admin.revealedPasswords && Admin.revealedPasswords.has(s.id);
        const passText = isRevealed ? (s.initialPassword || '(not set)') : '••••••••';
        const passStyle = isRevealed ? 'style="font-family:monospace;letter-spacing:1px;font-size:12.5px;color:var(--primary-2);font-weight:700;"' : 'style="font-family:monospace;letter-spacing:1px;font-size:12.5px;"';
        const btnIcon = isRevealed ? App.eyeSvg(true, 14) : App.eyeSvg(false, 14);

        return `
          <tr id="stuRow_${s.id}">
            <td><b>${App.escapeHtml(s.name)}</b></td>
            <td><code>${App.escapeHtml(s.studentId)}</code></td>
            <td id="stuPassTd_${s.id}">
              <span id="stuPass_${s.id}" ${passStyle}>${passText}</span>
              <button type="button" id="stuPassBtn_${s.id}" class="btn ghost sm" style="padding:2px 6px;margin-left:4px;display:inline-flex;align-items:center;" title="${isRevealed ? 'Hide Password' : 'Show Password'}" onclick="Admin.toggleTableStudentPassword('${s.id}', '${App.escapeHtml(s.initialPassword || '')}')">${btnIcon}</button>
            </td>
            <td>${App.escapeHtml(s.email || '-')}</td>
            <td>${App.escapeHtml(s.collegeName || '-')}</td>
            <td>${App.escapeHtml(s.rollNumber || '-')}</td>
            <td><span class="badge ${s.isActive ? 'success' : 'danger'}">${s.isActive ? 'Active' : 'Disabled'}</span></td>
            <td>${s.attemptCount} (${s.avgScore}%)</td>
            <td>
              <div style="display: inline-flex; gap: 4px; align-items: center;">
                <button class="btn secondary sm" style="padding: 3px 8px; font-size: 12px;" onclick="Admin.openEditStudent('${s.id}')">Edit</button>
                <button class="btn ghost sm" style="padding: 3px 8px; font-size: 12px;" onclick="Admin.openResetPassModal('${s.id}', '${App.escapeHtml(s.name)}')">Reset</button>
                <button class="btn secondary sm" style="padding: 3px 8px; font-size: 12px;" onclick="Admin.viewStudentDetails('${s.id}')">View</button>
                <button class="btn ghost sm" style="padding: 3px 8px; font-size: 12px;" onclick="Admin.toggleStudentStatus('${s.id}', ${!s.isActive})" title="${s.isActive ? 'Disable Account' : 'Enable Account'}">${s.isActive ? 'Disable' : 'Enable'}</button>
                <button class="btn danger sm" style="padding: 3px 8px; font-size: 12px;" onclick="Admin.deleteStudent('${s.id}', '${App.escapeHtml(s.name)}')" title="Delete Student">Delete</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      if (!silent) {
        App.toast('Failed to load students: ' + err.message, 'error');
      }
    }
  },

  toggleTableStudentPassword(id, pass) {
    const el = document.getElementById(`stuPass_${id}`);
    const btn = document.getElementById(`stuPassBtn_${id}`);
    if (!el) return;

    if (!Admin.revealedPasswords) Admin.revealedPasswords = new Set();

    if (el.textContent === '••••••••') {
      const currentStu = Admin.students.find(s => s.id === id);
      const activePass = (currentStu && currentStu.initialPassword) || pass || '(not set)';
      el.textContent = activePass;
      el.style.color = 'var(--primary-2)';
      el.style.fontWeight = '700';
      if (btn) {
        btn.innerHTML = App.eyeSvg(true, 14);
        btn.title = 'Hide Password';
      }
      Admin.revealedPasswords.add(id);
    } else {
      el.textContent = '••••••••';
      el.style.color = '';
      el.style.fontWeight = '';
      if (btn) {
        btn.innerHTML = App.eyeSvg(false, 14);
        btn.title = 'Show Password';
      }
      Admin.revealedPasswords.delete(id);
    }
  },

  toggleViewStudentPassword(pass) {
    const el = document.getElementById('viewStuPassVal');
    const btn = document.getElementById('toggleViewPassBtn');
    if (!el || !btn) return;
    if (el.textContent === '••••••••') {
      const currentStu = Admin.students.find(s => s.id === Admin.selectedStudentId);
      const activePass = (currentStu && currentStu.initialPassword) || pass || '(No password record)';
      el.textContent = activePass;
      el.style.color = 'var(--primary-2)';
      btn.innerHTML = `${App.eyeSvg(true, 14)} Hide Password`;
      btn.title = 'Hide Password';
    } else {
      el.textContent = '••••••••';
      el.style.color = '';
      btn.innerHTML = `${App.eyeSvg(false, 14)} Show Password`;
      btn.title = 'Show Password';
    }
  },

  initRealtimeStream() {
    if (Admin._eventSource) return;

    try {
      if (window.EventSource) {
        const es = new EventSource('/api/admin/live-stream');
        Admin._eventSource = es;

        es.addEventListener('student_password_changed', (evt) => {
          try {
            const data = JSON.parse(evt.data);
            Admin.handleRealtimePasswordChange(data);
          } catch (e) {
            console.warn('Real-time event parse error', e);
          }
        });

        es.addEventListener('student_created', (evt) => {
          Admin.loadOverview();
          if (Admin.currentTab === 'students') {
            Admin.loadStudents(true);
          }
          App.toast('New candidate account enrolled.', 'ok');
        });

        es.addEventListener('student_deleted', (evt) => {
          Admin.loadOverview();
          if (Admin.currentTab === 'students') {
            Admin.loadStudents(true);
          }
        });

        es.addEventListener('attempt_submitted', () => {
          Admin.loadOverview();
          if (Admin.currentTab === 'results') Admin.loadResultsView();
          if (Admin.currentTab === 'evaluation') Admin.renderEvaluationTable();
        });

        es.addEventListener('attempt_evaluated', () => {
          Admin.loadOverview();
          if (Admin.currentTab === 'results') Admin.renderResultsTable();
          if (Admin.currentTab === 'evaluation') Admin.renderEvaluationTable();
        });

        es.addEventListener('alert_created', () => {
          Admin.loadOverview();
          if (Admin.currentTab === 'alerts') Admin.loadAlerts();
        });

        es.addEventListener('reset_requested', () => {
          Admin.loadOverview();
          if (Admin.currentTab === 'requests') Admin.loadResetRequests();
        });

        es.onerror = () => {
          // Reconnects automatically
        };
      }
    } catch (err) {
      console.warn('Realtime SSE could not be started:', err);
    }

    // Periodic live background auto-refresh every 5 seconds
    if (!Admin._autoRefreshInterval) {
      Admin._autoRefreshInterval = setInterval(() => {
        if (!document.hidden && App.user && App.user.userType === 'admin') {
          Admin.loadOverview();
          if (Admin.currentTab === 'students') {
            Admin.loadStudents(true);
          }
        }
      }, 5000);
    }
  },

  handleRealtimePasswordChange(data) {
    if (!data) return;

    // Update in local cache
    const stu = Admin.students.find(x => x.id === data.id || x.studentId === data.studentId);
    if (stu) {
      stu.initialPassword = data.newPassword;
    }
    const targetId = (stu && stu.id) || data.id;

    // Automatically reveal the updated password in revealed set so it's directly visible
    if (!Admin.revealedPasswords) Admin.revealedPasswords = new Set();
    Admin.revealedPasswords.add(targetId);

    // Update table elements if currently displayed
    const passSpan = document.getElementById(`stuPass_${targetId}`);
    const passTd = document.getElementById(`stuPassTd_${targetId}`);
    const passBtn = document.getElementById(`stuPassBtn_${targetId}`);

    if (passSpan) {
      passSpan.textContent = data.newPassword;
      passSpan.style.color = 'var(--success)';
      passSpan.style.fontWeight = '700';
      passSpan.style.fontFamily = 'monospace';
      setTimeout(() => {
        if (passSpan) passSpan.style.color = 'var(--primary-2)';
      }, 4000);
      if (passBtn) {
        passBtn.innerHTML = App.eyeSvg(true, 14);
        passBtn.title = 'Hide Password';
        passBtn.setAttribute('onclick', `Admin.toggleTableStudentPassword('${targetId}', '${App.escapeHtml(data.newPassword)}')`);
      }
    }

    if (passTd) {
      passTd.style.transition = 'background 0.3s ease';
      passTd.style.background = 'rgba(16, 185, 129, 0.3)';
      setTimeout(() => {
        if (passTd) passTd.style.background = '';
      }, 4000);
    }

    // Update modal if currently viewing this student
    if (Admin.selectedStudentId === targetId || Admin.selectedStudentId === data.id) {
      const viewVal = document.getElementById('viewStuPassVal');
      const viewBtn = document.getElementById('toggleViewPassBtn');
      if (viewVal) {
        viewVal.textContent = data.newPassword;
        viewVal.style.color = 'var(--success)';
        setTimeout(() => {
          if (viewVal) viewVal.style.color = 'var(--primary-2)';
        }, 4000);
      }
      if (viewBtn) {
        viewBtn.innerHTML = `${App.eyeSvg(true, 14)} Hide Password`;
        viewBtn.title = 'Hide Password';
        viewBtn.setAttribute('onclick', `Admin.toggleViewStudentPassword('${App.escapeHtml(data.newPassword)}')`);
      }
    }

    App.toast(`Real-Time: Student ${data.name || data.studentId} updated password to: "${data.newPassword}"`, 'ok');
  },

  async fetchNextStudentId() {
    try {
      const preview = document.getElementById('csStudentIdPreview');
      if (preview) preview.textContent = 'Generating...';
      const res = await App.api('/api/admin/students/next-id');
      if (res && res.nextStudentId && preview) {
        preview.textContent = res.nextStudentId;
      }
    } catch (err) {
      console.warn('Could not auto-fetch student ID:', err);
    }
  },

  suggestPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let pass = 'Std@';
    for (let i = 0; i < 4; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    pass += '!';
    const passInput = document.getElementById('csPassword');
    if (passInput) {
      passInput.value = pass;
    }
  },

  async openCreateStudentModal() {
    document.getElementById('createStudentForm').reset();
    document.getElementById('createStudentMsg').style.display = 'none';
    App.showModal('createStudentModal');
    await Admin.fetchNextStudentId();
    Admin.suggestPassword();
  },

  async handleCreateStudent(e) {
    e.preventDefault();
    const msgEl = document.getElementById('createStudentMsg');
    msgEl.style.display = 'none';

    const name = document.getElementById('csName').value.trim();
    const initialPassword = document.getElementById('csPassword').value;
    const email = document.getElementById('csEmail').value.trim();
    const phone = document.getElementById('csPhone').value.trim();
    const collegeName = document.getElementById('csCollege').value.trim();
    const rollNumber = document.getElementById('csRoll').value.trim();
    const course = document.getElementById('csCourse').value.trim();
    const year = document.getElementById('csYear').value.trim();

    try {
      // No studentId sent from frontend: server generates it automatically 100% of the time!
      const res = await App.api('/api/admin/students', {
        method: 'POST',
        body: { name, initialPassword, email, phone, collegeName, rollNumber, course, year }
      });

      const assignedId = (res.student && res.student.studentId) || 'Created';
      App.toast(`Student account created! Assigned ID: ${assignedId}`, 'ok');
      App.closeModal('createStudentModal');
      Admin.loadStudents();
    } catch (err) {
      msgEl.textContent = err.message || 'Error creating student account';
      msgEl.className = 'msg error';
      msgEl.style.display = 'block';
    }

    return false;
  },

  openEditStudent(id) {
    const s = Admin.students.find(x => x.id === id);
    if (!s) return;

    Admin.selectedStudentId = id;
    document.getElementById('esName').value = s.name || '';
    document.getElementById('esStudentId').value = s.studentId || '';
    document.getElementById('esEmail').value = s.email || '';
    document.getElementById('esPhone').value = s.phone || '';
    document.getElementById('esCollege').value = s.collegeName || '';
    document.getElementById('esRoll').value = s.rollNumber || '';
    document.getElementById('esCourse').value = s.course || '';
    document.getElementById('esYear').value = s.year || '';
    document.getElementById('esStatus').value = s.isActive ? '1' : '0';

    document.getElementById('editStudentMsg').style.display = 'none';
    App.showModal('editStudentModal');
  },

  async handleEditStudent(e) {
    e.preventDefault();
    const msgEl = document.getElementById('editStudentMsg');
    msgEl.style.display = 'none';

    const name = document.getElementById('esName').value.trim();
    const email = document.getElementById('esEmail').value.trim();
    const phone = document.getElementById('esPhone').value.trim();
    const collegeName = document.getElementById('esCollege').value.trim();
    const rollNumber = document.getElementById('esRoll').value.trim();
    const course = document.getElementById('esCourse').value.trim();
    const year = document.getElementById('esYear').value.trim();
    const isActive = document.getElementById('esStatus').value === '1';

    try {
      await App.api(`/api/admin/students/${Admin.selectedStudentId}`, {
        method: 'PUT',
        body: { name, email, phone, collegeName, rollNumber, course, year, isActive }
      });

      App.toast('Student profile updated.', 'ok');
      App.closeModal('editStudentModal');
      Admin.loadStudents();
    } catch (err) {
      msgEl.textContent = err.message || 'Error updating student';
      msgEl.className = 'msg error';
      msgEl.style.display = 'block';
    }

    return false;
  },

  async toggleStudentStatus(id, newStatus) {
    try {
      await App.api(`/api/admin/students/${id}/status`, {
        method: 'PATCH',
        body: { isActive: newStatus }
      });
      App.toast(`Student account ${newStatus ? 'activated' : 'disabled'}.`, 'ok');
      Admin.loadStudents();
    } catch (err) {
      App.toast('Error toggling student status: ' + err.message, 'error');
    }
  },

  openResetPassModal(id, studentName) {
    Admin.selectedStudentId = id;
    document.getElementById('adminResetName').textContent = studentName;
    document.getElementById('adminNewPassword').value = '';
    document.getElementById('adminResetMsg').style.display = 'none';
    App.showModal('adminResetPassModal');
  },

  async handleAdminResetPassword(e) {
    e.preventDefault();
    const newPassword = document.getElementById('adminNewPassword').value;
    const msgEl = document.getElementById('adminResetMsg');
    msgEl.style.display = 'none';

    try {
      const res = await App.api(`/api/admin/students/${Admin.selectedStudentId}/reset-password`, {
        method: 'POST',
        body: { newPassword }
      });

      App.toast(res.message, 'ok');
      App.closeModal('adminResetPassModal');
    } catch (err) {
      msgEl.textContent = err.message || 'Failed to reset password.';
      msgEl.className = 'msg error';
      msgEl.style.display = 'block';
    }

    return false;
  },

  async viewStudentDetails(id) {
    try {
      Admin.selectedStudentId = id;
      const res = await App.api(`/api/admin/students/${id}`);
      const s = res.student;

      document.getElementById('viewStudentInfo').innerHTML = `
        <div style="display:flex; gap:16px; align-items:center; margin-bottom:16px;">
          ${s.profilePhoto ? `<img src="${s.profilePhoto}" style="width:68px; height:68px; border-radius:50%; object-fit:cover; border:2px solid var(--primary); box-shadow:0 3px 10px rgba(0,0,0,0.15);" />` : `<div style="width:68px; height:68px; border-radius:50%; background:var(--surface-2); border:2px solid var(--border); display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:bold; color:var(--text-dim); text-transform:uppercase;">${App.escapeHtml((s.name || 'S').slice(0, 2))}</div>`}
          <div style="flex:1;">
            <h4 style="margin:0 0 2px;">${App.escapeHtml(s.name)}</h4>
            <p style="margin:0; font-size:13px; color:var(--text-dim);"><b>Student ID:</b> <code>${App.escapeHtml(s.studentId)}</code> | <b>Roll No:</b> ${App.escapeHtml(s.rollNumber || '-')}</p>
            <p style="margin:2px 0 0; font-size:13px; color:var(--text-dim);"><b>Father's Name:</b> ${App.escapeHtml(s.fatherName || '-')} | <b>Mother's Name:</b> ${App.escapeHtml(s.motherName || '-')}</p>
            <p style="margin:2px 0 0; font-size:12.5px; color:var(--text-dim);"><b>Institution:</b> ${App.escapeHtml(s.collegeName || '-')} | <b>Course:</b> ${App.escapeHtml(s.course || '-')} (${App.escapeHtml(s.year || '-')})</p>
          </div>
        </div>

        <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:12px 16px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-dim); letter-spacing:0.04em;">Current Student Password</div>
            <div id="viewStuPassVal" style="font-family:monospace; font-size:15px; font-weight:700; color:var(--primary-2); margin-top:2px;">${App.escapeHtml(s.initialPassword || '(not set)')}</div>
          </div>
          <button type="button" class="btn secondary sm" id="toggleViewPassBtn" style="display:inline-flex;align-items:center;gap:6px;" onclick="Admin.toggleViewStudentPassword('${App.escapeHtml(s.initialPassword || '')}')">${App.eyeSvg(true, 14)} Hide Password</button>
        </div>

        <h5>Exam Attempts History (${res.attempts.length})</h5>
        <div class="table-wrap" style="max-height: 250px; overflow-y:auto; margin-bottom:14px">
          <table>
            <thead><tr><th>Exam</th><th>Score</th><th>Percent</th><th>Switches</th><th>Date</th></tr></thead>
            <tbody>
              ${res.attempts.length === 0 ? '<tr><td colspan="5">No attempts taken.</td></tr>' : res.attempts.map(a => `
                <tr>
                  <td>${App.escapeHtml(a.quizTitle)}</td>
                  <td>${a.score}/${a.maxScore}</td>
                  <td><b>${a.percentage}%</b></td>
                  <td>${a.flagged ? `<span class="badge danger">Flagged (${a.switches})</span>` : a.switches}</td>
                  <td>${new Date(a.date).toLocaleDateString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      App.showModal('viewStudentModal');
    } catch (err) {
      App.toast('Failed to load student details: ' + err.message, 'error');
    }
  },

  async deleteStudent(id, studentName) {
    if (!confirm(`Are you sure you want to delete student "${studentName}"? This cannot be undone.`)) return;
    try {
      await App.api(`/api/admin/students/${id}`, { method: 'DELETE' });
      App.toast(`Student ${studentName} was removed.`, 'ok');
      Admin.loadStudents();
    } catch (err) {
      App.toast('Error deleting student: ' + err.message, 'error');
    }
  },

  // ---------------- 5. Password Reset Requests ----------------
  async loadResetRequests() {
    try {
      const res = await App.api('/api/admin/reset-requests');
      const tbody = document.getElementById('adminRequestsTbody');
      if (!tbody) return;

      const list = res.requests || [];
      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty">No pending password reset requests.</div></td></tr>`;
        return;
      }

      tbody.innerHTML = list.map(r => `
        <tr>
          <td><b>${App.escapeHtml(r.studentName)}</b></td>
          <td><code>${App.escapeHtml(r.studentCode)}</code></td>
          <td>${App.escapeHtml(r.email || '-')}</td>
          <td>${App.escapeHtml(r.reason || '-')}</td>
          <td>${new Date(r.createdAt).toLocaleString()}</td>
          <td><span class="badge ${r.status === 'pending' ? 'warning' : (r.status === 'approved' ? 'success' : 'danger')}">${r.status.toUpperCase()}</span></td>
          <td>
            ${r.status === 'pending' ? `
              <button class="btn success sm" onclick="Admin.openApproveResetModal('${r.id}', '${App.escapeHtml(r.studentName)}')">Approve</button>
              <button class="btn danger sm" onclick="Admin.rejectResetRequest('${r.id}')">Reject</button>
            ` : `<small style="color:var(--text-dim)">Resolved</small>`}
          </td>
        </tr>
      `).join('');
    } catch (err) {
      App.toast('Failed to load reset requests: ' + err.message, 'error');
    }
  },

  openApproveResetModal(reqId, studentName) {
    Admin.selectedRequestId = reqId;
    document.getElementById('approveResetStudentName').textContent = studentName;
    document.getElementById('approveNewPassword').value = '';
    document.getElementById('approveResetMsg').style.display = 'none';
    App.showModal('approveResetModal');
  },

  async handleApproveReset(e) {
    e.preventDefault();
    const newPassword = document.getElementById('approveNewPassword').value;
    const msgEl = document.getElementById('approveResetMsg');
    msgEl.style.display = 'none';

    try {
      const res = await App.api(`/api/admin/reset-requests/${Admin.selectedRequestId}/approve`, {
        method: 'POST',
        body: { newPassword }
      });

      App.toast(res.message, 'ok');
      App.closeModal('approveResetModal');
      Admin.loadResetRequests();
      Admin.loadOverview();
    } catch (err) {
      msgEl.textContent = err.message || 'Error approving request';
      msgEl.className = 'msg error';
      msgEl.style.display = 'block';
    }

    return false;
  },

  async rejectResetRequest(reqId) {
    if (!confirm('Reject this password reset request?')) return;
    try {
      await App.api(`/api/admin/reset-requests/${reqId}/reject`, { method: 'POST' });
      App.toast('Reset request rejected.', 'ok');
      Admin.loadResetRequests();
      Admin.loadOverview();
    } catch (err) {
      App.toast('Error rejecting request: ' + err.message, 'error');
    }
  },

  // ---------------- 6. Written & Subjective Answer Evaluation ----------------
  async loadEvaluationView() {
    const sel = document.getElementById('evalQuizSelect');
    if (!sel) return;

    if (!Admin.quizzes || Admin.quizzes.length === 0) {
      await Admin.loadQuizzes();
    }

    const currentVal = sel.value;
    sel.innerHTML = `<option value="all">All Examinations</option>` +
      Admin.quizzes.map(q => `<option value="${q.id}">${App.escapeHtml(q.title)}</option>`).join('');

    if (currentVal && (currentVal === 'all' || Admin.quizzes.some(q => q.id === currentVal))) {
      sel.value = currentVal;
    } else {
      sel.value = 'all';
    }

    await Admin.renderEvaluationTable();
  },

  async renderEvaluationTable() {
    const tbody = document.getElementById('adminEvaluationTbody');
    if (!tbody) return;

    const quizId = document.getElementById('evalQuizSelect')?.value || 'all';
    const status = document.getElementById('evalStatusSelect')?.value || 'all';
    const search = document.getElementById('evalSearchInput')?.value?.trim() || '';

    let url = `/api/admin/evaluations?quizId=${encodeURIComponent(quizId)}&status=${encodeURIComponent(status)}`;
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }

    try {
      const res = await App.api(url);
      Admin.activeEvaluations = res.evaluations || [];
      const stats = res.stats || { total: 0, pending: 0, evaluated: 0 };

      // Update KPI cards
      const pendingEl = document.getElementById('evalStatPending');
      if (pendingEl) pendingEl.textContent = stats.pending;
      const evaluatedEl = document.getElementById('evalStatEvaluated');
      if (evaluatedEl) evaluatedEl.textContent = stats.evaluated;
      const totalEl = document.getElementById('evalStatTotal');
      if (totalEl) totalEl.textContent = stats.total;

      // Update nav badge and overview stat
      const badge = document.getElementById('evalPendingBadge');
      if (badge) {
        badge.textContent = stats.pending;
        badge.classList.toggle('hidden', stats.pending === 0);
      }
      const statEval = document.getElementById('statEvaluationsPending');
      if (statEval) statEval.textContent = stats.pending;

      if (Admin.activeEvaluations.length === 0) {
        const msg = status === 'pending'
          ? 'No pending written answers waiting for checking.'
          : 'No written or subjective submissions found.';
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty">${msg}</div></td></tr>`;
        return;
      }

      tbody.innerHTML = Admin.activeEvaluations.map(r => {
        const isPending = r.needsManualEvaluation || r.evaluationStatus === 'pending' || r.evaluationStatus === 'pending_review';
        const statusBadge = isPending
          ? '<span class="badge warning">Pending Review</span>'
          : '<span class="badge success">Evaluated</span>';

        const copyBadge = r.hasAttachment
          ? `<span class="badge primary sm" title="Handwritten sheet uploaded"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:2px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line></svg>Copy Attached (${r.attachmentCount})</span>`
          : '<span style="color:var(--text-dim);font-size:12px;">Typed Only</span>';

        const actionBtn = isPending
          ? `<button class="btn sm primary" onclick="Admin.openEvaluationModal('${r.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin-right:3px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>Check / Grade</button>`
          : `<button class="btn sm secondary" onclick="Admin.openEvaluationModal('${r.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin-right:3px"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>Re-Evaluate</button>`;

        return `
          <tr>
            <td><b>${App.escapeHtml(r.studentName)}</b> (<code>${App.escapeHtml(r.studentCode)}</code>)<br><small style="color:var(--text-dim)">${App.escapeHtml(r.studentCourse)} | Roll: ${App.escapeHtml(r.studentRoll)}</small></td>
            <td><b>${App.escapeHtml(r.quizTitle)}</b></td>
            <td><span class="badge sm">${r.writtenCount || 1} Written Question${r.writtenCount > 1 ? 's' : ''}</span></td>
            <td>${copyBadge}</td>
            <td><b>${r.score}</b> / ${r.maxScore} (${r.percentage}%)</td>
            <td>${statusBadge}</td>
            <td>${new Date(r.submittedAt).toLocaleString()}</td>
            <td>${actionBtn}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      App.toast('Failed to load evaluations: ' + err.message, 'error');
    }
  },

  filterEvaluationTable() {
    clearTimeout(Admin._evalFilterTimer);
    Admin._evalFilterTimer = setTimeout(() => {
      Admin.renderEvaluationTable();
    }, 250);
  },

  // ---------------- 7. Results & Leaderboard ----------------
  async loadResultsView() {
    const sel = document.getElementById('resultsQuizSelect');
    if (!sel) return;

    if (Admin.quizzes.length === 0) {
      await Admin.loadQuizzes();
    }

    sel.innerHTML = Admin.quizzes.map(q => `<option value="${q.id}">${App.escapeHtml(q.title)}</option>`).join('');
    if (Admin.quizzes.length > 0) {
      sel.value = Admin.quizzes[0].id;
      Admin.renderResultsTable();
    }
  },

  async renderResultsTable() {
    const quizId = document.getElementById('resultsQuizSelect')?.value;
    if (!quizId) return;

    const tbody = document.getElementById('adminResultsTbody');
    if (!tbody) return;

    try {
      const res = await App.api(`/api/admin/quizzes/${quizId}/results`);
      Admin.activeResults = res.results || [];

      // Highlight elements
      const fastestEl = document.getElementById('leadFastestStudent');
      const fastestTimeEl = document.getElementById('leadFastestTime');
      const fastestDetailEl = document.getElementById('leadFastestDetail');
      const topStudentEl = document.getElementById('leadTopStudent');
      const topScoreEl = document.getElementById('leadTopScore');
      const totalAttemptsEl = document.getElementById('leadTotalAttempts');
      const avgTimeEl = document.getElementById('leadAvgTime');

      if (Admin.activeResults.length === 0) {
        if (fastestEl) fastestEl.textContent = '-';
        if (fastestTimeEl) fastestTimeEl.textContent = '-';
        if (fastestDetailEl) fastestDetailEl.textContent = 'No submissions recorded';
        if (topStudentEl) topStudentEl.textContent = '-';
        if (topScoreEl) topScoreEl.textContent = '-';
        if (totalAttemptsEl) totalAttemptsEl.textContent = '0';
        if (avgTimeEl) avgTimeEl.textContent = '-';
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty">No student attempts recorded for this exam yet.</div></td></tr>`;
        return;
      }

      // 1. Identify Fastest Solver (candidate with shortest valid completion duration)
      const validTimes = Admin.activeResults.filter(r => (r.timeTaken || 0) > 0);
      const fastest = validTimes.length > 0
        ? validTimes.reduce((min, cur) => cur.timeTaken < min.timeTaken ? cur : min, validTimes[0])
        : Admin.activeResults[0];

      // 2. Identify Top Ranker (#1)
      const topRanker = Admin.activeResults[0];

      // 3. Compute Average Time Taken
      const avgSec = Math.round(Admin.activeResults.reduce((acc, cur) => acc + (cur.timeTaken || 0), 0) / Admin.activeResults.length);
      const avgM = Math.floor(avgSec / 60), avgS = avgSec % 60;

      if (fastest && fastestEl) {
        const fm = Math.floor(fastest.timeTaken / 60), fs = fastest.timeTaken % 60;
        fastestEl.textContent = `${fastest.studentName} (${fastest.studentCode})`;
        fastestTimeEl.textContent = `${fm}m ${String(fs).padStart(2, '0')}s`;
        fastestDetailEl.textContent = `Score: ${fastest.score}/${fastest.maxScore} (${fastest.percentage}%)`;
      }

      if (topRanker && topStudentEl) {
        topStudentEl.textContent = `${topRanker.studentName} (${topRanker.studentCode})`;
        topScoreEl.textContent = `${topRanker.score}/${topRanker.maxScore} (${topRanker.percentage}%)`;
      }

      if (totalAttemptsEl) totalAttemptsEl.textContent = String(Admin.activeResults.length);
      if (avgTimeEl) avgTimeEl.textContent = `${avgM}m ${String(avgS).padStart(2, '0')}s`;

      tbody.innerHTML = Admin.activeResults.map(r => {
        const m = Math.floor(r.timeTaken / 60), s = r.timeTaken % 60;
        const rankCls = r.rank === 1 ? 'rank1' : r.rank === 2 ? 'rank2' : r.rank === 3 ? 'rank3' : '';
        const switchCell = r.flaggedForCheating
          ? `<span class="badge danger">Flagged (${r.tabSwitches})</span>`
          : (r.tabSwitches > 0 ? `<span class="badge warning">${r.tabSwitches}</span>` : '0');

        const isFastest = fastest && r.id === fastest.id;
        const speedBadge = isFastest
          ? `<span class="badge success sm" style="font-weight:700;margin-left:6px;" title="Fastest Submission in Examination"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin-right:2px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>Fastest</span>`
          : '';

        let evalBadge = '<span class="badge">Auto-Graded</span>';
        if (r.needsManualEvaluation) {
          evalBadge = (r.evaluationStatus === 'evaluated')
            ? '<span class="badge success">Evaluated</span>'
            : '<span class="badge warning">Pending Eval</span>';
        }

        const canReview = r.needsManualEvaluation || r.evaluationStatus === 'evaluated' || r.evaluationStatus === 'pending' || r.evaluationStatus === 'pending_review';
        const actionBtn = canReview
          ? `<button class="btn sm secondary" onclick="Admin.openEvaluationModal('${r.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:2px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>${r.evaluationStatus === 'evaluated' ? 'Review Copy' : 'Check Copy'}</button>`
          : '<span style="color:var(--text-dim);font-size:12px;">Auto-Graded</span>';

        return `
          <tr>
            <td class="${rankCls}"><b>#${r.rank}</b></td>
            <td><b>${App.escapeHtml(r.studentName)}</b> (<code>${App.escapeHtml(r.studentCode)}</code>)</td>
            <td>${App.escapeHtml(r.course || 'General')}<br><small style="color:var(--text-dim)">${App.escapeHtml(r.rollNumber || '-')}</small></td>
            <td><b>${r.score}</b> / ${r.maxScore}</td>
            <td><b>${r.percentage}%</b></td>
            <td>
              <div style="display:flex;align-items:center;gap:4px;">
                <span>${m}m ${String(s).padStart(2, '0')}s</span>
                ${speedBadge}
              </div>
            </td>
            <td>${switchCell}</td>
            <td>${new Date(r.date).toLocaleString()}</td>
            <td>${evalBadge}</td>
            <td>${actionBtn}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      App.toast('Failed to load exam results: ' + err.message, 'error');
    }
  },

  exportResultsCSV() {
    const quizId = document.getElementById('resultsQuizSelect')?.value;
    if (!quizId) {
      App.toast('Select an examination first.', 'error');
      return;
    }
    // Direct browser streaming download from RFC-4180 endpoint with UTF-8 BOM
    window.location.href = `/api/admin/quizzes/${quizId}/export-csv`;
    App.toast('Downloading Excel-compatible results CSV…', 'ok');
  },

  exportCSV() {
    Admin.exportResultsCSV();
  },

  // ---------------- Manual Evaluation Portal ----------------
  async openEvaluationModal(attemptId) {
    try {
      Admin.currentEvaluationAttemptId = attemptId;
      App.toast('Loading candidate answer sheet...', 'info');
      const res = await App.api(`/api/admin/attempts/${attemptId}/evaluation`);
      const att = res.attempt;
      const answers = res.answers || [];
      Admin.currentEvaluationAnswers = answers;

      const subEl = document.getElementById('evalModalSub');
      if (subEl) {
        subEl.textContent = `Candidate: ${att.studentName} (${att.studentCode}) | Exam: ${att.quizTitle} | Score: ${att.score}/${att.maxScore} (${att.percentage}%)`;
      }

      const body = document.getElementById('evalModalBody');
      if (!body) return;

      if (answers.length === 0) {
        body.innerHTML = '<div class="empty">No questions or answers found for this attempt.</div>';
      } else {
        body.innerHTML = answers.map((ans, idx) => {
          const isWritten = ans.qType === 'written' || ans.qType === 'subjective';
          const maxMarks = (ans.maxMarks !== null && ans.maxMarks !== undefined && ans.maxMarks > 0) ? ans.maxMarks : 5;
          const key = ans.answerId || ans.questionId;
          const awardedVal = (ans.marksAwarded !== null && ans.marksAwarded !== undefined) ? ans.marksAwarded : 0;

          return `
            <div class="card" style="margin-bottom: 16px; border: 1px solid var(--border); padding: 16px; background: var(--surface);">
              <div class="flex-between" style="margin-bottom: 8px;">
                <span class="badge ${isWritten ? 'primary' : ''}">${isWritten ? 'Written Question' : 'MCQ Question'} ${idx + 1}</span>
                <span><b>Max Marks: ${maxMarks}</b></span>
              </div>
              <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px; line-height: 1.5;" class="math-content">
                ${App.escapeHtml(ans.questionText)}
              </div>
              ${ans.imageUrl ? `
                <div style="margin-bottom: 12px;">
                  <img src="${ans.imageUrl}" alt="Question diagram" style="max-height: 180px; max-width: 100%; border-radius: 6px; border: 1px solid var(--border);" />
                </div>
              ` : ''}

              ${isWritten ? `
                <div style="background: var(--surface-2); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                  <div style="font-size: 12px; font-weight: 700; color: var(--accent); margin-bottom: 6px; text-transform: uppercase;">Candidate Written Submission:</div>
                  ${ans.writtenText ? `
                    <div style="white-space: pre-wrap; font-family: inherit; font-size: 13.5px; line-height: 1.6; margin-bottom: 10px;" class="math-content">
                      ${App.escapeHtml(ans.writtenText)}
                    </div>
                  ` : '<div style="font-size: 13px; color: var(--text-dim); margin-bottom: 8px;">(No online typed answer provided)</div>'}

                  ${ans.attachmentUrl ? `
                    <div style="margin-top: 10px; border-top: 1px dashed var(--border); padding-top: 10px;">
                      <div style="font-size: 12px; font-weight: 700; color: var(--accent); margin-bottom: 6px;">Handwritten Sheet / Copy Upload:</div>
                      ${ans.attachmentUrl.startsWith('data:image/') || ans.attachmentUrl.match(/\.(png|jpe?g|webp|gif)$/i) ? `
                        <div>
                          <a href="${ans.attachmentUrl}" target="_blank" title="Click to view full image in new tab">
                            <img src="${ans.attachmentUrl}" alt="Uploaded handwritten copy" style="max-height: 260px; max-width: 100%; border-radius: 6px; border: 1px solid var(--border); cursor: pointer;" />
                          </a>
                          <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">Click image to open in new tab</div>
                        </div>
                      ` : `
                        <a href="${ans.attachmentUrl}" target="_blank" class="btn secondary sm" download="handwritten_copy_${key}">View / Download Uploaded Copy</a>
                      `}
                    </div>
                  ` : '<div style="font-size: 13px; color: var(--text-dim);">(No handwritten copy attached)</div>'}
                </div>

                ${ans.explanation ? `
                  <div style="margin-bottom: 12px; font-size: 12.5px; color: var(--text-dim);">
                    <b>Model Answer / Rubric:</b> ${App.escapeHtml(ans.explanation)}
                  </div>
                ` : ''}

                <div class="grid-2" style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px; padding: 12px;">
                  <div class="field" style="margin: 0;">
                    <label style="font-size: 12.5px; font-weight: 600;">Marks Awarded (out of ${maxMarks}):</label>
                    <input type="number" step="0.5" min="0" max="${maxMarks}" id="eval_marks_${key}" value="${awardedVal}">
                  </div>
                  <div class="field" style="margin: 0;">
                    <label style="font-size: 12.5px; font-weight: 600;">Examiner Remarks &amp; Feedback:</label>
                    <input type="text" id="eval_fb_${key}" placeholder="e.g. Good steps, clear explanation" value="${App.escapeHtml(ans.feedback || '')}">
                  </div>
                </div>
              ` : `
                <div style="font-size: 13px; color: var(--text-dim);">
                  Auto-Graded MCQ | Marks: <b>${ans.marksAwarded !== null && ans.marksAwarded !== undefined ? ans.marksAwarded : 0} / ${maxMarks}</b> (${ans.isCorrect ? '<span style="color:var(--success)">Correct</span>' : '<span style="color:var(--danger)">Incorrect</span>'})
                </div>
              `}
            </div>
          `;
        }).join('');
      }

      App.showModal('evaluationModal');
      App.renderMath(body);
    } catch (err) {
      App.toast('Failed to load evaluation details: ' + err.message, 'error');
    }
  },

  async submitEvaluation() {
    if (!Admin.currentEvaluationAttemptId || !Admin.currentEvaluationAnswers) return;

    const evaluations = [];
    for (const ans of Admin.currentEvaluationAnswers) {
      const isWritten = ans.qType === 'written' || ans.qType === 'subjective';
      if (isWritten) {
        const key = ans.answerId || ans.questionId;
        const marksInput = document.getElementById(`eval_marks_${key}`);
        const fbInput = document.getElementById(`eval_fb_${key}`);
        const marksAwarded = marksInput ? parseFloat(marksInput.value) || 0 : 0;
        const feedback = fbInput ? fbInput.value.trim() : '';
        evaluations.push({
          answerId: ans.answerId || null,
          questionId: ans.questionId,
          marksAwarded,
          feedback
        });
      }
    }

    const saveBtn = document.getElementById('saveEvaluationBtn');
    try {
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      const res = await App.api(`/api/admin/attempts/${Admin.currentEvaluationAttemptId}/evaluate`, {
        method: 'POST',
        body: { evaluations }
      });

      App.toast('Evaluation finalized and saved successfully! Total score updated.', 'ok');
      App.closeModal('evaluationModal');
      if (Admin.currentTab === 'evaluation') {
        Admin.renderEvaluationTable();
      }
      if (Admin.currentTab === 'results') {
        Admin.renderResultsTable();
      }
      Admin.loadOverview();
    } catch (err) {
      App.toast('Failed to save evaluation: ' + err.message, 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & Finalize Evaluation';
      }
    }
  },

  viewEvidenceSnapshot(snapshotUrl) {
    const img = document.getElementById('snapshotModalImg');
    if (img) img.src = snapshotUrl;
    App.showModal('snapshotModal');
  },

  // ---------------- 7. Cheating & Security Alerts ----------------
  async loadAlerts() {
    try {
      const res = await App.api('/api/admin/alerts');
      const tbody = document.getElementById('adminAlertsTbody');
      if (!tbody) return;

      const alerts = res.alerts || [];
      if (alerts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty">No suspicious activity detected.</div></td></tr>`;
        return;
      }

      tbody.innerHTML = alerts.map(a => {
        const evidenceBtn = a.snapshotUrl
          ? `<button class="btn secondary sm" onclick="Admin.viewEvidenceSnapshot('${App.escapeHtml(a.snapshotUrl)}')">View Photo</button>`
          : `<span style="color:var(--text-dim);font-size:12px;">None</span>`;

        const examBadge = a.isBlocked
          ? `<span class="badge danger" title="Student attempt is currently blocked">Exam Locked</span>`
          : `<span class="badge success" title="Student attempt is active">Exam Active</span>`;

        const incidentBadge = a.resolved
          ? `<span class="badge secondary" title="Alert marked as resolved">Resolved</span>`
          : `<span class="badge warning" title="Alert needs invigilator review">Pending</span>`;

        return `
          <tr>
            <td><b>${App.escapeHtml(a.studentName)}</b> (<code>${App.escapeHtml(a.studentCode)}</code>)</td>
            <td>${App.escapeHtml(a.quizTitle)}</td>
            <td>${App.escapeHtml(a.eventType || 'Proctoring Alert')}</td>
            <td><b>${a.count}</b> event${a.count !== 1 ? 's' : ''}</td>
            <td>${evidenceBtn}</td>
            <td>${new Date(a.firstTime).toLocaleTimeString()}</td>
            <td>${new Date(a.lastTime).toLocaleTimeString()}</td>
            <td>
              <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;">
                ${examBadge}
                ${incidentBadge}
              </div>
            </td>
            <td>
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${a.isBlocked ? `
                  <button class="btn success sm" onclick="Admin.unblockAlert('${a.id}')" title="Unblock student so they can resume exam">
                    Unblock Student
                  </button>
                ` : `
                  <button class="btn danger sm" onclick="Admin.blockAlert('${a.id}')" title="Lock student exam">
                    Lock / Block Exam
                  </button>
                `}
                <button class="btn secondary sm" onclick="Admin.toggleAlertResolved('${a.id}', ${!a.resolved})" title="${a.resolved ? 'Re-open this incident' : 'Mark incident resolved'}">
                  ${a.resolved ? 'Re-open Incident' : 'Mark Resolved'}
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      App.toast('Failed to load alerts: ' + err.message, 'error');
    }
  },

  async toggleAlertResolved(id, targetResolved) {
    try {
      const res = await App.api(`/api/admin/alerts/${id}/resolve`, {
        method: 'PATCH',
        body: { resolved: targetResolved }
      });
      App.toast(res.message || 'Alert updated.', 'ok');
      Admin.loadAlerts();
      Admin.loadOverview();
    } catch (err) {
      App.toast('Error updating alert: ' + err.message, 'error');
    }
  },

  async resolveAlert(id) {
    await Admin.toggleAlertResolved(id, true);
  },

  async unblockAlert(id) {
    try {
      await App.api(`/api/admin/alerts/${id}/unblock`, { method: 'PATCH' });
      App.toast('Student unblocked successfully. Exam can resume.', 'ok');
      Admin.loadAlerts();
      Admin.loadOverview();
    } catch (err) {
      App.toast('Error unblocking student: ' + err.message, 'error');
    }
  },

  async blockAlert(id) {
    try {
      await App.api(`/api/admin/alerts/${id}/block`, { method: 'PATCH' });
      App.toast('Student exam locked/blocked.', 'warning');
      Admin.loadAlerts();
      Admin.loadOverview();
    } catch (err) {
      App.toast('Error locking student: ' + err.message, 'error');
    }
  },

  // ---------------- 8. Reports & Analytics ----------------
  async loadReports() {
    try {
      const res = await App.api('/api/admin/reports');

      // Score Bands
      const sb = res.scoreBands;
      document.getElementById('rbExcellent').textContent = sb.excellent;
      document.getElementById('rbGood').textContent = sb.good;
      document.getElementById('rbAverage').textContent = sb.average;
      document.getElementById('rbNeedsImprovement').textContent = sb.needsImprovement;

      // Quiz Performance Table
      const qTbody = document.querySelector('#reportQuizPerformanceTable tbody');
      if (qTbody) {
        qTbody.innerHTML = res.quizStats.map(qs => `
          <tr>
            <td><b>${App.escapeHtml(qs.title)}</b></td>
            <td>${App.escapeHtml(qs.category)}</td>
            <td>${qs.attemptsCount}</td>
            <td><b>${qs.avgPercentage}%</b></td>
            <td>${qs.passRate}%</td>
            <td>${qs.topScore} / ${qs.maxMarks}</td>
          </tr>
        `).join('');
      }

      // Top Performers Table
      const pTbody = document.querySelector('#reportTopPerformersTable tbody');
      if (pTbody) {
        pTbody.innerHTML = res.topPerformers.map((p, idx) => `
          <tr>
            <td>#${idx + 1}</td>
            <td><b>${App.escapeHtml(p.student_name)}</b> (${App.escapeHtml(p.student_code)})</td>
            <td>${p.attempts_count}</td>
            <td><b>${p.avg_score}%</b></td>
            <td>${p.best_score}</td>
          </tr>
        `).join('');
      }
    } catch (err) {
      App.toast('Failed to load reports: ' + err.message, 'error');
    }
  },

  // ---------------- 9. Settings ----------------
  async loadSettings() {
    Admin.loadColleges();
    Admin.loadAdmins();
    Admin.loadAuditLogs();
  },

  async loadColleges() {
    try {
      const res = await App.api('/api/admin/colleges');
      const listEl = document.getElementById('settingsCollegesList');
      if (listEl) {
        if (!res.colleges || res.colleges.length === 0) {
          listEl.innerHTML = '<div style="color: var(--text-dim); font-size: 13px; padding: 8px 0;">No institutions configured yet.</div>';
        } else {
          listEl.innerHTML = res.colleges.map(c => `
            <div class="flex-between" style="padding: 12px 16px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 8px;">
              <div>
                <b>${App.escapeHtml(c.name)}</b>
                ${c.domain ? `<span class="badge" style="font-size: 11px; margin-left: 8px;">Domain: @${App.escapeHtml(c.domain)}</span>` : ''}
              </div>
              <button class="btn danger sm" onclick="Admin.removeCollege('${c.id}')">Remove</button>
            </div>
          `).join('');
        }
      }

      // Populate college suggestions datalist for admin/faculty registration
      const datalist = document.getElementById('adminCollegeSuggestions');
      if (datalist && res.colleges) {
        datalist.innerHTML = res.colleges.map(c => `<option value="${App.escapeHtml(c.name)}">`).join('');
      }
    } catch (err) {
      App.toast('Error loading colleges: ' + err.message, 'error');
    }
  },

  async addCollege() {
    const name = document.getElementById('newCollegeName').value.trim();
    const domain = document.getElementById('newCollegeDomain').value.trim();

    if (!name) {
      App.toast('Please specify a college name.', 'error');
      return;
    }

    try {
      await App.api('/api/admin/colleges', {
        method: 'POST',
        body: { name, domain }
      });
      document.getElementById('newCollegeName').value = '';
      document.getElementById('newCollegeDomain').value = '';
      App.toast('College added successfully.', 'ok');
      Admin.loadColleges();
    } catch (err) {
      App.toast(err.message || 'Error adding college', 'error');
    }
  },

  async removeCollege(id) {
    if (!confirm('Remove this institution from the database?')) return;
    try {
      await App.api(`/api/admin/colleges/${id}`, { method: 'DELETE' });
      App.toast('College removed.', 'ok');
      Admin.loadColleges();
    } catch (err) {
      App.toast(err.message || 'Failed to remove college', 'error');
    }
  },

  async loadAdmins() {
    try {
      const res = await App.api('/api/admin/admins');
      const listEl = document.getElementById('settingsAdminsList');
      if (!listEl) return;

      if (!res.admins || res.admins.length === 0) {
        listEl.innerHTML = '<div style="color: var(--text-dim); font-size: 13px; padding: 8px 0;">No administrators found.</div>';
        return;
      }

      listEl.innerHTML = res.admins.map(a => {
        const isCurrent = a.id === App.user?.id;
        const canRemove = res.admins.length > 1 && !isCurrent;
        return `
          <div style="background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); display: flex; flex-direction: column; gap: 10px;">
            <div class="flex-between" style="flex-wrap: wrap; gap: 8px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(59,130,246,0.12); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold;">
                  ${App.escapeHtml((a.name || 'FA').slice(0, 2).toUpperCase())}
                </div>
                <div>
                  <div style="font-weight: 700; font-size: 15px; color: var(--text);">
                    ${App.escapeHtml(a.name)}
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-dim); margin-top: 2px; flex-wrap: wrap;">
                    <span class="badge" style="font-size: 11px;">@${App.escapeHtml(a.username)}</span>
                    ${a.employeeId ? `<span class="badge info" style="font-size: 11px;">ID: ${App.escapeHtml(a.employeeId)}</span>` : ''}
                    ${a.qualification ? `<span class="badge" style="font-size: 11px; background: rgba(16,185,129,0.1); color: var(--success); border-color: rgba(16,185,129,0.3);">${App.escapeHtml(a.qualification)}</span>` : ''}
                  </div>
                </div>
              </div>
              <div>
                ${canRemove ? `
                  <button class="btn danger sm" onclick="Admin.removeAdmin('${a.id}', '${App.escapeHtml(a.name)}')">Remove</button>
                ` : `<span class="badge success" style="font-size: 11px;">${isCurrent ? 'Current Session' : 'Primary Admin'}</span>`}
              </div>
            </div>

            <!-- Faculty Details Row -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; font-size: 12.5px;">
              ${a.designation || a.department ? `
                <div style="color: var(--text); display: flex; align-items: center; gap: 6px;">
                  <span style="color: var(--text-dim);">Designation &amp; Dept:</span>
                  <b>${App.escapeHtml([a.designation, a.department].filter(Boolean).join(' • '))}</b>
                </div>
              ` : ''}
              ${a.collegeName ? `
                <div style="color: var(--text); display: flex; align-items: center; gap: 6px;">
                  <span style="color: var(--text-dim);">College / Inst:</span>
                  <span>${App.escapeHtml(a.collegeName)}</span>
                </div>
              ` : ''}
              ${a.email ? `
                <div style="color: var(--text); display: flex; align-items: center; gap: 6px;">
                  <span style="color: var(--text-dim);">Email:</span>
                  <span><a href="mailto:${App.escapeHtml(a.email)}" style="color: var(--primary); text-decoration: none;">${App.escapeHtml(a.email)}</a></span>
                </div>
              ` : ''}
              ${a.phone ? `
                <div style="color: var(--text); display: flex; align-items: center; gap: 6px;">
                  <span style="color: var(--text-dim);">Phone:</span>
                  <span>${App.escapeHtml(a.phone)}</span>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      App.toast('Error loading administrators: ' + err.message, 'error');
    }
  },

  toggleInlineAddAdmin(forceOpen) {
    const box = document.getElementById('inlineAddAdminBox');
    const btn = document.getElementById('btnToggleAddAdmin');
    if (!box) return;
    const isVisible = box.style.display !== 'none';
    const show = forceOpen !== undefined ? forceOpen : !isVisible;
    box.style.display = show ? 'block' : 'none';
    if (btn) btn.textContent = show ? 'Cancel' : '+ Add Administrator';
    if (show) {
      const form = document.getElementById('inlineAddAdminForm');
      if (form) form.reset();
      const msgEl = document.getElementById('inlineAddAdminMsg');
      if (msgEl) msgEl.style.display = 'none';
      setTimeout(() => {
        const nInput = document.getElementById('inlineAdminName');
        if (nInput) nInput.focus();
      }, 60);
    }
  },

  suggestFacultyPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let pass = 'Fac@';
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const p = document.getElementById('inlineAdminPassword');
    if (p) {
      p.value = pass;
      p.type = 'text';
    }
    App.toast('Generated suggested password: ' + pass, 'info');
  },

  openAddAdminModal() {
    Admin.setTab('settings');
    Admin.toggleInlineAddAdmin(true);
    const box = document.getElementById('inlineAddAdminBox');
    if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  async handleInlineAddAdmin(e) {
    e.preventDefault();
    const name = (document.getElementById('inlineAdminName')?.value || '').trim();
    const employeeId = (document.getElementById('inlineAdminEmployeeId')?.value || '').trim();
    const designation = (document.getElementById('inlineAdminDesignation')?.value || '').trim();
    const department = (document.getElementById('inlineAdminDepartment')?.value || '').trim();
    const collegeName = (document.getElementById('inlineAdminCollege')?.value || '').trim();
    const qualification = (document.getElementById('inlineAdminQualification')?.value || '').trim();
    const email = (document.getElementById('inlineAdminEmail')?.value || '').trim();
    const phone = (document.getElementById('inlineAdminPhone')?.value || '').trim();
    const username = (document.getElementById('inlineAdminUsername')?.value || '').trim();
    const password = document.getElementById('inlineAdminPassword')?.value || '';
    const msgEl = document.getElementById('inlineAddAdminMsg');
    if (msgEl) msgEl.style.display = 'none';

    try {
      await App.api('/api/admin/admins', {
        method: 'POST',
        body: {
          username,
          password,
          name,
          email,
          employeeId,
          designation,
          department,
          collegeName,
          phone,
          qualification
        }
      });
      App.toast(`Faculty administrator "${name}" registered successfully!`, 'ok');
      Admin.toggleInlineAddAdmin(false);
      Admin.loadAdmins();
    } catch (err) {
      if (msgEl) {
        msgEl.textContent = err.message || 'Error creating administrator';
        msgEl.className = 'msg error';
        msgEl.style.display = 'block';
      }
    }

    return false;
  },

  async handleAddAdmin(e) {
    e.preventDefault();
    const username = (document.getElementById('newAdminUsername')?.value || '').trim();
    const name = (document.getElementById('newAdminName')?.value || '').trim();
    const password = document.getElementById('newAdminPassword')?.value || '';
    const email = (document.getElementById('newAdminEmail')?.value || '').trim();
    const employeeId = (document.getElementById('newAdminEmployeeId')?.value || '').trim();
    const designation = (document.getElementById('newAdminDesignation')?.value || '').trim();
    const department = (document.getElementById('newAdminDepartment')?.value || '').trim();
    const collegeName = (document.getElementById('newAdminCollege')?.value || '').trim();
    const phone = (document.getElementById('newAdminPhone')?.value || '').trim();
    const qualification = (document.getElementById('newAdminQualification')?.value || '').trim();
    const msgEl = document.getElementById('addAdminMsg');
    if (msgEl) msgEl.style.display = 'none';

    try {
      await App.api('/api/admin/admins', {
        method: 'POST',
        body: {
          username,
          name,
          password,
          email,
          employeeId,
          designation,
          department,
          collegeName,
          phone,
          qualification
        }
      });
      App.toast('Administrator account created successfully.', 'ok');
      App.closeModal('addAdminModal');
      Admin.loadAdmins();
    } catch (err) {
      if (msgEl) {
        msgEl.textContent = err.message || 'Error creating administrator';
        msgEl.className = 'msg error';
        msgEl.style.display = 'block';
      }
    }

    return false;
  },

  async removeAdmin(id, name = 'administrator') {
    if (!confirm(`Are you sure you want to remove administrator "${name}"?`)) return;
    try {
      await App.api(`/api/admin/admins/${id}`, { method: 'DELETE' });
      App.toast('Administrator account removed.', 'ok');
      Admin.loadAdmins();
    } catch (err) {
      App.toast(err.message || 'Error removing administrator', 'error');
    }
  },

  async loadAuditLogs() {
    try {
      const res = await App.api('/api/admin/audit-logs');
      const tbody = document.querySelector('#settingsAuditTable tbody');
      if (!tbody) return;

      tbody.innerHTML = res.logs.map(l => `
        <tr>
          <td><span class="badge ${l.user_type === 'admin' ? 'warning' : 'success'}">${l.user_type || 'SYS'}</span></td>
          <td><b>${App.escapeHtml(l.action)}</b></td>
          <td>${App.escapeHtml(l.details || '-')}</td>
          <td><code>${App.escapeHtml(l.ip_address || '-')}</code></td>
          <td>${new Date(l.created_at).toLocaleString()}</td>
        </tr>
      `).join('');
    } catch (err) {
      App.toast('Error loading audit logs: ' + err.message, 'error');
    }
  }
};
