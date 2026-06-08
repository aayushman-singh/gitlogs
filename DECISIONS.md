# DECISIONS — gitlogs autonomous orchestration

Append-only log of calls made without blocking the user (per HANDOFF rule 1).
Format: `[YYYY-MM-DD] PHASE.step — decision — rationale`.

## 2026-06-08

- **[Security] HANDOFF premise corrected.** HANDOFF rule 8 + recon claim `.env` is
  committed with real secrets. **Verified false:** `git log --all -- .env` is empty;
  the only env file ever committed is `.env.example`. `.env` and `frontend/.env` are
  correctly git-ignored and were never in history. **No git history rewrite needed.**
- **[Security] Real leak found in `.env.example`.** The committed `.env.example`
  contained partially-redacted but recognizable **real** X OAuth `OAUTH_CLIENT_ID` /
  `OAUTH_CLIENT_SECRET` (prefix+suffix of the live values). Decision: scrub to true
  placeholders immediately. This is the actual credential-leak surface, not `.env`.
- **[Security] Live secrets on disk in `.env` require rotation — BLOCKED ON USER.**
  `.env` (gitignored, on disk only) holds live: Gemini API key, full Twitter/X API
  key+secret+bearer+access tokens, Cloudflare API token, X OAuth client secret,
  GitHub OAuth client secret, admin API key. These are NOT leaked via git, but exist
  in plaintext on the dev machine and were shared in this repo context. Recommend the
  user rotate all of them. Listed in SESSION_SUMMARY "Blocked on user". I will never
  copy these into any committed file.
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
