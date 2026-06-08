# HANDOFF — gitlogs

You are the per-repo orchestrator for `gitlogs`. You are running in a Claude Code session that was opened in `c:/Repo/gitlogs`. Your job is to take this repo from current state to portfolio-hire-ready, fully autonomously. The user (Aayushman) is hands-off.

## Hard rules (do NOT violate)
1. **Never block on the user.** When unsure, pick the more ambitious option and write the call into `DECISIONS.md`. Bias toward bigger swings — scope is not a constraint.
2. **Deploy boundary:** deploy live ONLY if cheap+keyless. For gitlogs the prod stack is keyed (GitHub OAuth, X OAuth, Gemini). Build a **demo-mode** branch that stubs OAuth + replays fixture commits → that goes live on Vercel/Cloudflare Pages. The keyed prod path stops at one-command deployable with templated secrets in `RUNBOOK.md`.
3. **Codex review:** after each large refactor (NOT every commit), run `codex exec "review this diff as a senior engineer with no patience for excuses. Find architectural problems, security holes, untested edge cases, naming smell, dead code. Be brutal. No praise."` Pipe the diff: `git diff <base>..HEAD | codex exec ...`. Save raw output to `codex/<timestamp>.md`. Apply the criticisms in a follow-up commit.
4. **State persistence:** maintain `STATE.md` (current phase, last completed step, next step). On resume, read it first.
5. **Backend E2E tests are required.** Add Vitest + supertest + a webhook fixture. Frontend tests nice to have.
6. **Use subagents aggressively.** Spawn `Explore`, `general-purpose`, or `cavecrew-investigator` in parallel for independent work (e.g. simultaneously: prune dead code, write README, add fixtures).
7. **No fallbacks.** Per user's standing preference, no silent error swallowing, no degraded-mode shims. Fail loudly with rich logs.
8. **Never re-expose secrets.** `.env` is committed with real OAuth secrets — your FIRST action is to verify rotation status and ensure no commit re-leaks them.
9. **End-of-session:** write `SESSION_SUMMARY.md` with (a) what changed, (b) what's blocked on user, (c) deploy state.

## Mission
Resurrect gitlogs as a credible AI-pipeline portfolio piece. The product itself (auto-tweet changelogs from GitHub webhooks via Gemini) is interesting; the execution gaps (dead DNS, empty DB, stubbed routes, missing lockfile) tell a reviewer "abandoned." Close every credibility gap, ship a public `/demo` route a recruiter can poke without OAuth, recursively self-host so this very repo's commits become live tweets at `@gitlogs_demo` (or similar).

## Success criteria (observable)
- Recruiter clicks a `/demo` link, sees the AI pipeline end-to-end with seeded fixtures — no login required.
- README shows architecture diagram, embedded GIF/demo loop, example generated tweet, working LICENSE.
- `pnpm install && pnpm dev` works on a clean clone (lockfile committed, sql.js installed).
- 50+ real auto-posts visible on a real X account, driven by this repo's own commits.
- Backend E2E test exercises GitHub webhook → Gemini stub → queue → X stub.
- `codex` review pass committed in `codex/`.

## Repo recon (frozen 2026-06-08)

### What this is
GitLogs auto-posts AI-generated tweet changelogs to X/Twitter whenever a developer pushes commits to GitHub-connected repos. Multi-user OAuth product with webhooks, Gemini diff summarization, queue persistence, and a React dashboard.

### Stack
- **Backend:** Node.js >=18, Express 4, sql.js (WASM SQLite), @google/generative-ai, twitter-api-sdk, cookie-parser, cors
- **Frontend:** React 18, Vite 5, react-router 6, PrimeReact, react-icons
- **Auth/integrations:** GitHub OAuth2, X OAuth2 PKCE, GitHub webhook HMAC verification
- **Infra:** EC2 + systemd (`.github/workflows/deploy-ec2.yml`), `frontend/vercel.json` SPA rewrites
- **Windows quirks:** scripts use bare `cd frontend && ...`; `pnpm-lock.yaml` git-ignored so installs non-reproducible

### Current state
**Works:** `npm run build` passes; `/api/health` returns 200; SPA shell + Home/Privacy/Terms routes; OAuth handlers; webhook signature verify + Gemini changelog pipeline (`src/webhookHandler.js`, 423 LOC); template CRUD; queue service (`src/queueService.js`, 560 LOC).
**Broken:** `gitlogs.aayushman.dev` and `api-gitlogs.aayushman.dev` are NXDOMAIN — public demo dead. Frontend hardcodes API host (`frontend/src/utils/api.js:11`). `sql.js` missing from installed `node_modules`. `tweets.db` is **0 bytes**.
**Half-built:** `ScheduleTab.jsx` calls `/api/me/schedule` (no such route); `Customisation.jsx` references undeclared `postSettings`/`setPostSettings` state, hits `/api/me/post-settings` (no such route); `/admin` redirected but `public/admin.html` still ships; Footer Docs link `href="#"`; `.env.example` has duplicate `GEMINI_API_KEY`, missing `GITHUB_CLIENT_ID/SECRET`, and literal `OAUTH_CALLBACK_URL= or PORT`; no `LICENSE` file despite README MIT badge.

