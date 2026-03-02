'use strict';

// ── State ───────────────────────────────────────────────────────────────────
const state = {
  // category → string[]
  keywords: { sports: [], business: [], politics: [], entertainment: [] },
  // category → boolean
  active:   { sports: false, business: false, politics: false, entertainment: false }
};

// ── Bootstrap ───────────────────────────────────────────────────────────────
(async function init() {
  // Guard: must be logged in
  const meRes = await fetch('/api/auth/me');
  if (!meRes.ok) { window.location.replace('/login.html'); return; }
  const { username } = await meRes.json();
  const navUser = document.getElementById('nav-username');
  if (navUser) navUser.textContent = username;

  // Load saved preferences
  const prefRes  = await fetch('/api/preferences');
  const prefData = prefRes.ok ? await prefRes.json() : {};

  Object.keys(prefData).forEach(cat => {
    state.keywords[cat] = prefData[cat] || [];
    state.active[cat]   = true;
  });

  // Render initial UI
  document.querySelectorAll('.category-toggle').forEach(toggle => {
    const cat = toggle.dataset.category;
    toggle.checked = !!state.active[cat];
    refreshKeywordUI(cat);
    toggleKeywordSection(cat, !!state.active[cat]);
  });

  // Fetch news if any active category
  if (Object.values(state.active).some(Boolean)) fetchNews();
})();

// ── Category toggles ────────────────────────────────────────────────────────
document.querySelectorAll('.category-toggle').forEach(toggle => {
  toggle.addEventListener('change', () => {
    const cat = toggle.dataset.category;
    state.active[cat] = toggle.checked;
    toggleKeywordSection(cat, toggle.checked);
    updateCategoryCardStyle(cat, toggle.checked);
  });
});

function toggleKeywordSection(cat, show) {
  const card = document.querySelector(`.category-card[data-category="${cat}"]`);
  if (!card) return;
  const section = card.querySelector('.keyword-section');
  if (section) section.classList.toggle('hidden', !show);
  updateCategoryCardStyle(cat, show);
}

function updateCategoryCardStyle(cat, active) {
  const card = document.querySelector(`.category-card[data-category="${cat}"]`);
  if (card) card.classList.toggle('active', active);
}

// ── Keyword management ───────────────────────────────────────────────────────
document.querySelectorAll('.add-keyword-btn').forEach(btn => {
  btn.addEventListener('click', () => addKeyword(btn.dataset.category));
});

document.querySelectorAll('.keyword-input').forEach(input => {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addKeyword(input.dataset.category); }
  });
});

function addKeyword(cat) {
  const input = document.querySelector(`.keyword-input[data-category="${cat}"]`);
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  if (state.keywords[cat].length >= 10) {
    showToast('Maximum 10 keywords per category.', 'error');
    return;
  }
  if (state.keywords[cat].includes(val)) {
    showToast('That keyword is already added.', 'error');
    return;
  }
  state.keywords[cat] = [...state.keywords[cat], val];
  input.value = '';
  refreshKeywordUI(cat);
}

function removeKeyword(cat, keyword) {
  state.keywords[cat] = state.keywords[cat].filter(k => k !== keyword);
  refreshKeywordUI(cat);
}

function refreshKeywordUI(cat) {
  const container = document.querySelector(`.keyword-tags[data-category="${cat}"]`);
  if (!container) return;

  container.innerHTML = '';
  state.keywords[cat].forEach(kw => {
    const tag = document.createElement('span');
    tag.className = 'keyword-tag';
    tag.innerHTML = `${escapeHtml(kw)}<button type="button" aria-label="Remove ${escapeHtml(kw)}">&#x2715;</button>`;
    tag.querySelector('button').addEventListener('click', () => removeKeyword(cat, kw));
    container.appendChild(tag);
  });

  // Update count badge
  const card = document.querySelector(`.category-card[data-category="${cat}"]`);
  if (card) {
    const countEl = card.querySelector('.keyword-count');
    if (countEl) {
      const n = state.keywords[cat].length;
      countEl.textContent = n > 0 ? `${n}/10 keyword${n !== 1 ? 's' : ''}` : '';
    }
    // Disable input when at 10
    const input = card.querySelector('.keyword-input');
    const btn   = card.querySelector('.add-keyword-btn');
    const atMax = state.keywords[cat].length >= 10;
    if (input) input.disabled = atMax;
    if (btn)   btn.disabled   = atMax;
  }
}

// ── Save preferences ─────────────────────────────────────────────────────────
const saveBtn    = document.getElementById('save-preferences-btn');
const saveStatus = document.getElementById('save-status');

if (saveBtn) {
  saveBtn.addEventListener('click', savePreferences);
}

