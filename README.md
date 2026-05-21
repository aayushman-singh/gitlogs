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

```bash
git clone https://github.com/aayushman-singh/git-twitter-bot.git gitlogs
cd gitlogs
npm install
cp .env.example .env   # fill in keys
npm start
```

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
npm run dev      # Hot reload
npm run build    # Build frontend
```

## Deployment

The EC2 workflow runs `pnpm i`, `pnpm run frontend:install`, and `pnpm run build` before restarting `gitlogs`.

## Author

Built by [Aayushman Singh](https://aayushman.dev) — engineer building autonomous coding agents. Smart India Hackathon '24 winner.

## License

MIT
