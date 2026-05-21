# GitLogs

Auto-post your Git commits to X/Twitter with AI-generated changelogs. OAuth in, webhook in, Gemini-summarized tweet out.

[![Live](https://img.shields.io/badge/Live-gitlogs.aayushman.dev-1f6feb?style=flat)](https://gitlogs.aayushman.dev)
[![License](https://img.shields.io/badge/License-MIT-c8693d?style=flat)](LICENSE)

---

## Why

Devs ship constantly but rarely tell anyone. Manual tweeting kills momentum; abandoned changelogs kill discoverability. GitLogs closes the loop — you push code, the world hears about it. Gemini turns raw diffs into reader-friendly prose; webhooks fire the whole thing on every commit.

## Features

- **GitHub OAuth** — sign in once, link as many repos as you want
- **Auto webhooks** — created automatically when you enable a repo
- **AI changelogs** — Gemini-powered commit summaries
- **Auto-post to X** — tweet commits without lifting a finger
- **Threading** — chain related commits into a single thread

## How it works

1. Sign in with GitHub
2. Connect your X/Twitter account
3. Enable repos you want to track
4. Push commits → webhook fires → Gemini summarizes → tweet posts

## Stack

**Frontend** — React · Vite
**Backend** — Node.js · Express · SQLite
**AI** — Google Gemini (changelog generation)
**Auth** — GitHub OAuth2 · X OAuth2

## Quick start

Prerequisites: Node.js 18+, npm, a GitHub OAuth app, an X OAuth 2.0 app, and a Gemini API key.

```bash
git clone https://github.com/aayushman-singh/git-twitter-bot.git gitlogs
cd gitlogs
npm run setup
cp .env.example .env
# Fill in the required .env values listed below.
npm run build
npm start
```

The backend serves the built Vite app from `frontend/dist`, so `npm run setup` installs both root and frontend dependencies, and `npm run build` must run before `npm start`.
If you change `PORT`, update `FRONTEND_URL`, `API_BASE_URL`, and `OAUTH_CALLBACK_URL` to the same host and port.

Required `.env` values for the full local flow:

| Variable | Purpose |
| --- | --- |
| `FRONTEND_URL` | Browser redirect target after OAuth, usually `http://localhost:3000` for the built local app |
| `API_BASE_URL` | Public backend URL used for OAuth callbacks and GitHub webhooks; use `http://localhost:3000` for localhost-only OAuth testing |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth login and repository access |
| `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` | X OAuth 2.0 app credentials for connecting user X accounts |
| `OAUTH_CALLBACK_URL` | X OAuth callback, usually `${API_BASE_URL}/auth/x/callback` |
| `WEBHOOK_SECRET` | Shared secret for GitHub webhook signature verification |
| `GEMINI_API_KEY` | Gemini key used to generate changelog/tweet text |

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/auth/github` | Start GitHub OAuth |
| `GET` | `/auth/x` | Start X/Twitter OAuth |
| `POST` | `/webhook/github` | GitHub webhook receiver |
| `GET` | `/api/me` | Current user |
| `GET` | `/api/me/repos` | User repositories |
| `GET` | `/api/health` | Health check |

## Development

```bash
npm run setup    # Install backend and frontend dependencies
npm run dev:all  # Run Express and Vite together
npm run build    # Build frontend/dist for npm start
npm start        # Serve the built frontend and API
```

## Author

Built by [Aayushman Singh](https://aayushman.dev) — engineer building autonomous coding agents. Smart India Hackathon '24 winner.

## License

MIT
