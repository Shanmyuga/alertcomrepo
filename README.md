# AlertCom News

A personalised news dashboard with user authentication and keyword-based news feeds.

## Features

- **Registration & Login** – create an account (username, email, password with strength meter) and sign in securely; passwords are hashed with bcrypt.
- **Areas of Interest** – choose from Sports, Business, Politics, and Entertainment.
- **Keyword Management** – add up to 10 keywords per selected category; keywords are saved per user.
- **News Feed** – displays recent news snippets grouped by category, fetched from [NewsAPI](https://newsapi.org/) or shown as demo articles if no API key is configured.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. (Optional) configure environment variables
cp .env.example .env
# Edit .env – add your NEWS_API_KEY from https://newsapi.org for live news

# 3. Start the server
npm start
# → http://localhost:3000
```

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Backend  | Node.js · Express                   |
| Database | SQLite (better-sqlite3)             |
| Auth     | bcrypt + express-session            |
| Frontend | Vanilla HTML / CSS / JavaScript     |
| News API | NewsAPI.org (optional; demo fallback included) |

## Environment Variables

| Variable         | Default                        | Description                          |
|------------------|--------------------------------|--------------------------------------|
| `PORT`           | `3000`                         | HTTP port to listen on               |
| `SESSION_SECRET` | `alertcom-dev-secret`          | Secret used to sign session cookies  |
| `NEWS_API_KEY`   | *(empty)*                      | NewsAPI key for live articles        |
| `DB_PATH`        | `users.db`                     | Path to the SQLite database file     |
