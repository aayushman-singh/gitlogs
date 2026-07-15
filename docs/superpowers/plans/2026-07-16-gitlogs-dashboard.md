# GitLogs Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Claude Design dashboard as a truthful authenticated GitLogs operations console backed by real user, repository, queue, tweet, and connection data.

**Architecture:** Add a dashboard model module that assembles one coherent server response for `/api/me/dashboard`, then rebuild `/dashboard` around focused frontend components that consume that response and keep existing mutation endpoints. Keep repo toggles, OG post management, X connection management, and customisation on the existing backend workflows.

**Tech Stack:** Node 18+, Express, sql.js, Vitest, Supertest, React 18, React Router, Vite, react-icons.

## Global Constraints

- Preserve `/dashboard` as the authenticated management surface.
- Preserve the imported `GitLogs Dashboard.dc.html` structure closely enough that the design is recognizable.
- Every dashboard value must be real or explicitly unavailable due to a surfaced error.
- Do not introduce static sample repositories, sample recent posts, or sample engagement metrics into the authenticated dashboard.
- Do not add silent degraded modes for failed backend, GitHub, X, database, or queue reads.
- Do not remove customisation, OG post management, or X disconnect workflows.
- Keep implementation scoped to the dashboard experience and the data needed to make it truthful.
- Do not add placeholder comments.
- Commit each task atomically with a conventional commit message.

---

## File Structure

- Create `src/dashboardModel.js`: builds the server-side dashboard response and holds dashboard-specific derivation logic.
- Modify `src/database.js`: add narrow query helpers for dashboard recent posts and weekly post counts.
- Modify `src/server.js`: add `GET /api/me/dashboard` and route-level logging/error behavior.
- Create `tests/dashboardModel.test.js`: unit tests for the dashboard model without HTTP.
- Create `tests/dashboardEndpoint.test.js`: HTTP contract tests for `/api/me/dashboard`.
- Modify `frontend/src/utils/api.js`: add `getMyDashboard()`.
- Replace most of `frontend/src/pages/UserDashboard.jsx`: authenticated dashboard container, data loading, actions, and customisation view switching.
- Create `frontend/src/components/dashboard/DashboardHeader.jsx`: dashboard-specific header.
- Create `frontend/src/components/dashboard/DashboardStats.jsx`: summary cards.
- Create `frontend/src/components/dashboard/RepositoryPanel.jsx`: search, sort, pagination, toggles, and OG post actions.
- Create `frontend/src/components/dashboard/ConnectionsPanel.jsx`: GitHub, X, LinkedIn connection controls.
- Create `frontend/src/components/dashboard/RecentPostsPanel.jsx`: recent persisted tweet records and section errors.
- Modify `frontend/src/App.jsx`: hide global header/footer on `/dashboard` to avoid duplicate chrome.
- Modify `frontend/src/styles.css`: add dashboard layout and responsive styles matching the handoff.
- Modify `tests/frontend-offline.test.js`: add source-level assertions for route chrome and dashboard data usage.

---

### Task 1: Dashboard Model And Database Queries

**Files:**
- Create: `src/dashboardModel.js`
- Modify: `src/database.js`
- Test: `tests/dashboardModel.test.js`

**Interfaces:**
- Consumes:
  - `database.getGithubToken(githubUserId)`
  - `database.getOgPost(repoFullName)`
  - `database.getRepoStatus(userId, repoFullName)`
  - `database.isOAuthTokenValid(xOAuthUserId)`
  - `database.getXOAuthUserId(githubUserId)`
  - `database.getQueueItemStats()`
  - `githubAuth.getValidAccessToken(githubUserId)`
  - `githubAuth.getUserRepos(githubUserId)`
- Produces:
  - `buildDashboardModel({ githubUserId, database, githubAuth, getXUserInfo, getXEngagementSummary })`
  - `database.getRecentTweetsForUser(userId, limit)`
  - `database.getTweetCountForUserSince(userId, sinceIso)`

- [ ] **Step 1: Write failing dashboard model tests**

