# DECISIONS — gitlogs autonomous orchestration

Append-only log of calls made without blocking the user (per HANDOFF rule 1).
Format: `[YYYY-MM-DD] PHASE.step — decision — rationale`.

## 2026-06-08

- **[Security] HANDOFF premise corrected.** HANDOFF rule 8 + recon claim `.env` is
  committed with real secrets. **Verified false:** `git log --all -- .env` is empty;
  the only env file ever committed is `.env.example`. `.env` and `frontend/.env` are
  correctly git-ignored and were never in history. **No git history rewrite needed.**
- **[Security] Real leak found in `.env.example`.** The committed `.env.example`
  contained recognizable **real** OAuth client credential material. Decision: scrub
  to true placeholders immediately. This was the actual credential-leak surface, not
  `.env`. (Specifics intentionally not enumerated in this committed file.)
- **[Security] Local `.env` secrets require rotation — BLOCKED ON USER.** The local
  (git-ignored, never-committed) `.env` holds live credentials that should be rotated
  as a precaution. Details are intentionally NOT enumerated here; see the private
  rotation checklist surfaced to the user. No real secret is ever copied into any
  committed file.
- **[A2] Commit `pnpm-lock.yaml`.** HANDOFF + global rule favor reproducible installs.
  Un-ignoring root + frontend lockfiles. Removing `package-lock.json`/`yarn.lock`
  ignore lines is out of scope; pnpm is the chosen package manager (lockfiles present).
- **[A3] License = MIT.** README carries an MIT badge; matching it is the honest move.
  Copyright holder "Aayushman Singh" (git author + README author credit).
- **[A5] Feature-flag, don't delete, half-built UI.** `ScheduleTab` and the
  post-settings panel hit non-existent routes. Decision: gate behind a build-time
  feature flag (`VITE_FEATURE_SCHEDULING` / `VITE_FEATURE_POST_SETTINGS`, default off)
  rather than delete — preserves the work, removes the broken UX. `public/admin.html`
  is a genuinely dead SPA-redirected path → delete.
- **[A6] Seed DB = deterministic fixture generator, not hand-rolled binary.** Write a
  committed `scripts/seed.js` that builds `tweets.db` from `src/database.js`'s own
  schema so the fixtures stay in sync with the real schema. 10 fictional users, 5
  fictional repos, 30 generated tweets. No real PII.
- **[Demo] Demo will be keyless + fixture-replayed** per HANDOFF rule 2. The keyed
  prod path stops at one-command-deployable with templated secrets in RUNBOOK.md.

### A7 — Phase A codex review applied (codex/2026-06-08-phaseA.md)
- **P0 seed destructiveness** → added `assertSafeToSeed()` (refuses NODE_ENV=production)
  + loud DESTRUCTIVE log before wiping the DB.
- **P1 prod API base fallback** → `getBackendUrl()` now THROWS in production builds when
  `VITE_API_BASE` is unset (dev still defaults to localhost). No silent localhost in prod.
- **P1 seed not representative** → extended `tweets` schema (tweet_text/status/author)
  with an additive PRAGMA-driven migration; added strict `saveTweetRecord` that persists
  the full record and FAILS LOUDLY on duplicate commit_sha (no INSERT OR IGNORE). Seed
  now writes rich records and verifies persisted count == fixture count.
- **P1 committed secret inventory** → scrubbed DECISIONS.md so it no longer enumerates
  which live secrets exist or that they were exposed.
- **P2 incomplete admin removal** → deleted the orphaned `public/js/admin-react.js`
  bundle (only referenced the already-deleted /admin.html).
- **P2 stale STATE.md** → STATE.md now tracks real progress.
- **P2 ALLOWED_REPOS placeholder** → defaulted to empty in `.env.example` so a fresh
  setup doesn't silently reject real webhooks.
- **Deferred (not codex-P0..P3 for this diff):** database.js's broad catch→sentinel
  pattern + file-based OAuth fallback (pre-existing, working code; would be an unrelated
  refactor). Startup placeholder-secret rejection (P2) → candidate for Phase B.
