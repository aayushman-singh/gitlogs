# GitLogs

Auto-post your Git commits to X/Twitter with AI-generated changelogs.

[![Live](https://img.shields.io/badge/Live-gitlogs.aayushman.dev-blue)](https://gitlogs.aayushman.dev)

## Features

- **GitHub OAuth** — Sign in with GitHub
- **Webhook Integration** — Real-time commit detection
- **AI Changelogs** — Gemini-powered commit summaries
- **Auto-post to X** — Tweet commits automatically
- **Threading** — Chain related commits together

## Quick Start

```bash
# Install
npm install

# Configure
cp .env.example .env

# Run
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

## Webhook Setup

1. Go to your repo → **Settings** → **Webhooks** → **Add webhook**
2. Set **Payload URL** to `https://your-api.com/webhook/github`
3. Set **Content type** to `application/json`
4. Add your **Secret** (same as `WEBHOOK_SECRET`)
5. Select **Just the push event**

## Development

```bash
npm run dev      # Start with hot reload
npm run build    # Build frontend
```

## License

MIT