Add `tests/dashboardModel.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { buildDashboardModel } from '../src/dashboardModel';

const githubUserId = '42';
const userId = 'github:42';
const user = {
  id: 42,
  login: 'aayushman-singh',
  name: 'Aayushman Singh',
  avatar_url: 'https://avatars.githubusercontent.com/u/42',
};

function createDeps(overrides = {}) {
  const database = {
    getGithubToken: vi.fn().mockReturnValue({
      user,
      expiresAt: '2026-07-17T00:00:00.000Z',
      refreshToken: 'refresh-token',
    }),
    getXOAuthUserId: vi.fn().mockReturnValue(userId),
    isOAuthTokenValid: vi.fn().mockReturnValue(true),
    getOgPost: vi.fn().mockImplementation(async (repoFullName) => (
      repoFullName === 'aayushman-singh/gitlogs' ? '1800000000000000000' : null
    )),
    getRepoStatus: vi.fn().mockImplementation((ownerUserId, repoFullName) => (
      ownerUserId === userId && repoFullName === 'aayushman-singh/gitlogs'
        ? { enabled: true }
        : null
    )),
    getRecentTweetsForUser: vi.fn().mockReturnValue([
      {
        repo_name: 'aayushman-singh/gitlogs',
        commit_sha: 'abc123',
        tweet_id: '1900000000000000000',
        tweet_text: 'shipped dashboard metrics',
        status: 'posted',
        author: 'aayushman-singh',
        created_at: '2026-07-16T04:00:00.000Z',
      },
    ]),
    getTweetCountForUserSince: vi.fn().mockReturnValue(3),
    getQueueItemStats: vi.fn().mockReturnValue({
      pending: 1,
      processing: 0,
      retrying: 0,
      failed: 0,
    }),
  };

  const githubAuth = {
    getValidAccessToken: vi.fn().mockResolvedValue('github-token'),
    getUserRepos: vi.fn().mockResolvedValue([
      {
        id: 1,
        full_name: 'aayushman-singh/gitlogs',
        name: 'gitlogs',
        description: 'Auto-post git changes',
        html_url: 'https://github.com/aayushman-singh/gitlogs',
        private: false,
        stargazers_count: 7,
        pushed_at: '2026-07-16T03:30:00.000Z',
        updated_at: '2026-07-16T03:30:00.000Z',
        permissions: { admin: true, push: true, pull: true },
      },
      {
        id: 2,
        full_name: 'aayushman-singh/site',
        name: 'site',
        description: null,
        html_url: 'https://github.com/aayushman-singh/site',
        private: true,
        stargazers_count: 0,
        pushed_at: '2026-07-15T03:30:00.000Z',
        updated_at: '2026-07-15T03:30:00.000Z',
        permissions: { admin: false, push: true, pull: true },
      },
    ]),
  };

  return {
    database,
    githubAuth,
    getXUserInfo: vi.fn().mockResolvedValue({
      username: 'aayushman',
      name: 'Aayushman',
      profileImageUrl: 'https://x.example/avatar.jpg',
    }),
    getXEngagementSummary: vi.fn().mockResolvedValue({
      status: 'unavailable',
      reason: 'X engagement metrics are not implemented for the current X API client.',
      averageHeartsPerPost: null,
    }),
    ...overrides,
  };
}

describe('buildDashboardModel', () => {
  it('returns a truthful dashboard model for an authenticated user', async () => {
    const deps = createDeps();

    const model = await buildDashboardModel({
      githubUserId,
      deps,
      now: new Date('2026-07-16T12:00:00.000Z'),
    });

    expect(model.user).toMatchObject({
      id: 42,
      login: 'aayushman-singh',
      name: 'Aayushman Singh',
    });
    expect(model.connections.github).toMatchObject({ connected: true, mode: 'read-only' });
    expect(model.connections.x).toMatchObject({ connected: true, username: 'aayushman' });
    expect(model.connections.linkedin).toMatchObject({ connected: false, status: 'coming-soon' });
    expect(model.stats).toMatchObject({
      postsThisWeek: 3,
      enabledRepos: 1,
      totalRepos: 2,
      queue: { pending: 1, processing: 0, retrying: 0, failed: 0 },
      averageEngagement: {
        status: 'unavailable',
        averageHeartsPerPost: null,
      },
    });
    expect(model.repositories[0]).toMatchObject({
      full_name: 'aayushman-singh/gitlogs',
      enabled: true,
      og_post_id: '1800000000000000000',
      permissions: { admin: true, push: true, pull: true },
    });
    expect(model.recentPosts).toHaveLength(1);
    expect(model.recentPosts[0]).toMatchObject({
      repo_name: 'aayushman-singh/gitlogs',
      tweet_id: '1900000000000000000',
    });
  });

  it('fails loudly when no valid GitHub token is available', async () => {
    const deps = createDeps({
      githubAuth: {
        getValidAccessToken: vi.fn().mockResolvedValue(null),
        getUserRepos: vi.fn(),
      },
    });

    await expect(buildDashboardModel({ githubUserId, deps })).rejects.toThrow(
      'dashboard: no valid GitHub token for github user 42'
    );
  });

  it('fails loudly when required repository reads fail', async () => {
    const deps = createDeps({
      githubAuth: {
        getValidAccessToken: vi.fn().mockResolvedValue('github-token'),
        getUserRepos: vi.fn().mockRejectedValue(new Error('GitHub API unavailable')),
      },
    });

    await expect(buildDashboardModel({ githubUserId, deps })).rejects.toThrow(
      'dashboard: failed to read repositories for github user 42: GitHub API unavailable'
    );
  });
});
```

- [ ] **Step 2: Run the failing model tests**

Run: `npm test -- tests/dashboardModel.test.js`

Expected: FAIL with an import error for `../src/dashboardModel`.

- [ ] **Step 3: Add database dashboard query helpers**

In `src/database.js`, add these functions near the tweet helpers:

```js
function getRecentTweetsForUser(userId, limit = 8) {
  if (!ensureDb()) {
    throw new Error(`getRecentTweetsForUser: database is not ready for user ${userId}`);
  }
  if (!userId) {
    throw new Error('getRecentTweetsForUser: userId is required');
  }
  const safeLimit = Number.parseInt(limit, 10);
  if (!Number.isInteger(safeLimit) || safeLimit < 1 || safeLimit > 50) {
    throw new Error(`getRecentTweetsForUser: limit must be an integer from 1 to 50, got ${limit}`);
  }
  return getAll(
    `SELECT user_id, repo_name, commit_sha, tweet_id, tweet_text, status, author, created_at
     FROM tweets
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`,
    [userId]
  );
}

function getTweetCountForUserSince(userId, sinceIso) {
  if (!ensureDb()) {
    throw new Error(`getTweetCountForUserSince: database is not ready for user ${userId}`);
  }
  if (!userId || !sinceIso) {
    throw new Error('getTweetCountForUserSince: userId and sinceIso are required');
  }
  const row = getOne(
    `SELECT COUNT(*) as count
     FROM tweets
     WHERE user_id = ? AND created_at >= ?`,
    [userId, sinceIso]
  );
  return row?.count || 0;
}
```

Export them from the `module.exports` object:

```js
  getRecentTweetsForUser,
  getTweetCountForUserSince,
```

- [ ] **Step 4: Add the dashboard model implementation**

Create `src/dashboardModel.js`:

