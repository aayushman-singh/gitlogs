# STATE — gitlogs orchestration

Read this first on resume. Updated as phases complete.

- **Current phase:** DONE — all of A, B, C complete. SESSION_SUMMARY.md written.
- **Last completed step:** C5 — Phase C codex review applied (codex/2026-06-08-phaseC.md)
- **Next step:** (none — session complete). Blocked-on-user items are in SESSION_SUMMARY.md.

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
- [x] B1 vitest E2E  - [x] B2 CI  - [x] B3 deploy wf  - [x] B4 ARCHITECTURE  - [x] B5 codex
- [x] C1 /demo  - [x] C2 README  - [x] C3 deploy demo  - [x] C4 RUNBOOK  - [x] C5 codex
- [x] SESSION_SUMMARY.md
