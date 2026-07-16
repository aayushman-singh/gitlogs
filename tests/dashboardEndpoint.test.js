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