```js
function startOfWeekUtc(now) {
  const date = new Date(now);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`dashboard: invalid now value ${now}`);
  }
  const day = date.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diffToMonday);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function publicUserFromToken(tokenData) {
  const user = tokenData?.user;
  if (!user) {
    throw new Error('dashboard: GitHub token is missing user payload');
  }
  return {
    id: user.id,
    login: user.login,
    name: user.name || user.login,
    avatar_url: user.avatar_url,
  };
}

function normalizeRepo(repo, { enabled, ogPostId }) {
  return {
    id: repo.id,
    full_name: repo.full_name,
    name: repo.name,
    description: repo.description,
    html_url: repo.html_url,
    private: Boolean(repo.private),
    stargazers_count: repo.stargazers_count || 0,
    pushed_at: repo.pushed_at,
    updated_at: repo.updated_at,
    permissions: repo.permissions || {},
    enabled: Boolean(enabled),
    og_post_id: ogPostId || null,
  };
}

async function readXConnection({ database, getXUserInfo, githubUserId }) {
  const xOAuthUserId = database.getXOAuthUserId(githubUserId);
  const connected = Boolean(xOAuthUserId && database.isOAuthTokenValid(xOAuthUserId));
  if (!connected) {
    return { connected: false, userId: xOAuthUserId || null, username: null, name: null, profileImageUrl: null };
  }
  const xUserInfo = await getXUserInfo(xOAuthUserId);
  return {
    connected: true,
    userId: xOAuthUserId,
    username: xUserInfo?.username || null,
    name: xUserInfo?.name || xUserInfo?.username || null,
    profileImageUrl: xUserInfo?.profileImageUrl || null,
  };
}

async function buildDashboardModel({ githubUserId, deps, now = new Date() }) {
  if (!githubUserId) {
    throw new Error('dashboard: githubUserId is required');
  }

  const { database, githubAuth, getXUserInfo, getXEngagementSummary } = deps;
  const userId = `github:${githubUserId}`;
  const validToken = await githubAuth.getValidAccessToken(githubUserId);
  if (!validToken) {
    throw new Error(`dashboard: no valid GitHub token for github user ${githubUserId}`);
  }

  const tokenData = database.getGithubToken(githubUserId);
  const user = publicUserFromToken(tokenData);

  let githubRepos;
  try {
    githubRepos = await githubAuth.getUserRepos(githubUserId);
  } catch (error) {
    throw new Error(
      `dashboard: failed to read repositories for github user ${githubUserId}: ${error.message}`
    );
  }

  const repositories = await Promise.all(githubRepos.map(async (repo) => {
    const ogPostId = await database.getOgPost(repo.full_name);
    const repoStatus = database.getRepoStatus(userId, repo.full_name);
    return normalizeRepo(repo, {
      enabled: repoStatus?.enabled || false,
      ogPostId,
    });
  }));

  const weekStartIso = startOfWeekUtc(now);
  const recentPosts = database.getRecentTweetsForUser(userId, 8);
  const postsThisWeek = database.getTweetCountForUserSince(userId, weekStartIso);
  const queueStats = database.getQueueItemStats();
  const xConnection = await readXConnection({ database, getXUserInfo, githubUserId });
  const averageEngagement = await getXEngagementSummary({
    userId,
    xConnection,
    recentPosts,
  });

  return {
    user,
    connections: {
      github: { connected: true, mode: 'read-only', login: user.login },
      x: xConnection,
      linkedin: { connected: false, status: 'coming-soon' },
    },
    stats: {
      postsThisWeek,
      enabledRepos: repositories.filter((repo) => repo.enabled).length,
      totalRepos: repositories.length,
      queue: queueStats,
      averageEngagement,
    },
    repositories,
    recentPosts,
    errors: [],
  };
}

module.exports = {
  buildDashboardModel,
  startOfWeekUtc,
};
```

- [ ] **Step 5: Run model tests**

Run: `npm test -- tests/dashboardModel.test.js`

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/dashboardModel.js src/database.js tests/dashboardModel.test.js
git commit -m "feat: add dashboard data model"
```

---

### Task 2: Authenticated Dashboard API Endpoint

**Files:**
- Modify: `src/server.js`
- Test: `tests/dashboardEndpoint.test.js`

**Interfaces:**
- Consumes:
  - `buildDashboardModel({ githubUserId, deps })`
  - `getGithubUserIdFromCookie(req)`
- Produces:
  - `GET /api/me/dashboard`
  - JSON success response containing `user`, `connections`, `stats`, `repositories`, `recentPosts`, and `errors`
  - JSON error responses with `error` and `message`

- [ ] **Step 1: Write failing endpoint tests**

Add `tests/dashboardEndpoint.test.js`:

```js
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const requestFactory = require('supertest');
const request = requestFactory.default || requestFactory;

const githubAuth = require('../src/githubAuth');
const database = require('../src/database');
const twitterClient = require('../src/twitterClient');
const app = require('../src/server');

