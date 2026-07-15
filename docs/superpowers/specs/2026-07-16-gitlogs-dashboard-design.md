# GitLogs Dashboard Design

Date: 2026-07-16

## Product Brief

### Why this exists

GitLogs users need `/dashboard` to feel like an operations console for their automated posting setup. A user should be able to land on the page and immediately know which repositories are posting, whether the posting pipeline is healthy, which social accounts are connected, and what GitLogs recently published.

The change is successful when the Claude Design handoff becomes a truthful product dashboard instead of a visual shell. Every visible status, metric, and recent post must come from the user's account or the system's real state.

### Success Criteria

- An authenticated user sees a dashboard shaped like `GitLogs Dashboard.dc.html`: compact header, stat cards, repository controls, connections, and recent posts.
- The user can enable and disable repositories from the dashboard without losing the current webhook behavior.
- The user can set, update, and view OG posts for repositories from the new dashboard.
- The user can connect to X when disconnected and disconnect X when connected.
- The user can reach the existing customisation workflow from the dashboard.
- The user sees real posts, real queue status, real repo counts, and real connection state.
- Unsupported or failed data is shown as an explicit error state. The dashboard never substitutes sample values, empty defaults, or fabricated metrics.
- Dark and light themes remain available and consistent with the handoff styling.
- Existing unauthenticated login behavior remains intact.

### Non-goals

- Do not redesign the home page, demo page, admin page, privacy page, or terms page.
- Do not introduce static sample repositories, sample recent posts, or sample engagement metrics into the authenticated dashboard.
- Do not replace the existing posting, webhook, template, or X OAuth behavior with a parallel implementation.
- Do not add silent degraded modes for failed backend, GitHub, X, database, or queue reads.
- Do not remove customisation, OG post management, or X disconnect workflows.

### Hard Constraints

- Preserve the user's existing habits around `/dashboard`: it remains the authenticated management surface.
- Preserve the handoff's dashboard structure closely enough that the imported design is recognizable.
- Every dashboard value must be real or explicitly unavailable due to a surfaced error.
- Failures must be loud and actionable, with enough context in logs and UI copy to identify the failed operation.
- Keep implementation scoped to the dashboard experience and the data needed to make it truthful.

## Design Overview

The dashboard becomes a single authenticated operations screen. It uses the handoff's visual hierarchy while keeping the existing product workflows:

- Dashboard-specific header with GitLogs branding, dashboard badge, theme toggle, user identity, logout, and a route to customisation.
- Summary cards for posts this week, enabled repositories, queue status, and average engagement.
- Repository panel with search, sort, pagination, enabled toggles, OG post state, and per-repository actions.
- Connections panel for GitHub, X, and LinkedIn status.
- Recent posts panel sourced from persisted tweet records.
- Customisation surface reachable from the dashboard without removing the existing template editor functionality.

The average engagement card is included only if it is backed by real X data. If X engagement metrics cannot be read with the current account/token/API capabilities, the card displays an explicit unavailable state tied to that exact reason. It must not display a fabricated number.

## System Boundaries

### Nodes

- Dashboard screen: renders the authenticated user experience and owns only presentation state, filters, pagination, and open/closed UI state.
- Dashboard data endpoint: returns the complete initial dashboard model for the signed-in user.
- Repository controls: existing endpoints that enable repositories, disable repositories, and set OG posts.
- Connection controls: existing X OAuth and disconnect endpoints.
- Customisation workflow: existing template and post settings UI, reachable from the new dashboard.
- Persistence store: users, repositories, tweets, OG posts, templates, queue items, and tokens.
- External providers: GitHub for repository metadata and X for account/post capabilities.

### Directed Relations

- Browser requests dashboard model from dashboard data endpoint.
- Dashboard data endpoint reads signed-in identity from session cookies.
- Dashboard data endpoint reads GitHub repositories for the signed-in GitHub user.
- Dashboard data endpoint enriches repositories with local enabled and OG post state.
- Dashboard data endpoint reads persisted tweet records for recent posts and weekly post counts.
- Dashboard data endpoint reads queue state for queue status.
- Dashboard data endpoint reads X connection state from persisted OAuth token data.
- Dashboard data endpoint reads X engagement metrics only when the API capability exists and the user is connected.
- Browser sends repository enable, disable, and OG post mutations to existing repository endpoints.
- Browser sends X disconnect mutations to the existing disconnect endpoint.
- Browser routes to or reveals customisation using existing customisation APIs.

