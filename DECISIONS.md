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

## 2026-06-08 — V2 (go big: make the AI pipeline impressive)

Per HANDOFF_V2 discovery protocol. Phase 1 closed credibility gaps; V2 makes the
product itself impressive. Brainstorm + scoring (a = improves real auto-tweet
quality, b = wow-for-hire, c = feasible in one session; 1-5 each):

| Candidate | a | b | c | notes |
|---|---|---|---|---|
| **Commit Intelligence layer** (worthiness scoring, noise-kill, grouping, rationale) | 5 | 5 | 5 | pipeline currently tweets EVERY non-merge commit → spam; deciding *what's worth saying* is the biggest real quality lever and is observable |
| **Prompt/triage eval harness** (golden corpus + precision/recall) | 4 | 5 | 4 | evaluation rigor = the strongest hire signal; proves the intelligence layer works; runs offline/keyless |
| Persona prompts (real backend, side-by-side) | 3 | 4 | 4 | partly represented in /demo already (canned toggle); tone variety doesn't fix "what to tweet" |
| Recursive self-host static feed | 1 | 3 | 3 | presentation only; clearly faked without a real account |
| Observable pipeline trace object/API | 3 | 4 | 3 | folded INTO Commit Intelligence (the triage IS the trace) |

**Decision: ship Commit Intelligence (F1) + its Eval Harness (F2)** — a coherent
1-2 punch that directly raises real auto-tweet quality AND demonstrates eval
rigor. Both are **deterministic-core** (no LLM, no API keys) so they run in CI,
in tests, and in the keyless /demo — which also fits the no-fallback rule (these
are the real engines, not degraded shims).

- **F1 `src/commitIntelligence.js`:** `scoreCommit(commit)` → {score 0-100,
  worthy, signals[], rationale}; `groupRelatedCommits(commits)`; `triagePush()`.
  Deterministic signals: conventional-commit type weighting, noise patterns
  (lockfile/deps-only, merges, version bumps, wip/typo/formatting), substance
  (files touched, source vs config/asset, message specificity). Pipeline skips
  sub-threshold commits (`COMMIT_MIN_SCORE`, default 40) and LOGS each skip with
  rationale (observable, never silent). Surfaced in /demo as a "triage" stage.
- **F2 eval harness:** `eval/golden-commits.json` labeled corpus + `eval/run-eval.js`
  (`pnpm eval`) → precision/recall/accuracy of the worthiness classifier vs labels,
  with per-case rationale. Documents an optional LLM-judge mode for keyed runs.

### V2 codex review applied (codex/2026-06-08-v2.md)
- **Blocker — triage ordering:** moved commit triage BEFORE `getOrGenerateRepoContext`
  so a noise-only push does zero repo-index/diff/AI work; context is generated only
  when ≥1 worthy commit exists.
- **Blocker — config validation:** `COMMIT_MIN_SCORE` is now strictly parsed (integer
  0-100) and fails startup loudly; an invalid value used to become `NaN` and silently
  stop all tweeting.
- **High — commit identity:** triage rows now carry the full SHA (`id`); the worthy
  filter joins on full SHA, not a 7-char prefix `startsWith` (collision-safe).
- **High — response counts reconcile:** response reports `total` (= non-merge
  considered, original meaning) plus `triage.{totalCommits, merges, considered,
  worthy, skipped}` which now add up.
- **High — dead grouping removed:** `groupRelatedCommits` was never wired into posting
  and its file-overlap claim didn't match the data. Removed it (backend + demo mirror +
  test) rather than ship dead/misleading code. Thread-grouping of related commits is a
  real future feature (needs changes to the posting path) — deferred, not faked.
- **High — no silent coercion:** `scoreCommit`/`triagePush`/`allFiles` now throw on
  malformed input (non-object commit, non-string id/message, non-array file lists)
  instead of treating null/missing as `[]`.
- **Medium — drift guard:** added `tests/triage-parity.test.js` asserting the browser
  ESM port produces byte-identical score/verdict/rationale to the backend over the
  whole golden corpus.
- **Medium — eval gate:** `pnpm eval` now gates on precision/recall/F1 (each ≥ 0.85),
  not accuracy alone; removed the roadmap-comment-as-code block.
- **Naming:** stripped "REAL/impressive" hype from comments. Kept `commitIntelligence`/
  `worthy`/`skipped` as deliberate, clear domain terms (a full rename to
  `tweetEligibility` would be churn across tested+demoed code for marginal gain).

#### Future opt-in LLM-judge eval (documented seam, intentionally NOT built)
A tweet-*quality* eval (vs the current worthiness-*classification* eval) would: add a
`goldenTweet` + `diff` to each worthy corpus row; activate only with `GEMINI_API_KEY`
set AND an explicit `--judge` flag (no key ⇒ today's offline behavior, unchanged);
feed (commit, diff) to the real diff→tweet generator; send {diff, goldenTweet,
generatedTweet} to an LLM judge (temp 0, pinned model) scoring factual accuracy /
specificity / no-hallucinated-numbers / tone / ≤280 chars; fail loudly on missing key
or judge error. No network code ships today.