describe('GET /api/me/dashboard', () => {
  it('requires GitHub authentication', async () => {
    const res = await request(app).get('/api/me/dashboard');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      error: 'not_authenticated',
      message: 'Please sign in with GitHub.',
    });
  });

  it('returns the authenticated dashboard model', async () => {
    vi.spyOn(githubAuth, 'getValidAccessToken').mockResolvedValue('github-token');
    vi.spyOn(githubAuth, 'getUserRepos').mockResolvedValue([
      {
        id: 1,
        full_name: 'aayushman-singh/gitlogs',
        name: 'gitlogs',
        description: 'Auto-post git changes',
        html_url: 'https://github.com/aayushman-singh/gitlogs',
        private: false,
        stargazers_count: 7,
        pushed_at: '2026-07-16T03:30:00.000Z',
        updated_at: '2026-07-16T03:30:00.000Z',
        permissions: { admin: true, push: true, pull: true },
      },
    ]);
    vi.spyOn(database, 'getGithubToken').mockReturnValue({
      user: {
        id: 42,
        login: 'aayushman-singh',
        name: 'Aayushman Singh',
        avatar_url: 'https://avatars.githubusercontent.com/u/42',
      },
      expiresAt: '2026-07-17T00:00:00.000Z',
      refreshToken: 'refresh-token',
    });
    vi.spyOn(database, 'getXOAuthUserId').mockReturnValue('github:42');
    vi.spyOn(database, 'isOAuthTokenValid').mockReturnValue(false);
    vi.spyOn(database, 'getOgPost').mockResolvedValue(null);
    vi.spyOn(database, 'getRepoStatus').mockReturnValue({ enabled: true });
    vi.spyOn(database, 'getRecentTweetsForUser').mockReturnValue([]);
    vi.spyOn(database, 'getTweetCountForUserSince').mockReturnValue(0);
    vi.spyOn(database, 'getQueueItemStats').mockReturnValue({
      pending: 0,
      processing: 0,
      retrying: 0,
      failed: 0,
    });
    vi.spyOn(twitterClient, 'getXUserInfo').mockResolvedValue(null);

    const res = await request(app)
      .get('/api/me/dashboard')
      .set('Cookie', ['github_user_id=42']);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ login: 'aayushman-singh' });
    expect(res.body.stats).toMatchObject({
      postsThisWeek: 0,
      enabledRepos: 1,
      totalRepos: 1,
    });
    expect(res.body.stats.averageEngagement).toMatchObject({
      status: 'unavailable',
      averageHeartsPerPost: null,
    });
    expect(res.body.repositories).toHaveLength(1);
    expect(res.body.recentPosts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the failing endpoint tests**

Run: `npm test -- tests/dashboardEndpoint.test.js`

Expected: FAIL with `expected 200` or `expected 401` because `/api/me/dashboard` does not exist yet.

- [ ] **Step 3: Add endpoint imports and engagement state**

In `src/server.js`, add imports near the existing imports:

```js
const { buildDashboardModel } = require('./dashboardModel');
const twitterClient = require('./twitterClient');
```

Add this helper near the user API routes:

```js
async function getXEngagementSummary() {
  return {
    status: 'unavailable',
    reason: 'X engagement metrics are not implemented for the current X API client.',
    averageHeartsPerPost: null,
  };
}
```

- [ ] **Step 4: Add `GET /api/me/dashboard`**

Place this route after `/api/me` and before `/api/me/repos` in `src/server.js`:

```js
app.get('/api/me/dashboard', async (req, res) => {
  const githubUserId = getGithubUserIdFromCookie(req);
  if (!githubUserId) {
    return res.status(401).json({
      error: 'not_authenticated',
      message: 'Please sign in with GitHub.',
    });
  }

  try {
    const model = await buildDashboardModel({
      githubUserId,
      deps: {
        database,
        githubAuth,
        getXUserInfo: twitterClient.getXUserInfo,
        getXEngagementSummary,
      },
    });
    return res.json(model);
  } catch (err) {
    console.error('❌ Failed to build dashboard model:', {
      githubUserId,
      error: err.message,
      stack: err.stack,
    });

    if (err.message.includes('no valid GitHub token')) {
      return res.status(401).json({
        error: 'token_expired',
        message: 'Session expired. Please sign in again.',
      });
    }

    return res.status(500).json({
      error: 'dashboard_unavailable',
      message: err.message,
    });
  }
});
```

- [ ] **Step 5: Run endpoint tests**

Run: `npm test -- tests/dashboardEndpoint.test.js`

Expected: PASS.

- [ ] **Step 6: Run related backend tests**

Run: `npm test -- tests/dashboardModel.test.js tests/dashboardEndpoint.test.js tests/webhook.e2e.test.js`

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/server.js tests/dashboardEndpoint.test.js
git commit -m "feat: expose authenticated dashboard api"
```

---

### Task 3: Frontend Dashboard API And Components

**Files:**
- Modify: `frontend/src/utils/api.js`
- Modify: `frontend/src/pages/UserDashboard.jsx`
- Create: `frontend/src/components/dashboard/DashboardHeader.jsx`
- Create: `frontend/src/components/dashboard/DashboardStats.jsx`
- Create: `frontend/src/components/dashboard/RepositoryPanel.jsx`
- Create: `frontend/src/components/dashboard/ConnectionsPanel.jsx`
- Create: `frontend/src/components/dashboard/RecentPostsPanel.jsx`
- Modify: `frontend/src/styles.css`
- Test: `tests/frontend-offline.test.js`

**Interfaces:**
- Consumes:
  - `getMyDashboard()`
  - `enableRepo(repoFullName)`
  - `disableRepo(repoFullName)`
  - `setMyRepoOgPost(repoFullName, tweetId)`
  - `disconnectX()`
  - dashboard model from Task 2
- Produces:
  - Dashboard components that render the handoff structure from real API data.
  - `UserDashboard` view switching between `overview` and `customisation`.

- [ ] **Step 1: Add source-level failing tests**

Modify `tests/frontend-offline.test.js` by adding these constants below the existing path constants:

```js
const frontendAppPath = path.join(repoRoot, 'frontend', 'src', 'App.jsx');
const userDashboardPath = path.join(repoRoot, 'frontend', 'src', 'pages', 'UserDashboard.jsx');
const dashboardHeaderPath = path.join(
  repoRoot,
  'frontend',
  'src',
  'components',
  'dashboard',
  'DashboardHeader.jsx'
);
```

Add these tests inside `describe('frontend offline contract', () => { ... })`:

```js
  it('uses the dashboard API instead of assembling dashboard state from silent empty reads', () => {
    const dashboard = fs.readFileSync(userDashboardPath, 'utf8');

    expect(dashboard).toContain('getMyDashboard');
    expect(dashboard).not.toContain('getMyRepos().catch(() => ({ repos: [] }))');
    expect(dashboard).not.toContain('getHealth().catch(() => null)');
  });

  it('uses dashboard-specific chrome on /dashboard', () => {
    const app = fs.readFileSync(frontendAppPath, 'utf8');
    const dashboardHeader = fs.readFileSync(dashboardHeaderPath, 'utf8');

    expect(app).toContain('hideGlobalChrome');
    expect(dashboardHeader).toContain('dashboard');
    expect(dashboardHeader).toContain('Customisation');
  });
```

- [ ] **Step 2: Run the failing frontend source tests**

Run: `npm test -- tests/frontend-offline.test.js`

Expected: FAIL because the dashboard component files and API helper do not exist yet.

- [ ] **Step 3: Add the dashboard API helper**

In `frontend/src/utils/api.js`, add after `getCurrentUser()`:

```js
export async function getMyDashboard() {
  return apiCall('/api/me/dashboard');
}
```

- [ ] **Step 4: Create dashboard header component**

Create `frontend/src/components/dashboard/DashboardHeader.jsx`:

```jsx
import logo from '../../../gitlogs.png';

export default function DashboardHeader({
  user,
  theme,
  onToggleTheme,
  onShowCustomisation,
  onShowOverview,
  activeView,
  onLogout,
}) {
  const isDark = theme === 'dark';

  return (
    <header className="dashboard-shell-header">
      <div className="dashboard-brand">
        <img src={logo} alt="GitLogs logo" className="dashboard-logo" />
        <span className="dashboard-badge">dashboard</span>
      </div>

      <div className="dashboard-header-actions">
        <button
          type="button"
          className={`dashboard-nav-button${activeView === 'overview' ? ' is-active' : ''}`}
          onClick={onShowOverview}
        >
          Overview
        </button>
        <button
          type="button"
          className={`dashboard-nav-button${activeView === 'customisation' ? ' is-active' : ''}`}
          onClick={onShowCustomisation}
        >
          Customisation
        </button>
        <button
          type="button"
          className="dashboard-icon-button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {isDark ? 'Light' : 'Dark'}
        </button>
        <div className="dashboard-user">
          <img src={user.avatar_url} alt={user.login} className="dashboard-user-avatar" />
          <div className="dashboard-user-meta">
            <span>{user.name || user.login}</span>
            <small>@{user.login}</small>
          </div>
        </div>
        <button type="button" className="dashboard-nav-button" onClick={onLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Create stats component**

Create `frontend/src/components/dashboard/DashboardStats.jsx`:

```jsx
function EngagementValue({ engagement }) {
  if (!engagement || engagement.status !== 'available') {
    return (
      <>
        <strong>Unavailable</strong>
        <span>{engagement?.reason || 'Engagement metrics are unavailable.'}</span>
      </>
    );
  }

  return (
    <>
      <strong>{engagement.averageHeartsPerPost}</strong>
      <span>hearts/post</span>
    </>
  );
}

export default function DashboardStats({ stats }) {
  const queue = stats.queue || { pending: 0, processing: 0, retrying: 0, failed: 0 };
  const queueTotal = queue.pending + queue.processing + queue.retrying;

  return (
    <section className="dashboard-stats" aria-label="Dashboard summary">
      <article className="dashboard-stat-card">
        <span>Posts this week</span>
        <strong>{stats.postsThisWeek}</strong>
        <small>Persisted GitLogs posts</small>
      </article>
      <article className="dashboard-stat-card">
        <span>Repos enabled</span>
        <strong>{stats.enabledRepos}/{stats.totalRepos}</strong>
        <small>Webhook-backed repositories</small>
      </article>
      <article className="dashboard-stat-card">
        <span>Queue</span>
        <strong>{queueTotal}</strong>
        <small>{queue.failed > 0 ? `${queue.failed} failed` : 'All clear'}</small>
      </article>
      <article className="dashboard-stat-card">
        <span>Avg engagement</span>
        <EngagementValue engagement={stats.averageEngagement} />
      </article>
    </section>
  );
}
```

- [ ] **Step 6: Create repository panel**

Create `frontend/src/components/dashboard/RepositoryPanel.jsx` with this exported component and helper:

```jsx
import { useMemo, useState } from 'react';

function extractTweetId(input) {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:twitter\.com|x\.com)\/(?:\w+\/status|i\/status)\/(\d+)/i);
  return match?.[1] || null;
}

export default function RepositoryPanel({ repositories, onToggleRepo, onSetOgPost }) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [page, setPage] = useState(1);
  const [editingRepo, setEditingRepo] = useState(null);
  const [tweetInput, setTweetInput] = useState('');
  const pageSize = 5;

  const filteredRepos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = repositories.filter((repo) => {
      if (!normalizedQuery) return true;
      return `${repo.full_name} ${repo.description || ''}`.toLowerCase().includes(normalizedQuery);
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'name') return a.full_name.localeCompare(b.full_name);
      if (sortBy === 'enabled') return Number(b.enabled) - Number(a.enabled);
      return new Date(b.pushed_at || b.updated_at || 0) - new Date(a.pushed_at || a.updated_at || 0);
    });
  }, [repositories, query, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredRepos.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRepos = filteredRepos.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const submitOgPost = async (repoFullName) => {
    const tweetId = extractTweetId(tweetInput);
    if (!tweetId) {
      throw new Error('Paste a valid X/Twitter status URL or numeric tweet id.');
    }
    await onSetOgPost(repoFullName, tweetId);
    setEditingRepo(null);
    setTweetInput('');
  };

  return (
    <section className="dashboard-panel dashboard-repositories">
      <div className="dashboard-panel-heading">
        <div>
          <h2>Repositories</h2>
          <p>{filteredRepos.length} repositories available</p>
        </div>
        <div className="dashboard-repo-tools">
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Filter repositories"
            aria-label="Filter repositories"
          />
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort repositories">
            <option value="recent">Recent</option>
            <option value="name">Name</option>
            <option value="enabled">Enabled</option>
          </select>
        </div>
      </div>

      <div className="dashboard-repo-list">
        {visibleRepos.map((repo) => (
          <article className="dashboard-repo-card" key={repo.full_name}>
            <div className="dashboard-repo-main">
              <div>
                <a href={repo.html_url} target="_blank" rel="noreferrer">{repo.full_name}</a>
                <p>{repo.description || 'No description'}</p>
                <div className="dashboard-repo-badges">
                  <span>{repo.private ? 'Private' : 'Public'}</span>
                  {repo.og_post_id ? <span>OG set</span> : <span>No OG post</span>}
                  <span>{repo.stargazers_count} stars</span>
                </div>
              </div>
              <label className="dashboard-switch">
                <input
                  type="checkbox"
                  checked={repo.enabled}
                  onChange={() => onToggleRepo(repo.full_name, repo.enabled)}
                />
                <span>{repo.enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>

            {repo.og_post_id && (
              <a className="dashboard-text-link" href={`https://x.com/i/status/${repo.og_post_id}`} target="_blank" rel="noreferrer">
                View OG post
              </a>
            )}

            {editingRepo === repo.full_name ? (
              <div className="dashboard-og-editor">
                <input
                  value={tweetInput}
                  onChange={(event) => setTweetInput(event.target.value)}
                  placeholder="https://x.com/user/status/123 or 123"
                  aria-label={`OG post for ${repo.full_name}`}
                />
                <button type="button" onClick={() => submitOgPost(repo.full_name)}>Save</button>
                <button type="button" onClick={() => setEditingRepo(null)}>Cancel</button>
              </div>
            ) : (
              <button type="button" className="dashboard-text-button" onClick={() => setEditingRepo(repo.full_name)}>
                {repo.og_post_id ? 'Update OG post' : 'Set OG post'}
              </button>
            )}
          </article>
        ))}
      </div>

      <div className="dashboard-pagination">
        <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span>Page {currentPage} of {totalPages}</span>
        <button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Create connections and recent posts panels**