## Data Contract

The dashboard screen needs one coherent response for initial render:

- `user`: display name, GitHub login, avatar, and identifiers already exposed by `/api/me`.
- `connections`: GitHub connected/read-only status, X connected status plus X user details when available, and LinkedIn unavailable status.
- `stats`: posts this week, enabled repo count, total repo count, queue pending/processing status, and average engagement state.
- `repositories`: GitHub repositories enriched with enabled state, OG post id, visibility, description, URLs, updated time, stars, and permissions.
- `recentPosts`: recent persisted tweet records with repository, commit SHA, tweet id, tweet text, author, status, and created time.
- `errors`: explicit structured errors for non-fatal sections that could not be computed.

Section-level errors are allowed only when the rest of the dashboard can still be truthful. For example, an X metrics failure may mark average engagement unavailable while repository controls still render from verified GitHub and database data. A failed required identity, repository, or database read fails the dashboard load.

## UI Behavior

Authenticated users see the dashboard shell from the handoff instead of the current tab-heavy page. The global app header and footer should not visually duplicate the dashboard-specific header on this route.

Repository interactions:

- Search filters by repository full name and description.
- Sort supports recent, name, and enabled status.
- Pagination remains available for users with many repositories.
- Enable and disable actions update the backend first, then refresh or reconcile visible state from the server response.
- OG post editing accepts either a tweet id or a Twitter/X status URL and validates it before sending.
- Existing OG post links open the real X post.

Connection interactions:

- GitHub is shown as connected for authenticated users.
- X shows connect when disconnected and disconnect/manage behavior when connected.
- LinkedIn remains visibly unavailable and non-interactive unless a real integration exists.

Customisation:

- The existing customisation component remains available from the dashboard.
- Moving it into a subview or modal is acceptable if the user can find it from the dashboard header or primary dashboard controls.

Theme:

- The dashboard supports dark and light themes.
- Theme state should remain compatible with the existing app-level theme behavior unless the implementation intentionally migrates storage in one place.

## Failure Handling

The dashboard must not use empty arrays, `null`, or hardcoded defaults to hide failed reads.

Required failures:

- Unauthenticated user: show the existing login flow.
- Failed identity read after authentication: show a dashboard error state.
- Failed repository read: show a dashboard error state.
- Failed database read for repository enrichment or recent posts: show a dashboard error state.
- Failed queue read: show a queue-specific error state if the rest of the dashboard is valid.
- Failed X metrics read: show the engagement card as unavailable with the real reason.
- Failed mutation: keep the previous visible state and show the failed action message.

Server logs should include the operation, signed-in user id where available, relevant repository or tweet id, and the original error.

## Testing

Backend coverage:

- Dashboard model for an authenticated user with repos, enabled repo state, OG posts, queue data, and recent tweets.
- Dashboard model fails loudly when required repository or database reads fail.
- Recent post and weekly post counts derive from persisted tweet records.
- Average engagement is either computed from real X metrics or returned as explicitly unavailable.
- Existing repository enable, disable, OG post, X disconnect, and customisation tests remain valid.

Frontend coverage:

- `/dashboard` renders the authenticated dashboard structure from real API data.
- Repository search, sort, pagination, enable/disable, and OG post controls remain reachable.
- Connections and recent posts render section error states without sample values.
- Customisation remains reachable.
- `/demo` remains offline and unauthenticated behavior still shows the login screen.

Verification:

- Run the backend test suite.
- Run frontend build.
- Run existing frontend offline/source checks.
- Run a local dev server and inspect `/dashboard` at desktop and mobile widths before claiming completion.

## Implementation Notes For Planning

Implementation should start from the smallest truthful data contract that supports the approved UI. Prefer one dashboard endpoint for initial render so the browser does not assemble conflicting partial state from several unrelated calls.

The existing `UserDashboard.jsx` is doing too much. The implementation plan should split the new dashboard into focused components for header, stats, repositories, connections, recent posts, and customisation access while keeping business mutations in API helpers.

Existing silent catch patterns in touched dashboard/customisation loading paths should be removed or replaced with explicit error states as part of this work. Unrelated files should not be refactored.
