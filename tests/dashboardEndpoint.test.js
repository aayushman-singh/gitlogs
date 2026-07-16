import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const requestFactory = require('supertest');
const request = requestFactory.default || requestFactory;

const githubAuth = require('../src/githubAuth');
const database = require('../src/database');
const twitterClient = require('../src/twitterClient');
const app = require('../src/server');

function mockAuthenticatedDashboard({ xConnected = false } = {}) {
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
  vi.spyOn(database, 'getXOAuthUserId').mockReturnValue(xConnected ? 'github:42' : null);
  vi.spyOn(database, 'isOAuthTokenValid').mockReturnValue(xConnected);
  vi.spyOn(database, 'getOgPostForDashboard').mockReturnValue(null);
  vi.spyOn(database, 'getRepoStatusForDashboard').mockReturnValue({ enabled: true });
  vi.spyOn(database, 'getRecentTweetsForUser').mockReturnValue([]);
  vi.spyOn(database, 'getTweetCountForUserSince').mockReturnValue(0);
  vi.spyOn(database, 'getQueueItemStatsForUser').mockReturnValue({
    pending: 0,
    processing: 0,
    retrying: 0,
    failed: 0,
  });
  vi.spyOn(twitterClient, 'getXUserInfo').mockResolvedValue(
    xConnected
      ? { username: 'aayushman', name: 'Aayushman', profileImageUrl: null }
      : null
  );
}

describe('GET /api/me/dashboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires GitHub authentication', async () => {
    const res = await request(app).get('/api/me/dashboard');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      error: 'not_authenticated',
      message: 'Please sign in with GitHub.',
    });
  });

  it('returns the authenticated dashboard model', async () => {
    mockAuthenticatedDashboard();

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
    expect(res.body.errors).toEqual([]);
    expect(database.getQueueItemStatsForUser).toHaveBeenCalledWith('github:42');
  });

  it('returns token_expired when GitHub token refresh fails', async () => {
    mockAuthenticatedDashboard();
    githubAuth.getValidAccessToken.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/me/dashboard')
      .set('Cookie', ['github_user_id=42']);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      error: 'token_expired',
      message: 'Session expired. Please sign in again.',
    });
  });

  it('returns dashboard_unavailable with actionable message on required DB failure', async () => {
    mockAuthenticatedDashboard();
    database.getRecentTweetsForUser.mockImplementation(() => {
      throw new Error('getRecentTweetsForUser for github:42: SQL boom');
    });

    const res = await request(app)
      .get('/api/me/dashboard')
      .set('Cookie', ['github_user_id=42']);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      error: 'dashboard_unavailable',
      message: expect.stringContaining('failed to read recent posts'),
    });
  });

  it('returns section errors when queue or X profile reads fail partially', async () => {
    mockAuthenticatedDashboard({ xConnected: true });
    database.getQueueItemStatsForUser.mockImplementation(() => {
      throw new Error('getQueueItemStatsForUser pending for github:42: SQL boom');
    });
    twitterClient.getXUserInfo.mockRejectedValue(new Error('X API timeout'));

    const res = await request(app)
      .get('/api/me/dashboard')
      .set('Cookie', ['github_user_id=42']);

    expect(res.status).toBe(200);
    expect(res.body.stats.queue).toBeNull();
    expect(res.body.connections.x.connected).toBe(true);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ section: 'queue' }),
        expect.objectContaining({ section: 'connections.x' }),
      ])
    );
  });
});
