# STATE — gitlogs orchestration

Read this first on resume. Updated as phases complete.

- **Current phase:** B — Harden
- **Last completed step:** A7 — Phase A codex review applied (codex/2026-06-08-phaseA.md)
- **Next step:** B1 — Vitest + supertest backend E2E

## Environment facts (verified 2026-06-08)
- pnpm 11.1.3, node v25.2.1, codex-cli 0.135.0 all present.
- Clean-clone reproducibility holds: `pnpm install --frozen-lockfile && pnpm build` pass
  at root and in `frontend/` (esbuild allowlisted via frontend/pnpm-workspace.yaml
  `allowBuilds: esbuild: true`).
- `.env` never committed. `.env.example` scrubbed of real creds.
- `tweets.db` (git-ignored) seeded via `pnpm seed` → 163840 bytes, 10 users / 5 repos /
  30 tweets / 3 tokens. Schema authority: `src/database.js`. tweets table extended with
  tweet_text/status/author + additive PRAGMA migration; new strict `saveTweetRecord`.
- Backend app (`src/server.js`) is NOT exported and calls `app.listen()` at import +
  installs signal handlers → must refactor for supertest in B1 (export app, gate listen
  behind `require.main === module`).
- Stub seams for E2E (B1): module-mock geminiClient, twitterClient, diffAnalyzer
  (all reached as singletons). Set WEBHOOK_SECRET so HMAC runs for real.
- Webhook route: POST `/webhook/github` → `webhookHandler.handleWebhook`; raw body on
  `req.rawBody`; HMAC header `x-hub-signature-256`. NOTE: HMAC fails OPEN when no secret
  configured (webhookHandler.js:32-35) — a fallback to fix/negative-test in B.
- Deploy workflow (.github/workflows/deploy-ec2.yml) does bare `pnpm i` + restart, NO
  frontend build → B3 fixes it (frozen install + frontend build → frontend/dist).

## Known follow-ups (noted, not yet done)
- database.js still has the broad `catch → return sentinel` pattern and a file-based
  OAuth-token fallback (database.js:10) that contradict the no-fallback rule. Left as a
  separate refactor (pre-existing, working code; out of A7's codex-finding scope).
- Startup should reject placeholder secret values loudly (codex P2) — candidate for B.

## Phase checklist
- [x] A1 security scrub  - [x] A2 lockfile  - [x] A3 LICENSE  - [x] A4 api.js
- [x] A5 feature-flags + admin.html  - [x] A6 seed db  - [x] A7 codex review
- [ ] B1 vitest E2E  - [ ] B2 CI  - [ ] B3 deploy wf  - [ ] B4 ARCHITECTURE  - [ ] B5 codex
- [ ] C1 /demo  - [ ] C2 README  - [ ] C3 deploy demo  - [ ] C4 RUNBOOK  - [ ] C5 codex
- [ ] SESSION_SUMMARY.md
