// Global Application State & Utilities
const App = {
  user: null,
  currentView: 'view-landing',

  // Central API caller
  async api(endpoint, options = {}) {
    const config = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    try {
      const res = await fetch(endpoint, config);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401 && !endpoint.includes('/api/auth/login')) {
          App.user = null;
          App.renderNav();
          App.showView('view-auth');
          App.toast('Your session has expired. Please log in again.', 'error');
        }
        const err = new Error(data.error || `Request failed with status ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
      }

      return data;
    } catch (err) {
      throw err;
    }
  },

  toast(msg, type = 'info') {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = type;
    el.style.display = 'block';

    clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => {
      el.style.display = 'none';
    }, 4000);
  },

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, s => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[s]));
  },

  eyeSvg(isOpen, size = 16) {
    if (isOpen) {
      // Open Eye (revealed / visible password)
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-svg eye-open" style="vertical-align:middle;display:inline-block;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    } else {
      // Closed Eye (hidden / masked password)
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-svg eye-closed" style="vertical-align:middle;display:inline-block;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    }
  },

  showModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('active');
      el.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      if (!el._hasOverlayListener) {
        el._hasOverlayListener = true;
        el.addEventListener('click', (e) => {
          if (e.target === el) {
            App.closeModal(id);
          }
        });
      }
    }
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('active');
      el.style.display = 'none';
      document.body.style.overflow = '';
    }
  },

  showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) {
      target.classList.add('active');
      App.currentView = id;
    }
    App.renderNav();
    window.scrollTo(0, 0);
  },

  renderNav() {
    const el = document.getElementById('navRight');
    if (!el) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const sunSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    const moonSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    let html = `<button class="icon-btn" onclick="App.toggleTheme()" title="Toggle theme" aria-label="Toggle theme">${isDark ? sunSvg : moonSvg}</button>`;

    if (App.user) {
      if (App.user.userType === 'student') {
        html += `
          <button class="btn ghost sm" onclick="Student.openProfileModal()">Profile</button>
          <span class="pill">${App.escapeHtml(App.user.name)}</span>
          <button class="btn secondary sm" onclick="App.logout()">Logout</button>
        `;
      } else if (App.user.userType === 'admin') {
        html += `
          <span class="pill">${App.escapeHtml(App.user.username || 'Admin')}</span>
          <button class="btn secondary sm" onclick="App.logout()">Logout</button>
        `;
      }
    } else {
      html += `
        <button class="btn ghost sm" onclick="App.showView('view-landing')">Home</button>
        <button class="btn secondary sm" onclick="App.showView('view-landing'); setTimeout(() => Landing.scrollToDemo(), 80);">Interactive Demo</button>
        <button class="btn sm" onclick="App.showView('view-auth')">Portal Login</button>
      `;
    }

    el.innerHTML = html;
  },

  toggleTheme() {
    const html = document.documentElement;
    const cur = html.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('quiznest_theme', next);
    App.renderNav();
  },

  async logout() {
    try {
      if (window._timerHandle) clearInterval(window._timerHandle);
      if (window.Quiz) Quiz.cleanup();
      await App.api('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // Ignore
    } finally {
      App.user = null;
      App.showView('view-landing');
      App.toast('Logged out successfully.', 'ok');
    }
  },

  async checkAuth() {
    try {
      const data = await App.api('/api/auth/me');
      if (data.authenticated && data.user) {
        App.user = data.user;
        if (App.user.userType === 'student') {
          Student.blockedAttempt = data.blockedAttempt || null;
          if (data.blockedAttempt) {
            Quiz.attemptId = data.blockedAttempt.attemptId;
            Quiz.activeQuiz = { id: data.blockedAttempt.quizId, title: data.blockedAttempt.quizTitle };
          }
          Student.init();
        } else if (App.user.userType === 'admin') {
          Admin.init();
        }
      } else {
        App.user = null;
        App.showView('view-landing');
      }
    } catch (err) {
      App.user = null;
      App.showView('view-landing');
    }
  },

  init() {
    const savedTheme = localStorage.getItem('quiznest_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    App.checkAuth();
  },

  renderMath(container) {
    if (!container) container = document.body;
    try {
      if (window.renderMathInElement) {
        window.renderMathInElement(container, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false
        });
      }
    } catch (e) {
      // Ignore rendering issues
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
