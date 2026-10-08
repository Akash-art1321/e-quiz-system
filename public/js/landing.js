// QuizNest - Interactive Landing Page & Portal Modules
const Landing = {
  simTimerSeconds: 898, // 14:58
  simTimerInterval: null,
  simSelectedOption: null,
  simCheatingStrikes: 0,

  init() {
    Landing.startSimTimer();
    Landing.initFaq();
  },

  startSimTimer() {
    if (Landing.simTimerInterval) clearInterval(Landing.simTimerInterval);
    Landing.simTimerInterval = setInterval(() => {
      if (Landing.simTimerSeconds > 0) {
        Landing.simTimerSeconds--;
        const m = Math.floor(Landing.simTimerSeconds / 60);
        const s = Landing.simTimerSeconds % 60;
        const el = document.getElementById('simTimerText');
        if (el) {
          el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
      } else {
        clearInterval(Landing.simTimerInterval);
      }
    }, 1000);
  },

  selectSimOption(choice) {
    Landing.simSelectedOption = choice;
    const cards = document.querySelectorAll('.sim-opt-card');
    cards.forEach(c => {
      c.classList.remove('selected', 'correct', 'wrong');
      if (c.dataset.opt === choice) {
        c.classList.add('selected');
      }
    });

    const fb = document.getElementById('simFeedback');
    if (!fb) return;

    if (choice === 'B') {
      // Correct!
      const correctCard = document.querySelector(`.sim-opt-card[data-opt="B"]`);
      if (correctCard) {
        correctCard.classList.add('correct');
        if (window.Tilt3D && typeof window.Tilt3D.confetti === 'function') {
          const rect = correctCard.getBoundingClientRect();
          window.Tilt3D.confetti(rect.left + rect.width / 2, rect.top + rect.height / 2, 28);
        }
      }
      fb.className = 'sim-feedback-box success';
      fb.innerHTML = `
        <div style="font-weight: 700; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span>Correct Answer!</span>
          <span class="badge success">+2.00 Marks</span>
        </div>
        <div><b>Stack</b> follows the Last-In, First-Out (LIFO) protocol with $O(1)$ push and pop operations. Full score awarded!</div>
      `;
      fb.style.display = 'block';
    } else {
      // Wrong!
      const chosenCard = document.querySelector(`.sim-opt-card[data-opt="${choice}"]`);
      if (chosenCard) chosenCard.classList.add('wrong');
      const correctCard = document.querySelector(`.sim-opt-card[data-opt="B"]`);
      if (correctCard) correctCard.classList.add('correct');

      fb.className = 'sim-feedback-box error';
      fb.innerHTML = `
        <div style="font-weight: 700; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
          <span>Incorrect Selection</span>
          <span class="badge danger">−0.50 Mark Penalty</span>
        </div>
        <div>Option ${choice} is incorrect. With <b>25% negative marking</b> enabled, −0.50 is deducted on the server. The correct answer is <b>[B] Stack</b>.</div>
      `;
      fb.style.display = 'block';
    }
  },

  simulateCheating() {
    Landing.simCheatingStrikes++;
    const banner = document.getElementById('simCheatAlert');

    if (banner) {
      banner.style.display = 'block';
      banner.className = 'sim-cheat-alert danger-lock shake';
      banner.innerHTML = `
        <strong>PROCTORING VIOLATION &mdash; EXAM INSTANTLY LOCKED</strong><br>
        Zero Tolerance Proctoring triggered! In a live examination, your attempt is <b>immediately paused and locked</b>. Only an administrator can unblock your exam from the Surveillance Console.
      `;
      setTimeout(() => banner.classList.remove('shake'), 600);
    }
  },

  resetSimDemo() {
    Landing.simSelectedOption = null;
    Landing.simCheatingStrikes = 0;
    Landing.simTimerSeconds = 898;
    Landing.startSimTimer();

    document.querySelectorAll('.sim-opt-card').forEach(c => {
      c.classList.remove('selected', 'correct', 'wrong');
    });

    const fb = document.getElementById('simFeedback');
    if (fb) fb.style.display = 'none';

    const banner = document.getElementById('simCheatAlert');
    if (banner) {
      banner.className = 'sim-cheat-alert';
      banner.style.display = 'none';
      banner.innerHTML = `
        <span><b>Proctoring Alert:</b> Window/Tab switch detected &mdash; Exam instantly paused &amp; locked!</span>
      `;
    }

    App.toast('Exam simulation reset. Try another choice!', 'info');
  },

  scrollToDemo() {
    const el = document.getElementById('interactiveDemo');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  },

  setRoleTab(role) {
    document.querySelectorAll('.role-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.role === role);
    });

    ['student', 'examiner', 'admin'].forEach(r => {
      const card = document.getElementById(`roleCard_${r}`);
      if (card) {
        card.style.display = r === role ? 'block' : 'none';
      }
    });
  },

  initFaq() {
    document.querySelectorAll('.faq-item-header').forEach(h => {
      h.onclick = () => {
        const item = h.parentElement;
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item').forEach(it => it.classList.remove('open'));
        if (!isOpen) item.classList.add('open');
      };
    });
  },

  togglePasswordVisibility(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = typeof btnId === 'string' ? document.getElementById(btnId) : btnId;
    if (!input || !btn) return;

    if (input.type === 'password') {
      input.type = 'text';
      btn.innerHTML = App.eyeSvg(true, 18);
      btn.title = 'Hide password';
      btn.setAttribute('aria-label', 'Hide password');
    } else {
      input.type = 'password';
      btn.innerHTML = App.eyeSvg(false, 18);
      btn.title = 'Show password';
      btn.setAttribute('aria-label', 'Show password');
    }
  },

  fillAndLogin(role) {
    App.showView('view-auth');

    const idInput = document.getElementById('loginIdentifier');
    const passInput = document.getElementById('loginPassword');

    if (role === 'student') {
      idInput.value = 'STU2026001';
      passInput.value = 'Student@QuizNest2026!';
      App.toast('Filled Demo Student credentials (STU2026001)', 'info');
    } else if (role === 'admin') {
      idInput.value = 'admin';
      passInput.value = 'Admin@QuizNest2026!';
      App.toast('Filled Demo Administrator credentials (admin)', 'info');
    }

    // Smooth focus
    setTimeout(() => {
      const btn = document.getElementById('loginSubmitBtn');
      if (btn) btn.focus();
    }, 150);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  Landing.init();
});
