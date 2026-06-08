#!/usr/bin/env node
/**
 * Deterministic seed script for gitlogs.
 *
 * Loads fixtures/seed-data.json and writes it into the sql.js-backed SQLite
 * database exclusively through the REAL exported write paths in src/database.js
 * (upsertUser, storeOAuthToken, addUserRepo, saveTweetId). Those helpers call the
 * module's internal saveDatabase() after every write, and closeDatabase() performs
 * a final flush, so the in-memory DB is persisted to the .db file on disk.
 *
 * Idempotent: the existing .db file is deleted up front (logged) and recreated
 * fresh, so re-running never duplicates rows.
 *
 * Failure policy (per repo owner): fail LOUDLY. No try/catch-swallow, no
 * fallbacks, no silent skips. On any insert failure we throw with the offending
 * row so the failure is debuggable from the error alone.
 */

const fs = require('fs');
const path = require('path');

const FIXTURES_PATH = path.join(__dirname, '..', 'fixtures', 'seed-data.json');

// Resolve the SAME db path that src/database.js will use (config -> DATABASE_PATH
// env, default ./tweets.db), relative to the project root, NOT to this script.
const PROJECT_ROOT = path.join(__dirname, '..');
const DB_FILE_PATH = process.env.DATABASE_PATH || './tweets.db';
const DB_ABS_PATH = path.isAbsolute(DB_FILE_PATH)
  ? DB_FILE_PATH
  : path.join(PROJECT_ROOT, DB_FILE_PATH);

function loadFixtures() {
  if (!fs.existsSync(FIXTURES_PATH)) {
    throw new Error(`Fixtures file not found at ${FIXTURES_PATH}`);
  }
  const raw = fs.readFileSync(FIXTURES_PATH, 'utf8');
  const data = JSON.parse(raw); // JSON.parse throws loudly on malformed JSON
  for (const key of ['users', 'repos', 'tweets']) {
    if (!Array.isArray(data[key])) {
      throw new Error(`Fixtures malformed: expected array at key "${key}"`);
    }
  }
  return data;
}

function wipeExistingDatabase() {
  // src/database.js auto-initializes on require and reads DB_FILE_PATH at that
  // moment. Delete the file BEFORE requiring the module so it starts fresh.
  if (fs.existsSync(DB_ABS_PATH)) {
    console.log(`Deleting existing database for a fresh, idempotent seed: ${DB_ABS_PATH}`);
    fs.unlinkSync(DB_ABS_PATH);
  } else {
    console.log(`No existing database at ${DB_ABS_PATH} (nothing to delete).`);
  }
}

async function seed() {
  const fixtures = loadFixtures();

  wipeExistingDatabase();

  // Require AFTER wiping so the module's auto-init builds a fresh schema.
  const db = require('../src/database');

  // The module auto-inits on require; awaiting initDatabase() resolves the same
  // cached promise. If init failed it leaves db null/dbReady false, so we probe
  // a write path and fail loudly if the DB is not actually usable.
  await db.initDatabase();

  // -- Users ---------------------------------------------------------------
  let userCount = 0;
  for (const user of fixtures.users) {
    const result = db.upsertUser(user);
    if (!result) {
      throw new Error(
        `upsertUser returned no row (DB not ready or insert failed). Offending row: ${JSON.stringify(user)}`
      );
    }
    userCount++;
  }
  console.log(`Inserted ${userCount} users.`);

  // -- X OAuth tokens (obviously-fake placeholders) ------------------------
  let tokenCount = 0;
  for (const t of fixtures.oauthTokens || []) {
    const ok = db.storeOAuthToken(t.token, t.userId);
    if (!ok) {
      throw new Error(`storeOAuthToken failed. Offending row: ${JSON.stringify(t)}`);
    }
    tokenCount++;
  }
  console.log(`Inserted ${tokenCount} fixture OAuth tokens.`);

  // -- Repos ---------------------------------------------------------------
  let repoCount = 0;
  for (const repo of fixtures.repos) {
    const ok = db.addUserRepo(repo.userId, repo.repoFullName, repo.webhookSecret || null);
    if (!ok) {
      throw new Error(`addUserRepo failed. Offending row: ${JSON.stringify(repo)}`);
    }
    repoCount++;
  }
  console.log(`Inserted ${repoCount} repos.`);

  // -- Tweets --------------------------------------------------------------
  // saveTweetId is the real write path for the tweets ledger. The tweets table
  // only stores (repo_name, commit_sha, tweet_id) here; user_id defaults to
  // 'default' and created_at defaults to CURRENT_TIMESTAMP. The rich
  // text/status/author/createdAt fields in the fixtures are intentionally NOT
  // persisted because the schema has no columns for them (see report).
  let tweetCount = 0;
  for (const tweet of fixtures.tweets) {
    const ok = await db.saveTweetId(tweet.repoName, tweet.commitSha, tweet.tweetId);
    if (!ok) {
      throw new Error(`saveTweetId failed. Offending row: ${JSON.stringify(tweet)}`);
    }
    tweetCount++;
  }
  console.log(`Inserted ${tweetCount} tweets.`);

  // Final flush + clean shutdown (closeDatabase performs a final saveDatabase()).
  db.closeDatabase();

  if (!fs.existsSync(DB_ABS_PATH)) {
    throw new Error(`Expected database file was not written to disk at ${DB_ABS_PATH}`);
  }
  const sizeBytes = fs.statSync(DB_ABS_PATH).size;
  if (sizeBytes === 0) {
    throw new Error(`Database file at ${DB_ABS_PATH} is 0 bytes after seeding — nothing was persisted.`);
  }

  console.log('--- Seed summary ---');
  console.log(`Users written:  ${userCount}`);
  console.log(`Repos written:  ${repoCount}`);
  console.log(`Tweets written: ${tweetCount}`);
  console.log(`OAuth tokens:   ${tokenCount}`);
  console.log(`Database file:  ${DB_ABS_PATH}`);
  console.log(`File size:      ${sizeBytes} bytes`);
}

seed()
  .then(() => {
    console.log('Seed complete.');
    process.exit(0);
  })
  .catch((err) => {
    // Fail loudly with full context and a non-zero exit code.
    console.error('SEED FAILED:', err && err.stack ? err.stack : err);
    process.exit(1);
  });
