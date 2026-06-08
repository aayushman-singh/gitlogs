import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Load the whole backend through ONE Node CommonJS require graph. This is the
// reliable seam: vitest's vi.mock does NOT intercept transitive require()s of
// CJS modules here, but because every module below shares the SAME require
// cache, the stub functions we assign are the exact instances webhookHandler
// holds by reference — so overriding them controls the real pipeline.
//
// Env (WEBHOOK_SECRET, ALLOWED_REPOS, ENABLE_THREADING, DATABASE_PATH) is set in
// vitest.config.js, so it's already in process.env before these modules load.
const require = createRequire(import.meta.url);
const requestFactory = require('supertest');
const request = requestFactory.default || requestFactory;

const geminiClient = require('../src/geminiClient');
const twitterClient = require('../src/twitterClient');
const diffAnalyzer = require('../src/diffAnalyzer');
const repoIndexer = require('../src/repoIndexer');
const database = require('../src/database');
const { shutdownQueueService } = require('../src/queueService');
const app = require('../src/server');

const TEST_SECRET = 'test-webhook-secret-e2e';
const TEST_REPO = 'octo-dev/payments-api';
const GENERATED_TWEET =
  'shipped idempotency keys on POST /charges so retries never double-charge';
const POSTED_TWEET_ID = '1799999999999999999';

// ── Stub the external network boundaries (Gemini, X, GitHub diff, indexer) ──
// Everything BETWEEN the HTTP edge and these stubs (HMAC verify, parsing,
// repo/user resolution, formatting, persistence) runs for real.
geminiClient.analyzeDiff = vi.fn().mockResolvedValue('- Adds idempotency middleware to POST /charges');
geminiClient.generateChangelog = vi.fn().mockResolvedValue(GENERATED_TWEET);
geminiClient.getQueueStats = vi
  .fn()
  .mockReturnValue({ currentQueueLength: 0, totalProcessed: 1, rateLimitRemaining: 5 });

twitterClient.postTweet = vi.fn().mockResolvedValue(POSTED_TWEET_ID);

diffAnalyzer.fetchCommitDiff = vi.fn().mockResolvedValue({
  diff: 'diff --git a/src/routes/charges.js b/src/routes/charges.js\n+ idempotency',
  files: ['src/routes/charges.js'],
  stats: { additions: 18, deletions: 3 },
  error: null,
});
diffAnalyzer.shouldSkipDiffAnalysis = vi.fn().mockReturnValue(false);
diffAnalyzer.buildFileBasedSummary = vi.fn().mockReturnValue('Updated src/routes/charges.js');

repoIndexer.generateContextFromWebhook = vi
  .fn()
  .mockReturnValue({ languages: ['JavaScript'], description: 'Payments API' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUSH_PAYLOAD = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'push-event.json'), 'utf8')
);
const COMMIT_SHA = PUSH_PAYLOAD.commits[0].id;

