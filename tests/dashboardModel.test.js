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
    getOgPostForDashboard: vi.fn().mockImplementation((repoFullName) => (
      repoFullName === 'aayushman-singh/gitlogs' ? '1800000000000000000' : null
    )),
    getRepoStatusForDashboard: vi.fn().mockImplementation((ownerUserId, repoFullName) => (
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
    getQueueItemStatsForUser: vi.fn().mockImplementation((scopedUserId) => {
      expect(scopedUserId).toBe(userId);
      return {
        pending: 1,
        processing: 0,
        retrying: 0,
        failed: 0,
      };
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
    expect(model.errors).toEqual([]);
    expect(deps.database.getQueueItemStatsForUser).toHaveBeenCalledWith(userId);
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

  it('fails loudly when recent posts DB reads fail', async () => {
    const deps = createDeps();
    deps.database.getRecentTweetsForUser = vi.fn().mockImplementation(() => {
      throw new Error('getRecentTweetsForUser for github:42: SQL boom');
    });

    await expect(buildDashboardModel({ githubUserId, deps })).rejects.toThrow(
      'dashboard: failed to read recent posts for github:42'
    );
  });

  it('fails loudly when repository enrichment DB reads fail', async () => {
    const deps = createDeps();
    deps.database.getOgPostForDashboard = vi.fn().mockImplementation(() => {
      throw new Error('getOgPostForDashboard for aayushman-singh/gitlogs: SQL boom');
    });

    await expect(buildDashboardModel({ githubUserId, deps })).rejects.toThrow(
      'dashboard: failed to enrich repositories for github user 42'
    );
  });

  it('returns a queue section error when user queue stats fail', async () => {
    const deps = createDeps();
    deps.database.getQueueItemStatsForUser = vi.fn().mockImplementation(() => {
      throw new Error('getQueueItemStatsForUser pending for github:42: SQL boom');
    });

    const model = await buildDashboardModel({ githubUserId, deps });

    expect(model.stats.queue).toBeNull();
    expect(model.errors).toEqual([
      expect.objectContaining({
        section: 'queue',
        message: expect.stringContaining('Failed to read queue status for github:42'),
      }),
    ]);
    expect(model.repositories).toHaveLength(2);
  });

  it('keeps X connected with a connections.x section error when profile read fails', async () => {
    const deps = createDeps({
      getXUserInfo: vi.fn().mockRejectedValue(new Error('X API timeout')),
    });

    const model = await buildDashboardModel({ githubUserId, deps });

    expect(model.connections.x).toMatchObject({
      connected: true,
      userId,
      username: null,
      error: expect.stringContaining('Failed to load X profile'),
    });
    expect(model.errors).toEqual([
      expect.objectContaining({
        section: 'connections.x',
        message: expect.stringContaining('X API timeout'),
      }),
    ]);
    expect(model.stats.postsThisWeek).toBe(3);
  });

  it('treats null X profile as a connections.x section error when connected', async () => {
    const deps = createDeps({
      getXUserInfo: vi.fn().mockResolvedValue(null),
    });

    const model = await buildDashboardModel({ githubUserId, deps });

    expect(model.connections.x.connected).toBe(true);
    expect(model.errors).toEqual([
      expect.objectContaining({ section: 'connections.x' }),
    ]);
  });
});
