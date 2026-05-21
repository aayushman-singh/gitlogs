# Recon - GitLogs

## Elevator pitch

GitLogs turns GitHub commits into AI-written social updates and posts them to X automatically. A developer signs in with GitHub, connects X, enables repositories, and GitHub webhooks trigger Gemini-generated commit posts. The strongest hireability angle is a real automation product with OAuth, webhooks, AI summarization, queues, and a dashboard, but the public demo and several visible dashboard surfaces need tightening.

## Live state

- Build: pass
  - `npm.cmd run build` completed successfully; Vite transformed 57 modules and built `frontend/dist` in about 2.46s.
- Local dev: fail / partial
  - Plain `npm.cmd run dev` failed in this sandbox with `EPERM` reading `node_modules\.pnpm\semver@7.7.3\node_modules\semver\index.js`.
  - Direct `node src/server.js` probe on port 3100 returned `200` for `/api/health` and served HTML for `/`, but the process exited nonzero after logging `Database initialization failed: Cannot find module 'sql.js'`.
- Deployed URL: `https://gitlogs.aayushman.dev`
- Deployed state: broken
  - `Resolve-DnsName gitlogs.aayushman.dev` and `Resolve-DnsName api-gitlogs.aayushman.dev` both returned DNS name does not exist. The README live badge currently leads to a dead demo.

## What works

- Production frontend build - evidence: `npm.cmd run build` passes and emits `frontend/dist/index.html` plus bundled CSS/JS/assets.
- Backend health route can respond locally - evidence: direct server probe returned `{"status":"healthy","version":"2.0.0",...}` from `/api/health`.
- SPA static serving works after build - evidence: direct server probe returned `200 text/html` for `/` from the built frontend.
- Landing page and route shell are implemented - evidence: `frontend/src/App.jsx` routes `/`, `/dashboard`, `/privacy`, `/terms`; `frontend/src/pages/Home.jsx` has branded hero, benefits, setup steps, and dashboard image.
- GitHub OAuth, repo listing, repo enable/disable, and webhook creation code paths exist - evidence: `src/server.js` exposes `/auth/github`, `/api/me`, `/api/me/repos`, `/api/me/repos/enable`, and `/api/me/repos/disable`.
- X OAuth and per-user token code paths exist - evidence: `src/server.js` exposes `/auth/x`, `/auth/x/callback`, `/api/me/x/disconnect`; `src/twitterClient.js` uses OAuth 2.0 PKCE tokens per user.
- Commit-to-post webhook pipeline exists - evidence: `src/webhookHandler.js` verifies GitHub signatures, filters repos, builds repo context, analyzes diffs, generates Gemini changelog text, and posts to X.
- Prompt template APIs and UI are partially implemented - evidence: `/api/me/templates` routes exist in `src/server.js`, and `frontend/src/components/Customisation.jsx` has preset/custom template editing UI.

## What is broken or half-built