function sign(rawBody, secret = TEST_SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function postWebhook({ body, signature, event = 'push' }) {
  return request(app)
    .post('/webhook/github')
    .set('content-type', 'application/json')
    .set('x-github-event', event)
    .set('x-hub-signature-256', signature)
    .send(body); // send the EXACT signed string, not a re-serialized object
}

beforeAll(async () => {
  await database.initDatabase();
});

afterAll(() => {
  shutdownQueueService();
  database.closeDatabase();
  const dbPath = process.env.DATABASE_PATH;
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('POST /webhook/github — end-to-end pipeline', () => {
  it('verifies HMAC, runs the AI pipeline, posts to X (stub), and persists the tweet', async () => {
    const raw = JSON.stringify(PUSH_PAYLOAD);
    const res = await postWebhook({ body: raw, signature: sign(raw) });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'OK', processed: 1, total: 1 });

    // Gemini two-stage generation was invoked
    expect(geminiClient.analyzeDiff).toHaveBeenCalledTimes(1);
    expect(geminiClient.generateChangelog).toHaveBeenCalledTimes(1);

    // X received exactly the generated changelog text
    expect(twitterClient.postTweet).toHaveBeenCalledTimes(1);
    const [postedText] = twitterClient.postTweet.mock.calls[0];
    expect(postedText).toContain('idempotency');

    // The tweet was persisted to the ledger
    const persisted = await database.getTweetsForRepo(TEST_REPO);
    const row = persisted.find((t) => t.commit_sha === COMMIT_SHA);
    expect(row).toBeTruthy();
    expect(row.tweet_id).toBe(POSTED_TWEET_ID);
  });

  it('rejects a tampered/invalid signature with 401 and never posts', async () => {
    twitterClient.postTweet.mockClear();
    const raw = JSON.stringify(PUSH_PAYLOAD);
    const res = await postWebhook({ body: raw, signature: sign(raw, 'wrong-secret') });

    expect(res.status).toBe(401);
    expect(twitterClient.postTweet).not.toHaveBeenCalled();
  });

  it('ignores non-push events (e.g. ping) with 200 and never posts', async () => {
    twitterClient.postTweet.mockClear();
    const raw = JSON.stringify(PUSH_PAYLOAD);
    const res = await postWebhook({ body: raw, signature: sign(raw), event: 'ping' });

    expect(res.status).toBe(200);
    expect(twitterClient.postTweet).not.toHaveBeenCalled();
  });
});

describe('POST /webhook/github — multi-user product path', () => {
  // A repo that is NOT in ALLOWED_REPOS and uses its OWN per-repo webhook secret,
  // owned by a real seeded user. Proves the DB-backed multi-user resolution:
  // per-repo secret verification + user attribution (not the legacy 'default').
  const MU_USER = 'github:90000002';
  const MU_REPO = 'mira-builds/design-system';
  const MU_SECRET = 'fixture-secret-mira-design';

  beforeAll(() => {
    database.upsertUser({
      userId: MU_USER,
      githubUsername: 'mira-builds',
      displayName: 'Mira Builds',
      email: 'mira-builds@fixtures.invalid',
      tier: 'free',
    });
    database.addUserRepo(MU_USER, MU_REPO, MU_SECRET);
  });

  beforeEach(() => twitterClient.postTweet.mockClear());

  function muPayload(sha) {
    return JSON.stringify({
      ...PUSH_PAYLOAD,
      after: sha,
      repository: {
        ...PUSH_PAYLOAD.repository,
        name: 'design-system',
        full_name: MU_REPO,
        owner: { name: 'mira-builds', login: 'mira-builds', id: 90000002 },
      },
      commits: [{ ...PUSH_PAYLOAD.commits[0], id: sha }],
    });
  }

  it('authorizes via per-repo secret + DB enablement and attributes to the owner', async () => {
    const raw = muPayload('cafe0011223344556677889900aabbccddeeff00');
    const res = await postWebhook({ body: raw, signature: sign(raw, MU_SECRET) });

    expect(res.status).toBe(200);
    // userId is the seeded owner, NOT the legacy 'default'
    expect(res.body).toMatchObject({ status: 'OK', processed: 1, userId: MU_USER });
    expect(twitterClient.postTweet).toHaveBeenCalledTimes(1);
  });

  it('rejects the per-repo webhook when signed with the wrong secret', async () => {
    const raw = muPayload('beef0011223344556677889900aabbccddeeff11');
    const res = await postWebhook({ body: raw, signature: sign(raw, 'not-the-repo-secret') });

    expect(res.status).toBe(401);
    expect(twitterClient.postTweet).not.toHaveBeenCalled();
  });

  it('is idempotent: a redelivered commit is not posted twice', async () => {
    const sha = 'd00d0011223344556677889900aabbccddeeff22';
    const first = await postWebhook({ body: muPayload(sha), signature: sign(muPayload(sha), MU_SECRET) });
    expect(first.status).toBe(200);
    expect(twitterClient.postTweet).toHaveBeenCalledTimes(1);

    twitterClient.postTweet.mockClear();
    const second = await postWebhook({ body: muPayload(sha), signature: sign(muPayload(sha), MU_SECRET) });
    expect(second.status).toBe(200);
    expect(twitterClient.postTweet).not.toHaveBeenCalled(); // skipped as already tweeted
  });

  it('commit intelligence filters a noise commit (lockfile bump) — never posts it', async () => {
    twitterClient.postTweet.mockClear();
    const noiseSha = 'face0011223344556677889900aabbccddeeff33';
    const raw = JSON.stringify({
      ...PUSH_PAYLOAD,
      after: noiseSha,
      repository: {
        ...PUSH_PAYLOAD.repository,
        name: 'design-system',
        full_name: MU_REPO,
        owner: { name: 'mira-builds', login: 'mira-builds', id: 90000002 },
      },
      commits: [
        {
          ...PUSH_PAYLOAD.commits[0],
          id: noiseSha,
          message: 'chore: bump dependencies',
          added: [],
          modified: ['pnpm-lock.yaml'],
          removed: [],
        },
      ],
    });
    const res = await postWebhook({ body: raw, signature: sign(raw, MU_SECRET) });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ processed: 0, total: 0 });
    expect(res.body.triage).toMatchObject({ totalCommits: 1, worthy: 0, skipped: 1 });
    expect(twitterClient.postTweet).not.toHaveBeenCalled();
  });
});
