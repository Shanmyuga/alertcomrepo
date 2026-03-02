'use strict';

require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const session = require('express-session');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database(process.env.DB_PATH || 'users.db');

// ── Database setup ─────────────────────────────────────────────────────────────
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    email         TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_interests (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id  INTEGER NOT NULL,
    category TEXT    NOT NULL,
    keywords TEXT    NOT NULL DEFAULT '[]',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, category)
  );
`);

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'alertcom-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'Unauthorised – please log in.' });
}

// ── Auth routes ────────────────────────────────────────────────────────────────

// Register
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body || {};

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–30 alphanumeric characters or underscores.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one letter and one number.' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run(username, email, hash);
    res.json({ success: true });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username or email already in use.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Registration failed – please try again.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username/email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ success: true, username: user.username });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Current user
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ userId: req.session.userId, username: req.session.username });
});

// ── Preferences routes ─────────────────────────────────────────────────────────

const VALID_CATEGORIES = ['sports', 'business', 'politics', 'entertainment'];

// Get all preferences
app.get('/api/preferences', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT category, keywords FROM user_interests WHERE user_id = ?').all(req.session.userId);
  const result = {};
  rows.forEach(r => { result[r.category] = JSON.parse(r.keywords); });
  res.json(result);
});

// Save/update a category's keywords
app.post('/api/preferences', requireAuth, (req, res) => {
  const { category, keywords } = req.body || {};

  if (!VALID_CATEGORIES.includes((category || '').toLowerCase())) {
    return res.status(400).json({ error: 'Invalid category.' });
  }
  if (!Array.isArray(keywords) || keywords.length > 10) {
    return res.status(400).json({ error: 'Keywords must be an array with at most 10 items.' });
  }
  const cleaned = keywords.map(k => String(k).trim()).filter(Boolean);

  db.prepare(`
    INSERT INTO user_interests (user_id, category, keywords) VALUES (?, ?, ?)
    ON CONFLICT(user_id, category) DO UPDATE SET keywords = excluded.keywords
  `).run(req.session.userId, category.toLowerCase(), JSON.stringify(cleaned));

  res.json({ success: true });
});

// Remove a category from preferences
app.delete('/api/preferences/:category', requireAuth, (req, res) => {
  const cat = (req.params.category || '').toLowerCase();
  if (!VALID_CATEGORIES.includes(cat)) {
    return res.status(400).json({ error: 'Invalid category.' });
  }
  db.prepare('DELETE FROM user_interests WHERE user_id = ? AND category = ?').run(req.session.userId, cat);
  res.json({ success: true });
});

// ── News route ─────────────────────────────────────────────────────────────────

// Map app categories to NewsAPI top-headlines categories
const CATEGORY_MAP = {
  sports: 'sports',
  business: 'business',
  politics: 'general',
  entertainment: 'entertainment'
};

app.get('/api/news', requireAuth, async (req, res) => {
  const interests = db.prepare('SELECT category, keywords FROM user_interests WHERE user_id = ?').all(req.session.userId);

  if (interests.length === 0) {
    return res.json({ articles: [], isMock: false });
  }

  const NEWS_API_KEY = process.env.NEWS_API_KEY;
  if (!NEWS_API_KEY) {
    return res.json({ articles: getMockArticles(interests), isMock: true });
  }

  try {
    const fetches = interests.map(async interest => {
      const keywords = JSON.parse(interest.keywords);
      const q = keywords.length > 0 ? keywords.join(' OR ') : interest.category;
      const cat = CATEGORY_MAP[interest.category] || 'general';
      const url = `https://newsapi.org/v2/top-headlines?category=${cat}&q=${encodeURIComponent(q)}&pageSize=5&language=en&apiKey=${NEWS_API_KEY}`;
      const r = await fetch(url);
      const data = await r.json();
      return (data.articles || []).map(a => ({ ...a, _category: interest.category }));
    });

    const results = await Promise.all(fetches);
    res.json({ articles: results.flat(), isMock: false });
  } catch (err) {
    console.error('News fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch news.' });
  }
});

// ── Mock news data ─────────────────────────────────────────────────────────────
function getMockArticles(interests) {
  const pool = {
    sports: [
      { title: 'Championship Finals Set for This Weekend', description: 'Teams battle it out in the season finale, promising record-breaking viewership numbers.', url: '#', urlToImage: null, source: { name: 'Sports Daily' }, publishedAt: new Date().toISOString() },
      { title: 'Star Athlete Signs Record-Breaking Contract', description: 'The deal marks the largest in league history, reshaping the competitive landscape.', url: '#', urlToImage: null, source: { name: 'Sports Wire' }, publishedAt: new Date().toISOString() },
      { title: 'Youth Sports Programs See Surge in Enrollment', description: 'Community leagues report a 30% increase in sign-ups following recent national events.', url: '#', urlToImage: null, source: { name: 'Local Sports' }, publishedAt: new Date().toISOString() }
    ],
    business: [
      { title: 'Markets Rally on Positive Economic Data', description: 'Stocks climbed to new highs after better-than-expected jobs reports and declining inflation.', url: '#', urlToImage: null, source: { name: 'Business Times' }, publishedAt: new Date().toISOString() },
      { title: 'Tech Giants Report Strong Quarterly Earnings', description: 'Several major technology companies exceeded analyst forecasts, boosting investor confidence.', url: '#', urlToImage: null, source: { name: 'Finance News' }, publishedAt: new Date().toISOString() },
      { title: 'Start-Up Funding Reaches Five-Year High', description: 'Venture capital investment surged in Q1, led by AI and clean-energy sectors.', url: '#', urlToImage: null, source: { name: 'Startup Weekly' }, publishedAt: new Date().toISOString() }
    ],
    politics: [
      { title: 'Bipartisan Bill Advances in Senate', description: 'Lawmakers reached a rare cross-party agreement on infrastructure and climate provisions.', url: '#', urlToImage: null, source: { name: 'Capitol Report' }, publishedAt: new Date().toISOString() },
      { title: 'International Summit Addresses Trade Policies', description: 'World leaders gathered to negotiate updated trade frameworks amid ongoing economic tensions.', url: '#', urlToImage: null, source: { name: 'Global Politics' }, publishedAt: new Date().toISOString() },
      { title: 'Local Elections Draw Record Voter Turnout', description: 'Officials cite increased civic engagement and mobile voting options for the historic numbers.', url: '#', urlToImage: null, source: { name: 'Civic News' }, publishedAt: new Date().toISOString() }
    ],
    entertainment: [
      { title: 'Blockbuster Film Breaks Opening Weekend Record', description: 'The long-awaited sequel surpassed all box-office predictions in its debut weekend.', url: '#', urlToImage: null, source: { name: 'Entertainment Weekly' }, publishedAt: new Date().toISOString() },
      { title: 'Streaming Wars Heat Up With New Platform Launch', description: 'A new entrant promises exclusive originals and competitive pricing to challenge market leaders.', url: '#', urlToImage: null, source: { name: 'Media Insider' }, publishedAt: new Date().toISOString() },
      { title: 'Music Festival Announces Star-Studded Lineup', description: 'The annual festival revealed its roster, featuring global headliners across multiple stages.', url: '#', urlToImage: null, source: { name: 'Music Beat' }, publishedAt: new Date().toISOString() }
    ]
  };

  const articles = [];
  interests.forEach(interest => {
    const items = (pool[interest.category] || []).map(a => ({ ...a, _category: interest.category }));
    articles.push(...items);
  });
  return articles;
}

// ── Start server ───────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => console.log(`AlertCom News running on http://localhost:${PORT}`));