Create `frontend/src/components/dashboard/ConnectionsPanel.jsx`:

```jsx
import { getBackendUrl } from '../../utils/api';

export default function ConnectionsPanel({ connections, onDisconnectX }) {
  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel-heading">
        <div>
          <h2>Connections</h2>
          <p>Accounts GitLogs can read or post with</p>
        </div>
      </div>

      <div className="dashboard-connection-list">
        <article className="dashboard-connection-row">
          <div>
            <strong>GitHub</strong>
            <span>@{connections.github.login}</span>
          </div>
          <small>Connected</small>
        </article>

        <article className="dashboard-connection-row">
          <div>
            <strong>X</strong>
            <span>{connections.x.connected ? `@${connections.x.username || 'connected'}` : 'Not connected'}</span>
          </div>
          {connections.x.connected ? (
            <button type="button" onClick={onDisconnectX}>Disconnect</button>
          ) : (
            <a href={`${getBackendUrl()}/auth/x`}>Connect</a>
          )}
        </article>

        <article className="dashboard-connection-row is-disabled">
          <div>
            <strong>LinkedIn</strong>
            <span>Coming soon</span>
          </div>
          <small>Unavailable</small>
        </article>
      </div>
    </section>
  );
}
```

Create `frontend/src/components/dashboard/RecentPostsPanel.jsx`:

```jsx
export default function RecentPostsPanel({ posts }) {
  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel-heading">
        <div>
          <h2>Recent posts</h2>
          <p>Persisted posts created by GitLogs</p>
        </div>
      </div>

      <div className="dashboard-post-list">
        {posts.length === 0 ? (
          <p className="dashboard-empty">No posts recorded yet.</p>
        ) : posts.map((post) => (
          <article className="dashboard-post-row" key={`${post.repo_name}-${post.commit_sha}`}>
            <div>
              <strong>{post.repo_name}</strong>
              <p>{post.tweet_text || `Tweet ${post.tweet_id}`}</p>
              <small>{post.commit_sha.slice(0, 7)} · {post.status} · {new Date(post.created_at).toLocaleString()}</small>
            </div>
            <a href={`https://x.com/i/status/${post.tweet_id}`} target="_blank" rel="noreferrer">View</a>
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Replace `UserDashboard.jsx` with dashboard container**

Replace `frontend/src/pages/UserDashboard.jsx` with a container that imports:

```jsx
import { useEffect, useState } from 'react';
import {
  disconnectX,
  disableRepo,
  enableRepo,
  getBackendUrl,
  getMyDashboard,
  logout,
  setMyRepoOgPost,
} from '../utils/api';
import Customisation from '../components/Customisation';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import DashboardStats from '../components/dashboard/DashboardStats';
import RepositoryPanel from '../components/dashboard/RepositoryPanel';
import ConnectionsPanel from '../components/dashboard/ConnectionsPanel';
import RecentPostsPanel from '../components/dashboard/RecentPostsPanel';
import logo from '../../gitlogs.png';
```

Use this component body:

