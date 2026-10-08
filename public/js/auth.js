// Unified Authentication Handler (Single Login Flow)
const Auth = {
  flashMsg(id, text, isOk = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'msg ' + (isOk ? 'ok' : 'error');
    el.style.display = 'block';
  },

  hideMsg(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  },

  async handleLogin(e) {
    e.preventDefault();
    Auth.hideMsg('loginMsg');

    const identifier = document.getElementById('loginIdentifier').value.trim();
    const password = document.getElementById('loginPassword').value;
    const submitBtn = document.getElementById('loginSubmitBtn');

    if (!identifier || !password) {
      Auth.flashMsg('loginMsg', 'Please provide your Student ID, Username, or Email along with your password.');
      return false;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Authenticating…';

      const res = await App.api('/api/auth/login', {
        method: 'POST',
        body: { identifier, password }
      });

      if (res.success && res.user) {
        App.user = res.user;
        Auth.lastEnteredPassword = password;
        document.getElementById('loginForm').reset();
        App.toast(`Welcome back, ${res.user.name || res.user.username}!`, 'ok');

        if (res.user.userType === 'admin') {
          Admin.init();
        } else {
          Student.init();
        }
      }
    } catch (err) {
      Auth.flashMsg('loginMsg', err.message || 'Invalid login credentials. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Login to QuizNest';
    }

    return false;
  },

  openForgotModal() {
    Auth.hideMsg('forgotMsg');
    document.getElementById('forgotForm').reset();
    App.showModal('forgotModal');
  },

  async handleForgotPassword(e) {
    e.preventDefault();
    Auth.hideMsg('forgotMsg');

    const identifier = document.getElementById('forgotIdentifier').value.trim();
    const reason = document.getElementById('forgotReason').value.trim();
    const submitBtn = document.getElementById('forgotSubmitBtn');

    if (!identifier) {
      Auth.flashMsg('forgotMsg', 'Please enter your Student ID or registered email.');
      return false;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';

      const res = await App.api('/api/auth/forgot-password', {
        method: 'POST',
        body: { identifier, reason }
      });

      Auth.flashMsg('forgotMsg', res.message, true);
      setTimeout(() => {
        App.closeModal('forgotModal');
      }, 3000);
    } catch (err) {
      Auth.flashMsg('forgotMsg', err.message || 'Error submitting request. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Reset Request';
    }

    return false;
  },

  async handleChangePassword(e) {
    e.preventDefault();
    Auth.hideMsg('changePassMsg');

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!currentPassword || !newPassword) {
      Auth.flashMsg('changePassMsg', 'Please fill in all password fields.');
      return false;
    }

    if (newPassword !== confirmPassword) {
      Auth.flashMsg('changePassMsg', 'New password and confirmation do not match.');
      return false;
    }

    try {
      const res = await App.api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword, confirmPassword }
      });

      Auth.flashMsg('changePassMsg', res.message, true);
      App.toast('Password updated successfully.', 'ok');
      document.getElementById('changePassForm').reset();
      setTimeout(() => {
        App.closeModal('changePassModal');
      }, 1500);
    } catch (err) {
      Auth.flashMsg('changePassMsg', err.message || 'Failed to update password.');
    }

    return false;
  }
};