### Maturity score
- Code quality: 6/10 — sizable, organized modules (server 1222 LOC, db 1187 LOC); no linter, no types
- Test coverage: 1/10 — only stub scripts in package.json, no framework
- Docs: 3/10 — README thin/dishonest about setup; no architecture; `docs/` empty
- Deploy-readiness: 2/10 — DNS dead, deploy workflow doesn't build frontend, lockfile ignored
- Demo-readiness: 1/10 — live URL dead, empty DB, no screenshots, OAuth-gated UX

### Risks
- `tweets.db` is **0 bytes** — schema lives only in `src/database.js:1187`. Seed it.
- `.env` is committed (1905 bytes) with real OAuth secrets — must rotate first, NEVER commit fixes that re-expose.
- `pnpm-lock.yaml` git-ignored: installs may pull different versions than what last worked.
- Hardcoded prod API host in `frontend/src/utils/api.js:11` — local dev silently calls dead remote unless overridden.
- `node_modules/` exists but missing `sql.js`; reinstall before running.
- `public/admin.html` is a dead path SPA-redirected away — don't mistake for live admin.
- `docs/` and `scripts/` are **empty** — don't waste cycles searching.
- No test runner; `npm test` fails silently.

## Plan

### Phase A — Stabilize (S/M)
1. Audit `.env` for committed secrets. Document rotation needs in `DECISIONS.md` and prepare to rotate keys at user-review time. Remove `.env` from index; add to `.gitignore` if missing; verify `.env.example` is honest (fix duplicate `GEMINI_API_KEY`, malformed `OAUTH_CALLBACK_URL=` line).
2. Make `pnpm-lock.yaml` committed. Remove from `.gitignore`. Run `pnpm i` cleanly, ensure `sql.js` installed.
3. Add `LICENSE` (MIT, matching README badge).
4. Fix `frontend/src/utils/api.js:11` to read from `import.meta.env.VITE_API_BASE` with sensible local default.
5. Hide `ScheduleTab.jsx` and the post-settings panel of `Customisation.jsx` behind a feature flag until backend exists. Remove `public/admin.html`.
6. Seed `tweets.db` with realistic fixtures (10 users, 30 generated tweets across 5 fictional repos).
7. **Codex review checkpoint** — diff Phase A, brutal review, apply criticisms.

### Phase B — Harden (M)
1. Add Vitest. Backend E2E test: GitHub webhook payload → Gemini stub → queue → X stub → assert. Frontend smoke tests if cheap.
2. Add GitHub Actions CI: lint + test + build on PR.
3. Fix deploy workflow so it builds the frontend before restarting the backend service.
4. Document architecture in `docs/ARCHITECTURE.md` — sequence diagram of webhook → HMAC verify → queue → diff analyzer → Gemini → X with retry logic.
5. **Codex review checkpoint** — diff Phase B, brutal review, apply criticisms.

### Phase C — Polish + demo (M/L)
1. Build `/demo` route — read-only public path that pulls from seeded fixtures and shows: real diff → Gemini prompt template → generated thread side-by-side. Include "regenerate with different persona" toggle reading from preset templates.
2. README rewrite: real quick-start, architecture diagram (Mermaid + PNG export), embedded GIF/screencast, sample generated tweet, contribution guide.
3. Deploy demo branch to Cloudflare Pages or Vercel (keyless — uses fixture data only). Update README with live URL.
4. Document the keyed prod path in `RUNBOOK.md` with templated secrets.
5. **Codex review checkpoint** — diff Phase C, brutal review, apply criticisms.
6. Write `SESSION_SUMMARY.md`.

## End-of-session output (REQUIRED)
Write `SESSION_SUMMARY.md` with:
- **What changed** — file/area-level summary
- **Blocked on user** — list every item that needs a human (rotate OAuth secrets, point DNS at new host, create real `@gitlogs_demo` X account if you want recursive self-host, set GA/posthog if telemetry desired)
- **Deploy state** — one of: `local-only` / `deployable, runbook ready` / `live at <URL>`
- **Codex feedback log** — link to `codex/` directory with raw review outputs

## Start
Read `STATE.md` if it exists, otherwise create it and begin Phase A step 1. Go.