- Dead public demo - evidence: README badge points to `https://gitlogs.aayushman.dev`, but DNS is NXDOMAIN - why it matters: recruiter clicks once, sees nothing, and leaves.
- Production API hostname is also dead - evidence: frontend production code uses `https://api-gitlogs.aayushman.dev`, and that DNS is NXDOMAIN - why it matters: even if the frontend is restored, login/dashboard API calls will fail.
- Fresh local setup is not trustworthy - evidence: README quick start says `npm install` then `npm start`, but frontend dependencies live under `frontend`, `frontend/dist` is ignored, and root start requires a built frontend for the UI - why it matters: an engineer reviewer cannot reliably run the app.
- Package/deploy state is inconsistent - evidence: `.gitignore` ignores `pnpm-lock.yaml` and `package-lock.json`, Git tracks no lockfile, README says npm, deploy workflow runs `pnpm i`, and current `node_modules` is missing `sql.js` despite `package.json` declaring it - why it matters: install failures look amateur and block local review.
- EC2 deploy workflow likely does not publish frontend changes - evidence: `.github/workflows/deploy-ec2.yml` only runs `git pull`, `pnpm i`, and `systemctl restart gitlogs`; it does not build `frontend/dist`, which is ignored - why it matters: the live app can stay stale or missing after pushes.
- Schedule tab is hollow - evidence: `frontend/src/components/ScheduleTab.jsx` calls `/api/me/schedule`, but no matching backend route exists in `src/server.js` - why it matters: a visible product feature fails when clicked.
- Post Settings in Customisation is broken - evidence: `Customisation.jsx` references `postSettings`, `setPostSettings`, `savingSettings`, and `setSavingSettings`, but no state declarations exist; it also calls `/api/me/post-settings`, which has no backend route - why it matters: a visible dashboard tab can crash or fail saves.
- LinkedIn/multi-platform messaging overpromises - evidence: Home says "Multiple platforms" and "Link Social Platforms"; dashboard shows a disabled "Connect to LinkedIn" button marked coming soon - why it matters: hollow product claims reduce trust.
- Admin surface is confusing/unreachable from the SPA - evidence: `App.jsx` redirects `/admin` to `/dashboard`, `Dashboard.jsx` hardcodes `setIsAdmin(false)`, while `public/admin.html` still exists - why it matters: dead/admin-only paths suggest unfinished product wiring.
- README lacks proof of the core flow - evidence: no screenshots, no demo GIF/Loom, no example generated tweet, no architecture diagram - why it matters: recruiters rarely authenticate through OAuth just to understand a project.
- OAuth setup docs are incomplete - evidence: `.env.example` omits `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` even though `/auth/github` requires them, includes duplicate `GEMINI_API_KEY`, and has ambiguous `OAUTH_CALLBACK_URL= or PORT` - why it matters: setup friction makes reviewers assume the app is brittle.
- Footer has a dead Docs link - evidence: `frontend/src/components/Footer.jsx` uses `href="#"` for Docs - why it matters: small visible dead links hurt polish.

## What is missing for hireability

- Working deployed demo - recruiter needs one click to see the product.
- Public proof of the authenticated flow - screenshots, GIF, Loom, or a demo-mode dashboard would prove the app without requiring OAuth.
- Clear "why this is different" artifact - the repo needs to highlight AI diff analysis, webhook automation, queue persistence, and per-user OAuth as senior engineering signals.
- Reliable local run instructions - engineer reviewers need a command path that installs backend/frontend dependencies, builds frontend, and starts the server.
- Deployment status clarity - current repo has Vercel config, EC2 workflow, and hardcoded custom domains; the intended live architecture is not obvious.
- Visible real-use evidence - example posts, queue stats screenshot, or a linked X account feed would make the product feel used, not theoretical.
- Contract cleanup between frontend and backend - visible controls should either work or be hidden until they do.

## Seniority signal verdict

The code reads like an ambitious working-product MVP rather than a junior CRUD tutorial: it has OAuth flows, GitHub webhook verification, X API posting, per-user token handling, retry queues, AI prompt templates, and diff-aware changelog generation. The seniority signal is currently diluted by operations and product-finish issues: dead DNS, incomplete setup docs, ignored lockfiles, frontend/backend contract drift, and visible half-built features. Fixing those will make the project look much more like something a working engineer shipped and maintained.

## Stack

- Language / framework / key libs
  - Backend: Node.js, Express 4, CORS, cookie-parser, sql.js, Google Gemini SDK, twitter-api-sdk.
  - Frontend: React 18, Vite 5, react-router-dom, react-icons, PrimeReact/primeicons.
  - Data/runtime: sql.js-backed SQLite file, local `.env` configuration, GitHub OAuth, X OAuth 2.0 PKCE, GitHub webhooks.
- Deploy target: current or recommended
  - Current clues: README live domain `gitlogs.aayushman.dev`, production API `api-gitlogs.aayushman.dev`, frontend `vercel.json`, and `.github/workflows/deploy-ec2.yml`.
  - Recommended: pick one explicit path. Fastest portfolio fix is Vercel/static frontend plus a managed Node backend on Railway/Fly/Render, or a single EC2 deployment that builds frontend and serves both app/API with correct DNS.

