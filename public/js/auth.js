'use strict';

// ── Shared utilities ────────────────────────────────────────────────────────

function showError(msg) {
  const el = document.getElementById('error-msg');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideError() {
  const el = document.getElementById('error-msg');
  if (el) el.classList.add('hidden');
}
function showSuccess(msg) {
  const el = document.getElementById('success-msg');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function setLoading(btn, loading) {
  const text    = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled  = loading;
  if (text)    text.classList.toggle('hidden', loading);
  if (spinner) spinner.classList.toggle('hidden', !loading);
}

// Toggle password visibility
document.querySelectorAll('.toggle-password').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.previousElementSibling;
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    // Swap icon (reuse same SVG, just update aria)
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
});

// ── Login page ──────────────────────────────────────────────────────────────
const loginForm = document.getElementById('login-form');
if (loginForm) {
  // If already logged in, redirect
  fetch('/api/auth/me').then(r => { if (r.ok) window.location.replace('/dashboard.html'); });

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideError();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const btn      = document.getElementById('login-btn');

    if (!username || !password) { showError('Please fill in all fields.'); return; }

    setLoading(btn, true);
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || 'Login failed.'); return; }
      window.location.replace('/dashboard.html');
    } catch {
      showError('Network error – please try again.');
    } finally {
      setLoading(btn, false);
    }
  });
}

// ── Register page ────────────────────────────────────────────────────────────
const registerForm = document.getElementById('register-form');
if (registerForm) {
  const passwordInput = document.getElementById('password');

  // Password strength meter
  if (passwordInput) {
    passwordInput.addEventListener('input', () => {
      const fill  = document.getElementById('strength-fill');
      const label = document.getElementById('strength-label');
      if (!fill || !label) return;

      const val = passwordInput.value;
      let score = 0;
      if (val.length >= 8) score++;
      if (/[A-Z]/.test(val)) score++;
      if (/[0-9]/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;

      const levels = [
        { pct: 0,   clr: '',        text: '' },
        { pct: 25,  clr: '#ef4444', text: 'Weak' },
        { pct: 50,  clr: '#f97316', text: 'Fair' },
        { pct: 75,  clr: '#eab308', text: 'Good' },
        { pct: 100, clr: '#22c55e', text: 'Strong' }
      ];
      const lvl = levels[score] || levels[0];
      fill.style.width      = lvl.pct + '%';
      fill.style.background = lvl.clr;
      label.textContent     = lvl.text;
      label.style.color     = lvl.clr;
    });
  }

  registerForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideError();
    const successEl = document.getElementById('success-msg');
    if (successEl) successEl.classList.add('hidden');

    const username = document.getElementById('username').value.trim();
    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirm  = document.getElementById('confirm-password').value;
    const btn      = document.getElementById('register-btn');

    if (!username || !email || !password || !confirm) { showError('Please fill in all fields.'); return; }
    if (password !== confirm) { showError('Passwords do not match.'); return; }

    setLoading(btn, true);
    try {
      const res  = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || 'Registration failed.'); return; }
      showSuccess('Account created! Redirecting to login…');
      setTimeout(() => window.location.replace('/login.html'), 1500);
    } catch {
      showError('Network error – please try again.');
    } finally {
      setLoading(btn, false);
    }
  });
}