```jsx
export default function UserDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [activeView, setActiveView] = useState('overview');
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getMyDashboard();
      setDashboard(data);
    } catch (error) {
      if (error.message.includes('Not authenticated') || error.message.includes('not_authenticated')) {
        setDashboard(null);
      } else {
        setLoadError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('gl-theme', next);
    setTheme(next);
  };

  const handleGitHubLogin = () => {
    window.location.href = `${getBackendUrl()}/auth/github`;
  };

  const runAction = async (operation, successMessage) => {
    setActionError('');
    setActionMessage('');
    try {
      await operation();
      setActionMessage(successMessage);
      await loadDashboard();
    } catch (error) {
      setActionError(error.message);
    }
  };

  const handleToggleRepo = (repoFullName, enabled) => runAction(
    () => (enabled ? disableRepo(repoFullName) : enableRepo(repoFullName)),
    enabled ? `Disabled ${repoFullName}` : `Enabled ${repoFullName}`
  );

  const handleSetOgPost = (repoFullName, tweetId) => runAction(
    () => setMyRepoOgPost(repoFullName, tweetId),
    `Updated OG post for ${repoFullName}`
  );

  const handleDisconnectX = () => runAction(
    () => disconnectX(),
    'Disconnected X account'
  );

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-loading">Loading dashboard...</div>
      </div>
    );
  }

  if (!dashboard && !loadError) {
    return (
      <div className="container">
        <div className="card login-card">
          <img src={logo} alt="GitLogs logo" className="logo-mark logo-mark-lg" />
          <h1>Connect your GitHub</h1>
          <p>Login with GitHub to manage repositories, posting, and customisation.</p>
          <button onClick={handleGitHubLogin} className="btn btn-github" style={{ width: '100%', marginBottom: 16 }}>
            Continue with GitHub
          </button>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-error">
          <h1>Dashboard unavailable</h1>
          <p>{loadError}</p>
          <button type="button" onClick={loadDashboard}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <DashboardHeader
        user={dashboard.user}
        theme={theme}
        onToggleTheme={toggleTheme}
        onShowCustomisation={() => setActiveView('customisation')}
        onShowOverview={() => setActiveView('overview')}
        activeView={activeView}
        onLogout={handleLogout}
      />

      {actionError && <div className="dashboard-alert is-error">{actionError}</div>}
      {actionMessage && <div className="dashboard-alert is-success">{actionMessage}</div>}

      {activeView === 'customisation' ? (
        <main className="dashboard-content">
          <Customisation user={dashboard.user} xConnected={dashboard.connections.x.connected} />
        </main>
      ) : (
        <main className="dashboard-content">
          <DashboardStats stats={dashboard.stats} />
          <div className="dashboard-grid">
            <RepositoryPanel
              repositories={dashboard.repositories}
              onToggleRepo={handleToggleRepo}
              onSetOgPost={handleSetOgPost}
            />
            <aside className="dashboard-rail">
              <ConnectionsPanel connections={dashboard.connections} onDisconnectX={handleDisconnectX} />
              <RecentPostsPanel posts={dashboard.recentPosts} />
            </aside>
          </div>
        </main>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Add dashboard CSS**

Append focused dashboard styles to `frontend/src/styles.css`:

```css
.dashboard-page {
  min-height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.dashboard-shell-header {
  position: sticky;
  top: 0;
  z-index: 20;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 28px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
  backdrop-filter: blur(18px);
}

.dashboard-brand,
.dashboard-header-actions,
.dashboard-user,
.dashboard-repo-main,
.dashboard-repo-tools,
.dashboard-repo-badges,
.dashboard-pagination,
.dashboard-og-editor {
  display: flex;
  align-items: center;
}

.dashboard-brand { gap: 12px; }
.dashboard-logo { width: 104px; height: auto; }
.dashboard-badge,
.dashboard-repo-badges span {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 9px;
  color: var(--text-secondary);
  font-size: 12px;
}

.dashboard-header-actions { gap: 10px; }
.dashboard-nav-button,
.dashboard-icon-button,
.dashboard-text-button,
.dashboard-pagination button,
.dashboard-og-editor button,
.dashboard-connection-row button,
.dashboard-connection-row a,
.dashboard-error button {
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 8px;
  padding: 8px 11px;
  font: inherit;
  cursor: pointer;
  text-decoration: none;
}

.dashboard-nav-button.is-active {
  border-color: var(--accent);
  color: var(--accent);
}

.dashboard-user { gap: 10px; }
.dashboard-user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
}

.dashboard-user-meta {
  display: grid;
  line-height: 1.15;
  font-size: 13px;
}

.dashboard-user-meta small { color: var(--text-secondary); }

.dashboard-content {
  width: min(1180px, calc(100% - 40px));
  margin: 0 auto;
  padding: 36px 0 72px;
}

.dashboard-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.dashboard-stat-card,
.dashboard-panel,
.dashboard-error,
.dashboard-alert {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary);
  box-shadow: var(--shadow-sm);
}

.dashboard-stat-card {
  display: grid;
  gap: 6px;
  min-height: 118px;
  padding: 18px;
}

.dashboard-stat-card span,
.dashboard-stat-card small,
.dashboard-panel-heading p,
.dashboard-empty,
.dashboard-post-row small,
.dashboard-connection-row span,
.dashboard-connection-row small {
  color: var(--text-secondary);
}

.dashboard-stat-card strong {
  font-size: 26px;
  letter-spacing: 0;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 18px;
  align-items: start;
}

.dashboard-panel { padding: 18px; }
.dashboard-panel-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.dashboard-panel-heading h2 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0;
}

.dashboard-panel-heading p { margin: 4px 0 0; }
.dashboard-repo-tools { gap: 8px; }
.dashboard-repo-tools input,
.dashboard-repo-tools select,
.dashboard-og-editor input {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 9px 10px;
}

.dashboard-repo-list,
.dashboard-connection-list,
.dashboard-post-list,
.dashboard-rail {
  display: grid;
  gap: 12px;
}

.dashboard-repo-card,
.dashboard-connection-row,
.dashboard-post-row {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  padding: 14px;
}

.dashboard-repo-main {
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}

.dashboard-repo-main a,
.dashboard-post-row a,
.dashboard-text-link {
  color: var(--text-primary);
  font-weight: 600;
  text-decoration: none;
}

.dashboard-repo-main p,
.dashboard-post-row p {
  margin: 6px 0;
  color: var(--text-secondary);
}

.dashboard-repo-badges { flex-wrap: wrap; gap: 6px; }
.dashboard-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.dashboard-og-editor,
.dashboard-pagination {
  gap: 8px;
  margin-top: 12px;
}

.dashboard-pagination { justify-content: flex-end; }

.dashboard-connection-row,
.dashboard-post-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}

.dashboard-connection-row div,
.dashboard-post-row div {
  display: grid;
  gap: 4px;
}