## Backlog - ranked by hire-impact-per-hour

| # | Task | Effort | Impact | Why hireable |
|---|---|---|---|---|
| 1 | Restore public DNS/deploy for `gitlogs.aayushman.dev` and `api-gitlogs.aayushman.dev`; verify `/`, `/dashboard`, and `/api/health` publicly. | S/M | high | Dead demo is the fastest way to lose recruiter attention. |
| 2 | Fix README quick start to use the real setup path, including frontend install/build and required env vars. | S | high | Engineer reviewers can run it locally without guessing. |
| 3 | Normalize package manager and lockfiles: choose npm or pnpm, commit the right lockfile, update deploy workflow, ensure `sql.js` installs. | S/M | high | Reproducible installs are a basic seniority signal. |
| 4 | Fix deployment workflow so pushes build the frontend before restarting/serving the app. | S | high | Prevents the live demo from going stale or serving missing assets. |
| 5 | Hide or fully wire Schedule tab. | S/M | high | Removes a visible broken feature from the authenticated dashboard. |
| 6 | Fix Customisation Post Settings crash and either add `/api/me/post-settings` or remove the settings panel. | S/M | high | Prevents a recruiter/reviewer from clicking into a runtime failure. |
| 7 | Add README screenshots plus a 60-second Loom/GIF of GitHub connect -> repo enable -> generated post. | S | high | Lets recruiters understand the product without OAuth friction. |
| 8 | Add a public demo mode or static sample dashboard using realistic repo/post data. | M | high | Shows the best product surface before login. |
| 9 | Tighten marketing claims around LinkedIn/multiple platforms or make LinkedIn an explicit waitlisted feature. | S | medium | Avoids overpromising and makes the product feel honest. |
| 10 | Add a "How it works" architecture section with GitHub webhook -> queue -> Gemini -> X flow. | S | medium | Makes the nontrivial backend work legible to technical reviewers. |
| 11 | Clean admin routing: either expose a protected admin route intentionally or remove stale `public/admin.html` from the portfolio path. | S/M | medium | Reduces signs of unfinished internal tooling. |
| 12 | Replace footer `Docs` dead link with README/docs route or remove it. | S | medium | Cheap polish win on a visible link. |
| 13 | Add one smoke test or script that verifies build, `/api/health`, and frontend route serving. | M | medium | Gives confidence after deploy fixes without building a large test suite. |
| 14 | Add example generated tweets / linked X feed to README or landing page. | S | medium | Proves real output quality, which is the product's core promise. |

## Recommended dispatch order

1. Task #1 - restore the live demo first; nothing else matters if the recruiter URL is dead.
2. Task #3 - make install/dependency state reproducible so later agents are not fighting environment drift.
3. Task #2 - update run docs immediately after package-manager decisions are made.
4. Task #4 - make deploy match the chosen package/build flow.
5. Task #6 - fix the Customisation tab crash because it is a visible runtime failure.
6. Task #5 - fix or hide Schedule so every visible dashboard tab is honest.
7. Task #7 - add screenshots/Loom once the app is actually working.
8. Task #8 - add demo mode/sample dashboard if OAuth friction remains high.
9. Tasks #9, #10, #12 - polish messaging and docs after core trust is restored.
10. Tasks #11 and #13 - clean internal/admin surface and add a lightweight smoke check.

## Owner answers / decisions

- Deployment target: AWS backend plus Vercel frontend is acceptable.
- Public URL: `gitlogs.aayushman.dev` is still the intended live URL.
- Package manager: prefer pnpm if it stays clean; avoid it if it creates package/install churn.
- Schedule and Post Settings: do not ship them now; hide or defer until the core flow is polished.
- Local `.env` credentials: yes, they are production variables; likely rotate before broader sharing.
- LinkedIn: keep the coming-soon setup.

## Open questions for me to answer before dispatch

- Do you want a public demo mode that bypasses OAuth with sample data?
