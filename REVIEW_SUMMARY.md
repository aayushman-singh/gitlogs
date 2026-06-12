# Restyle Review Summary

## Required Codex Review Evidence

Ran the required command from `c:/Repo/gitlogs`:

```powershell
codex exec --skip-git-repo-check "brutal senior review of this frontend restyle — broken routes/handlers, lost interactive elements/states, a11y/contrast regressions, did /demo stay keyless+offline (zero network), are feature-flag-gated surfaces still off, tweet 280-char counters intact. Terse."
```

Output was saved to `codex-restyle-review.txt`.

The nested Codex process started, inspected some repo state, then lost shell/browser access with `windows sandbox: spawn setup refresh`; its browser/local-file alternatives were also canceled. Because that run could not complete a trustworthy inspection, the rest of this review is the required fallback:

## Explicit Diff-Only No-Tools Review

Reviewed `git diff 756bf8e..ddfb321`. Restyle touched only:

- `frontend/index.html`
- `frontend/src/components/Header.jsx`
- `frontend/src/styles.css`

Findings and actions:

- `/demo` offline/keyless gap: the restyled global CSS imported Google Fonts, creating an external request on every route including `/demo`. Fixed by removing the external `@import` and adding a regression test that rejects external CSS resources.
- Mobile header regression: the new theme toggle made the unauthenticated header overflow at 375px, pushing the GitHub login control off-screen. Fixed by making the header login button icon-sized at `max-width: 520px` while preserving its accessible label.
- Routes/handlers: route table unchanged; `/demo`, `/dashboard`, `/auth/callback`, `/privacy`, `/terms`, and `/admin` redirect remain wired. Demo commit/persona buttons and theme toggle were manually exercised.
- Feature-flagged surfaces: scheduling tab remains absent by default; post-settings panel remains gated behind `VITE_FEATURE_POST_SETTINGS === 'true'`. Browser text check on `/demo` found no schedule/post-settings surfaces.
- Tweet counters: `/demo` still renders live `n/280` counters and preserves the `.is-over` path for oversized text.

## Verification

- `npx vitest run tests/frontend-offline.test.js` failed before fixes on the Google Fonts import, then passed after fixes: 2 tests passed.
- Production preview `/demo` with Playwright:
  - Desktop: commit/persona state changed correctly; counter observed as `236/280`; no console warnings/errors.
  - Network: only same-origin page/assets were requested; no backend, Google Fonts, or other external requests.
  - Mobile 375px: header controls fit; measured `bodyScrollWidth=361`, `innerWidth=375`, `navRight=352.57`.
- `npx vitest run`: 6 test files passed, 27 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed with existing CRLF normalization warnings only.

No lint command is configured in `package.json`.

## Residual Risks

- Authenticated dashboard flows were not exercised against a live logged-in backend session; source review covered the relevant feature flags.
- External social/footer links still exist as intentional links, but they are not fetched during `/demo` render or interaction.