async function savePreferences() {
  setLoading(saveBtn, true);
  if (saveStatus) saveStatus.textContent = '';

  try {
    const activeCategories = Object.keys(state.active).filter(c => state.active[c]);

    // Remove deselected categories
    const prefRes  = await fetch('/api/preferences');
    const existing = prefRes.ok ? await prefRes.json() : {};
    const toRemove = Object.keys(existing).filter(c => !state.active[c]);
    await Promise.all(toRemove.map(c =>
      fetch(`/api/preferences/${c}`, { method: 'DELETE' })
    ));

    // Upsert active categories
    await Promise.all(activeCategories.map(cat =>
      fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat, keywords: state.keywords[cat] })
      })
    ));

    if (saveStatus) {
      saveStatus.textContent = '✓ Saved!';
      setTimeout(() => { if (saveStatus) saveStatus.textContent = ''; }, 3000);
    }

    fetchNews();
  } catch {
    if (saveStatus) saveStatus.textContent = 'Save failed – please retry.';
  } finally {
    setLoading(saveBtn, false);
  }
}

// ── News feed ────────────────────────────────────────────────────────────────
const refreshBtn      = document.getElementById('refresh-news-btn');
const newsContainer   = document.getElementById('news-container');
const mockNotice      = document.getElementById('mock-notice');

if (refreshBtn) refreshBtn.addEventListener('click', fetchNews);

async function fetchNews() {
  if (!newsContainer) return;
  renderSkeletons();

  try {
    const res  = await fetch('/api/news');
    const data = res.ok ? await res.json() : { articles: [] };

    if (mockNotice) mockNotice.classList.toggle('hidden', !data.isMock);

    if (!data.articles || data.articles.length === 0) {
      newsContainer.innerHTML = `
        <div class="news-empty">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>
          <p>No news found. Select categories, add keywords, and save your preferences.</p>
        </div>`;
      return;
    }

    // Group by category
    const grouped = {};
    data.articles.forEach(a => {
      const cat = a._category || 'general';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(a);
    });

    const html = Object.entries(grouped).map(([cat, articles]) => `
      <div class="news-section">
        <h3 class="news-section-title">
          <span class="news-section-dot dot-${cat}"></span>
          ${escapeHtml(cat.charAt(0).toUpperCase() + cat.slice(1))}
        </h3>
        ${articles.map(articleHTML).join('')}
      </div>`).join('');

    newsContainer.innerHTML = html;
  } catch {
    if (newsContainer) newsContainer.innerHTML = '<p style="color:var(--clr-error);padding:1rem">Failed to load news. Please try again.</p>';
  }
}

function articleHTML(a) {
  const thumb = a.urlToImage
    ? `<img class="article-thumb" src="${escapeHtml(a.urlToImage)}" alt="" loading="lazy" onerror="this.replaceWith(this.nextElementSibling)">`
    : '';
  const placeholder = `<div class="article-thumb-placeholder"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m3 9 4-4 4 4 4-4 4 4"/><circle cx="8" cy="14" r="1"/></svg></div>`;
  const source  = a.source?.name || '';
  const date    = a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const meta    = [source, date].filter(Boolean).join(' · ');
  const target  = a.url && a.url !== '#' ? 'target="_blank" rel="noopener noreferrer"' : '';

  return `
    <article class="article-card">
      ${thumb}${placeholder}
      <div class="article-body">
        ${meta ? `<p class="article-meta">${escapeHtml(meta)}</p>` : ''}
        <h4 class="article-title"><a href="${escapeHtml(a.url || '#')}" ${target}>${escapeHtml(a.title || 'Untitled')}</a></h4>
        ${a.description ? `<p class="article-desc">${escapeHtml(a.description)}</p>` : ''}
      </div>
    </article>`;
}

function renderSkeletons() {
  if (!newsContainer) return;
  const sk = `<div class="skeleton-article">
    <div class="skeleton skeleton-thumb"></div>
    <div class="skeleton-body">
      <div class="skeleton skeleton-line w-full"></div>
      <div class="skeleton skeleton-line w-3q"></div>
      <div class="skeleton skeleton-line w-half"></div>
    </div>
  </div>`;
  newsContainer.innerHTML = sk.repeat(4);
}

// ── Logout ──────────────────────────────────────────────────────────────────
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.replace('/login.html');
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setLoading(btn, loading) {
  if (!btn) return;
  const text    = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled  = loading;
  if (text)    text.classList.toggle('hidden', loading);
  if (spinner) spinner.classList.toggle('hidden', !loading);
}

function showToast(msg, type) {
  const toast = document.createElement('div');
  toast.className = `alert alert-${type === 'error' ? 'error' : 'success'}`;
  toast.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;max-width:320px;animation:fadeIn .2s ease';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
