# HANDOFF_REVIEW — gitlogs (adversarial restyle review + fix, push to main)

You are the per-repo fix orchestrator for `gitlogs` (React 18 + Vite SPA; auto-tweets commit changelogs; `/demo` is keyless+offline). Current `origin/main` carries the "GitLogs design-handoff system + light/dark theming" restyle (commit ddfb321). No V4 feature work here. Run fully autonomously.

## Mission
Adversarially review the restyle on main. Run `codex exec --skip-git-repo-check "brutal senior review of this frontend restyle — broken routes/handlers, lost interactive elements/states, a11y/contrast regressions, did /demo stay keyless+offline (zero network), are feature-flag-gated surfaces still off, tweet 280-char counters intact. Terse."` on the restyle diff (`git diff 756bf8e..ddfb321` or the design-handoff commits). Then FIX any real regression/gap found:
- `/demo` must stay keyless + offline (zero network calls).
- All routes + interactive elements + the tweet token/counter behavior preserved.
- Feature-flagged surfaces (scheduling, post-settings) stay OFF.

## Rules
- No fallbacks — fail loud. Build + any tests green before push. **Push to main** (owner authorized).
- Fix real issues only — no scope creep, no new features. Write `REVIEW_SUMMARY.md`. Decide, don't block. Go.
</content>
