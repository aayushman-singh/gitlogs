# GitLogs

**Turn `git push` into a published changelog tweet.** Sign in with GitHub, link your X account, enable a repo — every push then fires a webhook, Gemini summarizes the real diff, and a changelog post lands on your own X timeline. No manual tweeting, no abandoned changelog.

[![License: MIT](https://img.shields.io/badge/License-MIT-c8693d?style=flat)](LICENSE)
[![Demo: /demo (no login)](https://img.shields.io/badge/Demo-%2Fdemo%20(no%20login)-3fb950?style=flat)](#see-it-in-30-seconds)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-1f6feb?style=flat)](package.json)

---

## Why

Developers ship constantly but rarely tell anyone. Manual tweeting kills momentum; abandoned changelogs kill discoverability. GitLogs closes the loop — you push code, the world hears about it. Gemini turns raw diffs into reader-friendly prose grounded in what actually changed, and webhooks fire the whole thing on every commit.

## See it in 30 seconds

There's a **keyless `/demo` route** — no GitHub, no X, no API keys, no backend calls. It walks bundled commit fixtures through the real pipeline *shape* entirely client-side: a commit + diff, the **real interpolated Gemini prompt** that the backend would send, and a **pre-generated sample changelog post** (a fixture — the demo does not call Gemini). A persona toggle (Professional / Hype / Deadpan Technical) re-renders the prompt's persona instruction and swaps the matching sample output, so you can see the prompt engineering, not just the result.

Run it locally:

```bash
npm run setup && npm run dev:all
# then open http://localhost:5173/demo
```

In production, Vercel serves the frontend and `/demo` from the same SPA deploy.

### Example output

A sample changelog post (bundled fixture) for commit `a1b2c3d` on `octo-dev/payments-api` (`feat: idempotency keys on POST /charges`), in the **Professional** persona:

> shipped: idempotency keys on POST /charges. retries now return the original charge instead of creating a duplicate. one required header, zero double-charges. (a1b2c3d)

The same diff in **Deadpan Technical**:

> POST /charges: require Idempotency-Key header (400 if missing). lookup by key first, return existing charge 200 if found, else create with key. backed by a partial unique index where key is not null. (a1b2c3d)

The prompt feeds Gemini the actual diff as ground truth and instructs it to describe only what changed — no hallucinated features.

## How it works

Every push hits `POST /webhook/github`. The backend verifies the GitHub HMAC signature (failing **closed** if no secret is configured — see [security](#configuration)), resolves which user owns the repo, and runs a two-stage AI pipeline per non-merge commit: Stage 1 fetches the real diff from the GitHub REST API and asks Gemini for a factual summary; Stage 2 feeds that grounded summary into the user's prompt template and posts the result to their own X account. Stage 2 runs through a rate-limited, retrying, restart-survivable queue backed by SQLite.

```mermaid
sequenceDiagram
    autonumber
    participant GH as GitHub
    participant WH as webhookHandler
    participant DA as diffAnalyzer
    participant GEM as geminiClient
    participant Q as queueService
    participant DB as SQLite (sql.js)
    participant TW as twitterClient / X

    GH->>WH: POST push (raw body + x-hub-signature-256)
    WH->>WH: HMAC-SHA256 verify (timingSafeEqual; fail CLOSED if no secret)
    alt invalid or no secret
        WH-->>GH: 401 reject
    else valid
        WH->>DB: resolve repo -> user -> X auth
        loop each non-merge commit
            WH->>DA: fetchCommitDiff(repo, sha)
            DA-->>WH: diff + files + stats
            WH->>GEM: analyzeDiff(diff) — Stage 1 (factual summary)
            WH->>GEM: generateChangelog(commit, diffSummary) — Stage 2
            GEM->>Q: enqueue task (persisted, rate-limited)
            Q->>DB: saveQueueItem(pending)
            Q->>GEM: run template + diffSummary through Gemini (retry w/ backoff)
            GEM-->>WH: changelog text
            WH->>TW: postTweet(text, optional quote)
            TW-->>WH: tweet id
            WH->>DB: saveTweetId(repo, sha, tweetId)
        end
        WH-->>GH: 200 { processed, total }
    end
```

For the full sequence, OAuth flows, data model, and documented failure modes, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Quick start

Prerequisites: Node.js 18+, npm, a GitHub OAuth app, an X OAuth 2.0 app, and a Gemini API key.

```bash
git clone https://github.com/aayushman-singh/gitlogs.git
cd gitlogs
npm run setup
cp .env.example .env
# Fill in the required .env values listed below.
npm run build
npm start
```

For local single-process runs, the backend can serve the built Vite app from `frontend/dist`, so `npm run setup` installs both root and frontend dependencies, and `npm run build` must run before `npm start`. Production deploys split this: Vercel serves the frontend, and EC2 serves the API.
If you change `PORT`, update `FRONTEND_URL`, `API_BASE_URL`, `VITE_API_BASE`, and `OAUTH_CALLBACK_URL` to the same host and port before building.

Required `.env` values for the full local flow:

| Variable | Purpose |
| --- | --- |
| `FRONTEND_URL` | Browser redirect target after OAuth, usually `http://localhost:3000` for the built local app |
| `API_BASE_URL` | Public backend URL used for OAuth callbacks and GitHub webhooks; use `http://localhost:3000` for localhost-only OAuth testing |
| `VITE_API_BASE` | Backend URL baked into the Vite frontend at build time; use the same local URL as `API_BASE_URL` before `npm run build` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth login and repository access |
| `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` | X OAuth 2.0 app credentials for connecting user X accounts |
| `OAUTH_CALLBACK_URL` | X OAuth callback, usually `${API_BASE_URL}/auth/x/callback` |
| `WEBHOOK_SECRET` | Shared secret for GitHub webhook signature verification |
| `GEMINI_API_KEY` | Gemini key used to generate changelog/tweet text |

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/auth/github` | Start GitHub OAuth login |
| `GET` | `/auth/github/callback` | GitHub OAuth callback |
| `GET` | `/auth/x` | Start X OAuth 2.0 PKCE flow (requires GitHub login) |
| `GET` | `/auth/x/callback` | X OAuth callback |
| `POST` | `/auth/logout` | Clear session + stored token |
| `POST` | `/webhook/github` | GitHub push webhook receiver (HMAC-verified) |
| `GET` | `/api/me` | Current user + X connection status |
| `GET` | `/api/me/repos` | User repositories with enabled/OG status |
| `POST` | `/api/me/repos/enable` | Enable a repo (creates the webhook) |
| `POST` | `/api/me/repos/disable` | Disable a repo (removes the webhook) |
| `GET` | `/api/me/templates` | List the user's prompt templates |
| `GET` | `/api/health` | Health check (queue + feature flags) |
| `GET` | `/api/stats` | Queue + system stats (admin, API-key gated) |

A representative subset — the server also exposes template CRUD
(`POST/DELETE /api/me/templates...`), `/api/me/x/disconnect`, and
`/api/me/repos/og-post`. See `src/server.js` for the full route list.

## Testing

```bash
npm run setup    # Install backend and frontend dependencies
npm run dev:all  # Run Express and Vite together
npm run build    # Build frontend/dist for local single-process npm start
npm start        # Serve the local built frontend and API
```

The backend suite (`tests/`) covers a **webhook end-to-end test** (`webhook.e2e.test.js`) — driving a signed push payload through the wired Express app via supertest, including the multi-user per-repo-secret path, signature rejection, and idempotent redelivery — and the **queue mechanics** (`queue.test.js`): retry with exponential backoff and give-up-after-max-retries.

## Architecture

In production, Vercel serves the React SPA and the Express process handles API, OAuth, webhooks, and persistence. For local single-process runs, Express can also serve `frontend/dist`. Full component map, sequence diagrams, ER model, and a candid list of known weaknesses live in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Contributing

1. Fork the repo and create a branch off `main` (`feat/...`, `fix/...`).
2. Make atomic commits with [Conventional Commit](https://www.conventionalcommits.org) messages (`feat:`, `fix:`, `docs:`, ...).
3. Make sure `npm test` passes.
4. Open a pull request describing the change and the user-facing impact.

## Author

Built by [Aayushman Singh](https://aayushman.dev) — engineer building autonomous coding agents. Smart India Hackathon '24 winner.

## License

[MIT](LICENSE)
