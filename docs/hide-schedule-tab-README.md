# Hide Schedule Tab
Task: hide the broken Schedule tab from the authenticated dashboard.
Run: `cd frontend && npm run dev -- --host 127.0.0.1`.
Build: `cd frontend && npm run build`.
Demo path: open `http://127.0.0.1:5173/dashboard` after signing in.
Expected tabs: Actions and Customisation.
Schedule tab: not rendered in desktop or mobile tab lists.
Screenshot: [dashboard](hide-schedule-tab-dashboard.png).
Verification: mocked authenticated API responses for the visual check.
Deferred: full scheduling backend, persistence, and posting worker integration.