.dashboard-connection-row.is-disabled { opacity: 0.64; }

.dashboard-alert,
.dashboard-error,
.dashboard-loading {
  width: min(1180px, calc(100% - 40px));
  margin: 18px auto 0;
  padding: 14px 16px;
}

.dashboard-alert.is-error { border-color: var(--error); }
.dashboard-alert.is-success { border-color: var(--success); }
.dashboard-error { padding: 28px; }

@media (max-width: 900px) {
  .dashboard-shell-header {
    height: auto;
    align-items: flex-start;
    flex-direction: column;
    padding: 14px 20px;
  }

  .dashboard-header-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .dashboard-stats,
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-panel-heading,
  .dashboard-repo-main,
  .dashboard-connection-row,
  .dashboard-post-row {
    flex-direction: column;
  }

  .dashboard-repo-tools {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }
}
```

- [ ] **Step 10: Run frontend checks**

Run: `npm test -- tests/frontend-offline.test.js`

Expected: PASS.

Run: `npm run frontend:build`

Expected: PASS.

- [ ] **Step 11: Commit Task 3**

```bash
git add frontend/src/utils/api.js frontend/src/pages/UserDashboard.jsx frontend/src/components/dashboard frontend/src/styles.css tests/frontend-offline.test.js
git commit -m "feat: build real gitlogs dashboard ui"
```

---

### Task 4: Route Chrome, Loud Loading, And Final Verification

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Customisation.jsx`
- Modify: `tests/frontend-offline.test.js`

**Interfaces:**
- Consumes:
  - Dashboard components from Task 3
  - Existing `Customisation`
- Produces:
  - No duplicate global header/footer on `/dashboard`
  - Customisation loading does not replace failed template reads with empty defaults

- [ ] **Step 1: Update route chrome source test**

In `tests/frontend-offline.test.js`, add this assertion to `it('uses dashboard-specific chrome on /dashboard', () => { ... })`:

```js
    expect(app).toContain('const hideGlobalChrome = location.pathname === \\'/dashboard\\';');
    expect(app).toContain('{!hideGlobalChrome && <Header />}');
    expect(app).toContain('{!hideGlobalChrome && <Footer />}');
```

Add a new test:

```js
  it('does not hide customisation template load failures behind empty defaults', () => {
    const customisation = fs.readFileSync(
      path.join(repoRoot, 'frontend', 'src', 'components', 'Customisation.jsx'),
      'utf8'
    );

    expect(customisation).not.toContain("return { templates: [], activeTemplateId: 'default' };");
  });
```

- [ ] **Step 2: Run the failing source tests**

Run: `npm test -- tests/frontend-offline.test.js`

Expected: FAIL until `App.jsx` and `Customisation.jsx` are updated.

- [ ] **Step 3: Hide global chrome on dashboard route**

Modify `frontend/src/App.jsx` to import `useLocation`:

```jsx
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
```

Inside `App`, add:

```jsx
  const location = useLocation();
  const hideGlobalChrome = location.pathname === '/dashboard';
```

Then render:

```jsx
      {!hideGlobalChrome && <Header />}
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
        </Routes>
      </main>
      {!hideGlobalChrome && <Footer />}
```

- [ ] **Step 4: Remove customisation silent empty data behavior**

In `frontend/src/components/Customisation.jsx`, replace the `getMyTemplates().catch(...)` block with direct awaited loading:

```jsx
      const templatesData = await getMyTemplates();
      setCustomTemplates(templatesData.templates || []);
      setActiveTemplateId(templatesData.activeTemplateId || 'default');
```

Keep the existing outer `catch` that sets a visible error result. If `templatesData` is malformed, add this check immediately after the await:

```jsx
      if (!Array.isArray(templatesData.templates)) {
        throw new Error('Templates response is missing templates array');
      }
```

- [ ] **Step 5: Run all targeted tests and builds**

Run: `npm test -- tests/frontend-offline.test.js tests/dashboardModel.test.js tests/dashboardEndpoint.test.js`

Expected: PASS.

Run: `npm test`

Expected: PASS.

Run: `npm run frontend:build`

Expected: PASS.

- [ ] **Step 6: Start dev server and inspect**

Run: `npm run dev:all`

Expected: backend starts on configured port and Vite starts on a local frontend URL.

Open the Vite URL and inspect:

- `/dashboard` unauthenticated: login card renders.
- `/dashboard` authenticated in a real browser session: dashboard header, stats, repositories, connections, recent posts, and customisation access render.
- Desktop width around 1440px: two-column layout matches the handoff.
- Mobile width around 390px: no text overlap, horizontal overflow, or duplicate app header/footer.

- [ ] **Step 7: Commit Task 4**

```bash
git add frontend/src/App.jsx frontend/src/components/Customisation.jsx tests/frontend-offline.test.js
git commit -m "fix: keep dashboard chrome and loading truthful"
```

---

## Final Verification Before Completion

- [ ] Run: `git status --short`
  - Expected: clean except intentionally uncommitted local runtime files.
- [ ] Run: `npm test`
  - Expected: PASS.
- [ ] Run: `npm run frontend:build`
  - Expected: PASS.
- [ ] If Python files changed, run: `ruff check --fix . && ruff format .`
  - Expected: PASS. This project plan does not require Python changes.
- [ ] Run or verify local app:
  - `npm run dev:all`
  - Inspect `/dashboard` at desktop and mobile widths.

## Plan Self-Review

- Spec coverage: Task 1 covers truthful dashboard data; Task 2 exposes the authenticated endpoint; Task 3 implements the handoff-shaped UI and existing workflows; Task 4 removes duplicate chrome, tightens visible failures, and verifies the app.
- Placeholder scan: no open-ended placeholders are left in the task steps.
- Type consistency: `getMyDashboard`, `buildDashboardModel`, `getRecentTweetsForUser`, and `getTweetCountForUserSince` have consistent names across tasks.
