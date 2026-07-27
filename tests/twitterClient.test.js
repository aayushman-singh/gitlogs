import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

// This suite runs in a shared fork with natively-required CJS modules (see
// vitest.config.js), so vi.mock cannot intercept the SDK's node-fetch import.
// Instead we stub https.request — the transport node-fetch 2.x uses — and use
// native require.cache deletion to get a fresh twitterClient module per test
// (it caches per-user X clients and builds its OAuth handler at load time).
const require = createRequire(import.meta.url);
const https = require('https');
const config = require('../config/config');
const database = require('../src/database');
const OAuthHandler = require('../src/oauthHandler');

const mePayload = {
  data: {
    id: '123',
    username: 'aayushman',
    name: 'Aayushman',
    profile_image_url: 'https://x.example/avatar.jpg',
  },
};

// Stub https.request with the minimal ClientRequest/IncomingMessage surface
// node-fetch 2.x touches: req.on/once/write/end/abort and a 'response' event
// carrying a readable body plus statusCode/statusMessage/headers.
function stubHttpsRequests(respond) {
  const requests = [];
  vi.spyOn(https, 'request').mockImplementation((options, callback) => {
    const req = new EventEmitter();
    const chunks = [];
    req.write = (chunk) => {
      chunks.push(Buffer.from(chunk));
      return true;
    };
    req.end = (chunk) => {
      if (chunk) chunks.push(Buffer.from(chunk));
      const request = { options, body: Buffer.concat(chunks).toString('utf8') };
      requests.push(request);
      const result = respond(request);
      const res = Readable.from([JSON.stringify(result.body ?? {})]);
      res.statusCode = result.status;
      res.statusMessage = result.statusText || '';
      res.headers = result.headers || { 'content-type': 'application/json' };
      res.complete = true;
      res.aborted = false;
      process.nextTick(() => req.emit('response', res));
      return req;
    };
    req.abort = () => {};
    req.destroy = () => {};
    req.setTimeout = () => {};
    if (callback) req.once('response', callback);
    return req;
  });
  return requests;
}

function authorizationOf(request) {
  const entry = Object.entries(request.options.headers || {}).find(
    ([key]) => key.toLowerCase() === 'authorization'
  );
  return entry ? String(entry[1]) : undefined;
}

function loadFreshTwitterClient({ storedToken, refreshTokenImpl } = {}) {
  // twitterClient reads config at load time (OAuth handler construction) and
  // at call time (credential checks) — mutate the shared config object so the
  // fresh module below initializes regardless of suite-wide env timing.
  config.twitter.clientId = 'test-client-id';
  config.twitter.clientSecret = undefined;

  vi.spyOn(database, 'getOAuthTokenNoFallback').mockReturnValue(storedToken);
  const refreshSpy = vi
    .spyOn(OAuthHandler.prototype, '_refreshToken')
    .mockImplementation(refreshTokenImpl || (async () => null));

  delete require.cache[require.resolve('../src/twitterClient')];
  const twitterClient = require('../src/twitterClient');
  return { twitterClient, refreshSpy };
}

describe('twitterClient.getXUserInfo', () => {
  let originalClientId;
  let originalClientSecret;

  beforeEach(() => {
    originalClientId = config.twitter.clientId;
    originalClientSecret = config.twitter.clientSecret;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    config.twitter.clientId = originalClientId;
    config.twitter.clientSecret = originalClientSecret;
    vi.restoreAllMocks();
  });

  it('uses the stored access token directly when unexpired (no forced refresh)', async () => {
    const { twitterClient, refreshSpy } = loadFreshTwitterClient({
      storedToken: {
        access_token: 'stored-access-token',
        refresh_token: 'stored-refresh-token',
        // database stores expires_at in SECONDS
        expires_at: Math.floor(Date.now() / 1000) + 7200,
      },
    });
    const requests = stubHttpsRequests(() => ({ status: 200, body: mePayload }));

    const info = await twitterClient.getXUserInfo('github:42');

    expect(info).toEqual({
      username: 'aayushman',
      name: 'Aayushman',
      profileImageUrl: 'https://x.example/avatar.jpg',
      id: '123',
    });
    // Regression: without expires_at on the SDK token, the SDK force-refreshes
    // on every request, so any refresh failure breaks profile loads entirely.
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    expect(requests[0].options.hostname).toBe('api.twitter.com');
    expect(requests[0].options.path).toContain('/2/users/me');
    expect(requests[0].options.path).toContain('user.fields=profile_image_url');
    expect(authorizationOf(requests[0])).toBe('Bearer stored-access-token');
  });

  it('refreshes an expired token once, then reuses the refreshed token', async () => {
    const refreshedToken = {
      access_token: 'refreshed-access-token',
      token_type: 'Bearer',
      refresh_token: 'new-refresh-token',
      expires_in: 7200,
      scope: 'tweet.read users.read',
      expires_at: Math.floor(Date.now() / 1000) + 7200, // seconds (oauthHandler)
    };
    const { twitterClient, refreshSpy } = loadFreshTwitterClient({
      storedToken: {
        access_token: 'stale-access-token',
        refresh_token: 'stored-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 10, // expired
      },
      refreshTokenImpl: async () => refreshedToken,
    });
    const requests = stubHttpsRequests(() => ({ status: 200, body: mePayload }));

    await twitterClient.getXUserInfo('github:42');
    await twitterClient.getXUserInfo('github:42');

    // Regression: the refreshed token previously only set expires_in, which the
    // SDK ignores — so every call refreshed again. It must refresh exactly once.
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(authorizationOf(request)).toBe('Bearer refreshed-access-token');
    }
  });

  it('throws a descriptive error with the X API status and detail on failure', async () => {
    const { twitterClient } = loadFreshTwitterClient({
      storedToken: {
        access_token: 'stored-access-token',
        refresh_token: 'stored-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 7200,
      },
    });
    stubHttpsRequests(() => ({
      status: 401,
      statusText: 'Unauthorized',
      body: { title: 'Unauthorized', detail: 'Access token expired' },
    }));

    await expect(twitterClient.getXUserInfo('github:42')).rejects.toThrow(
      /401.*Access token expired/
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to get X user info for user github:42: HTTP 401')
    );
  });

  it('surfaces the re-authentication hint when an expired token cannot be refreshed', async () => {
    const { twitterClient } = loadFreshTwitterClient({
      storedToken: {
        access_token: 'stale-access-token',
        refresh_token: null, // no refresh token stored
        expires_at: Math.floor(Date.now() / 1000) - 10,
      },
      // oauthHandler returns null when no refresh token exists
      refreshTokenImpl: async () => null,
    });
    const requests = stubHttpsRequests(() => ({ status: 200, body: mePayload }));

    await expect(twitterClient.getXUserInfo('github:42')).rejects.toThrow(
      /re-authenticate/i
    );
    expect(requests).toHaveLength(0);
  });
});
