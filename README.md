# GitLogs

Auto-post your Git commits to X/Twitter with AI-generated changelogs.

[![Live](https://img.shields.io/badge/Live-gitlogs.aayushman.dev-blue)](https://gitlogs.aayushman.dev)

## Features

- **GitHub OAuth** — Sign in with GitHub
- **Auto Webhooks** — Webhooks created automatically when you enable a repo
- **AI Changelogs** — Gemini-powered commit summaries
- **Auto-post to X** — Tweet commits automatically
- **Threading** — Chain related commits together

## How It Works

1. Sign in with GitHub
2. Connect your X/Twitter account
3. Enable repos you want to track
4. Push commits → they get posted to X automatically

## Quick Start

```bash
npm install
cp .env.example .env
npm start
```

## API

| Endpoint | Description |
|----------|-------------|
| `GET /auth/github` | Start GitHub OAuth |
| `GET /auth/x` | Start X/Twitter OAuth |
| `POST /webhook/github` | GitHub webhook receiver |
| `GET /api/me` | Current user |
| `GET /api/me/repos` | User repositories |
| `GET /api/health` | Health check |

## Development

```bash
npm run dev      # Start with hot reload
npm run build    # Build frontend
```

## License

MIT
