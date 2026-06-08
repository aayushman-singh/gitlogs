# GitLogs

**Turn `git push` into a published changelog tweet.** Sign in with GitHub, link your X account, enable a repo — every push then fires a webhook, Gemini summarizes the real diff, and a changelog post lands on your own X timeline. No manual tweeting, no abandoned changelog.

[![License: MIT](https://img.shields.io/badge/License-MIT-c8693d?style=flat)](LICENSE)
[![Demo: /demo (no login)](https://img.shields.io/badge/Demo-%2Fdemo%20(no%20login)-3fb950?style=flat)](#see-it-in-30-seconds)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-1f6feb?style=flat)](package.json)

---

## Why

Developers ship constantly but rarely tell anyone. Manual tweeting kills momentum; abandoned changelogs kill discoverability. GitLogs closes the loop — you push code, the world hears about it. Gemini turns raw diffs into reader-friendly prose grounded in what actually changed, and webhooks fire the whole thing on every commit.

## See it in 30 seconds

There's a **keyless `/demo` route** — no GitHub, no X, no API keys. It replays bundled commit fixtures through the real pipeline shape entirely client-side: a commit + diff become an interpolated Gemini prompt, which becomes a generated changelog post. A persona toggle (Professional / Hype / Deadpan Technical) re-renders the prompt and output so you can see the prompt engineering, not just the result.

Run it locally:

```bash
pnpm setup && pnpm dev:all
# then open http://localhost:5173/demo
```

A hosted demo link is pending deployment — see the **Demo** badge above once it's live.

### Example output

A real generated post from the demo fixtures, for commit `a1b2c3d` on `octo-dev/payments-api` (`feat: idempotency keys on POST /charges`), in the **Professional** persona:

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

Requires **Node >= 18** and **pnpm**. Windows, macOS, and Linux are all supported (the codebase is developed on Windows). Lockfiles are committed (root + `frontend/`) for reproducible installs.

```bash
git clone https://github.com/aayushman-singh/git-twitter-bot.git gitlogs
cd gitlogs

pnpm setup            # install backend + frontend deps
cp .env.example .env  # fill in your keys (see Configuration)
pnpm seed             # populate a demo SQLite db with fixtures
pnpm dev:all          # backend (nodemon) + Vite dev server together
```

Then open the dashboard at `http://localhost:5173` or the keyless demo at `http://localhost:5173/demo`.

```bash
pnpm test             # run the Vitest backend suite
pnpm build            # build the SPA to frontend/dist
```

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 18 · Vite 5 · PrimeReact · React Router |
| Backend | Node.js · Express 4 |
| Datastore | SQLite via [sql.js](https://sql.js.org) (WASM, single-file) |
| AI | Google Gemini — two-stage diff analysis + changelog generation |
| Auth | GitHub OAuth2 (login + webhook control) · X OAuth 2.0 with PKCE (posting) |

The backend is a single Express process that also serves the built SPA from `frontend/dist` in production.

## Configuration

Copy `.env.example` to `.env` and fill in real values — every value in the example is a placeholder. The key groups:

- **GitHub OAuth** — `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (create an OAuth app at github.com/settings/developers).
- **Webhook secret** — `WEBHOOK_SECRET`. **Do not skip this.** Signature verification fails *closed*: with no secret configured, every incoming webhook is rejected rather than trusted. Generate one with `openssl rand -hex 20`.
- **X OAuth 2.0** — `OAUTH_CLIENT_ID` (required), `OAUTH_CLIENT_SECRET` (optional, enables confidential-client mode), `OAUTH_CALLBACK_URL`.
- **Gemini** — `GEMINI_API_KEY`, `GEMINI_MODEL` (default in the example is `gemini-2.5-flash`). Get a key at aistudio.google.com/app/apikey.
- **Server** — `PORT`, `FRONTEND_URL`, `API_BASE_URL`, `DATABASE_PATH`, `ADMIN_API_KEY` (gates the `/api/*` admin routes), plus optional queue/rate-limit tuning (`QUEUE_MAX_RPM`, `QUEUE_MAX_RETRIES`, ...).

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

## Testing

```bash
pnpm test        # one-shot Vitest run
pnpm test:watch  # watch mode
```

The backend suite (`tests/`) covers a **webhook end-to-end test** (`webhook.e2e.test.js`) — driving a signed push payload through the wired Express app via supertest — and the **queue mechanics** (`queue.test.js`): rate limiting, retry/backoff, and restart persistence.

## Architecture

A single Express process serves the React SPA, terminates both OAuth flows, verifies and processes webhooks, and persists everything to a single-file sql.js database. Full component map, sequence diagrams, ER model, and a candid list of known weaknesses live in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Contributing

1. Fork the repo and create a branch off `main` (`feat/...`, `fix/...`).
2. Make atomic commits with [Conventional Commit](https://www.conventionalcommits.org) messages (`feat:`, `fix:`, `docs:`, ...).
3. Make sure `pnpm test` passes.
4. Open a pull request describing the change and the user-facing impact.

## Author

Built by [Aayushman Singh](https://aayushman.dev) — engineer building autonomous coding agents. Smart India Hackathon '24 winner.

## License

[MIT](LICENSE)
