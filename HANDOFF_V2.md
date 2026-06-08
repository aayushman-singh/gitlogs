# HANDOFF V2 — gitlogs: go big

You are resuming the same session that finished Phase 1 portfolio-hardening. You shipped: scrubbed `.env.example` (it had real OAuth client material!), committed pnpm lockfile, regenerated stale root lock (fixed the `sql.js` "missing" mystery), added LICENSE, made `api.js` env-driven, 17 atomic commits across 3 phases each gated by codex review. `SESSION_SUMMARY.md` is written. **Don't redo any of that.**

## New mission
Phase 1 closed credibility gaps. Phase 2 makes the product itself impressive. The AI-pipeline thesis is the strongest hook this repo has — make it undeniable. Pick 1–2 features that turn this from "auto-tweeter that works" into "the prompt engineering on this is *seriously* good."

## Discovery protocol
1. Re-read `SESSION_SUMMARY.md` + `DECISIONS.md`.
2. Brainstorm 5+ candidates spanning: prompt engineering depth, observable AI pipeline, social/network effects, evaluation rigor.
3. Score: (a) **does it materially improve real auto-tweet quality**, (b) **wow for hire**, (c) **feasible in one session**.
4. Document in `DECISIONS.md`.
5. Ship.

## Sparks (not orders)
- **Public `/demo` route** with OAuth stubbed + a fixture commit replay — currently OAuth-gated; this is the highest-leverage gap to close.
- **Persona prompts** — Owner picks a tone (technical/snarky/marketing/casual), each tone has its own prompt template; show side-by-side outputs in `/demo`.
- **Diff intelligence layer** — pre-Gemini summarizer that picks WHICH commits are tweet-worthy (kill noise commits, group related ones), shows scoring rationale.
- **Recursive self-hosting** — wire this very repo as a gitlogs user; show its own auto-tweets on the landing page (the `@gitlogs_demo` X account idea from v1's recon). Needs a real account but you can fake it via a static feed for now.
- **Prompt eval harness** — golden-pair of (diff → tweet) corpus, score generated tweets via LLM judge, track score over prompt revisions.

## Operating rules (unchanged)
- Decide-don't-block. Bias ambitious.
- No fallbacks.
- Codex review per refactor.
- Subagents in parallel.

## End-of-session output
Write `SESSION_SUMMARY_V2.md`. Append to `DECISIONS.md`.

## Start
Go big. Go.
