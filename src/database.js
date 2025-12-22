const fs = require('fs');
const path = require('path');
const config = require('../config/config');

let db = null;
let SQL = null;
let dbReady = false;
let dbReadyPromise = null;

// File-based token storage (fallback when database is unavailable)
const TOKEN_FILE_PATH = path.join(process.cwd(), '.oauth_tokens.json');
const DB_FILE_PATH = config.database.path || './tweets.db';

function storeOAuthTokenFile(token, userId = 'default') {
  try {
    let tokens = {};
    if (fs.existsSync(TOKEN_FILE_PATH)) {
      tokens = JSON.parse(fs.readFileSync(TOKEN_FILE_PATH, 'utf8'));
    }
    tokens[userId] = token;
    fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify(tokens, null, 2), 'utf8');
    console.log(`💾 OAuth token stored in file for user: ${userId}`);
    return true;
  } catch (error) {
    console.error('❌ Error storing OAuth token to file:', error);
    return false;
  }
}

function getOAuthTokenFile(userId = 'default') {
  try {
    if (!fs.existsSync(TOKEN_FILE_PATH)) {
      return null;
    }
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE_PATH, 'utf8'));
    return data[userId] || data.default || null;
  } catch (error) {
    console.error('❌ Error reading OAuth token from file:', error);
    return null;
  }
}

// Save database to file
function saveDatabase() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE_PATH, buffer);
  } catch (error) {
    console.error('❌ Error saving database:', error);
  }
}

// Auto-save every 30 seconds
let saveInterval = null;

async function initDatabase() {
  if (dbReadyPromise) return dbReadyPromise;
  
  dbReadyPromise = (async () => {
    try {
      // Dynamic import for sql.js
      const initSqlJs = require('sql.js');
      SQL = await initSqlJs();
      
      // Load existing database or create new one
      if (fs.existsSync(DB_FILE_PATH)) {
        const buffer = fs.readFileSync(DB_FILE_PATH);
        db = new SQL.Database(buffer);
        console.log('✅ Database loaded from file');
      } else {
        db = new SQL.Database();
        console.log('✅ New database created');
      }
      
      // Create tables
      db.run(`
        -- Users table for multi-user support
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT UNIQUE NOT NULL,
          github_username TEXT,
          display_name TEXT,
          email TEXT,
          tier TEXT DEFAULT 'free',
          api_quota_limit INTEGER DEFAULT 100,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);

        -- User repositories association
        CREATE TABLE IF NOT EXISTS user_repos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          repo_full_name TEXT NOT NULL,
          webhook_secret TEXT,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, repo_full_name)
        );

        CREATE INDEX IF NOT EXISTS idx_user_repos_repo ON user_repos(repo_full_name);
        CREATE INDEX IF NOT EXISTS idx_user_repos_user ON user_repos(user_id);

        -- Repository context cache
        CREATE TABLE IF NOT EXISTS repo_contexts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          repo_full_name TEXT UNIQUE NOT NULL,
          context_json TEXT NOT NULL,
          readme_content TEXT,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_repo_contexts_name ON repo_contexts(repo_full_name);

        -- OAuth tokens with multi-user support
        CREATE TABLE IF NOT EXISTS oauth_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT DEFAULT 'default',
          token TEXT NOT NULL,
          expires_at REAL NOT NULL,
          refresh_token TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_oauth_expires ON oauth_tokens(expires_at DESC);
        CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_tokens(user_id);

        -- Tweets with user association
        CREATE TABLE IF NOT EXISTS tweets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT DEFAULT 'default',
          repo_name TEXT NOT NULL,
          commit_sha TEXT NOT NULL,
          tweet_id TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(commit_sha)
        );

        CREATE INDEX IF NOT EXISTS idx_repo_created ON tweets(repo_name, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_tweets_user ON tweets(user_id);

        -- API usage tracking for rate limiting
        CREATE TABLE IF NOT EXISTS api_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL DEFAULT 'default',
          endpoint TEXT NOT NULL,
          request_count INTEGER DEFAULT 1,
          period_start DATETIME NOT NULL,
          period_end DATETIME NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_api_usage_user_period ON api_usage(user_id, period_start);

        -- Original posts for quoting (one per repo)
        CREATE TABLE IF NOT EXISTS og_posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          repo_name TEXT UNIQUE NOT NULL,
          tweet_id TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_og_posts_repo ON og_posts(repo_name);

        -- GitHub user tokens for persistent storage with refresh token support
        CREATE TABLE IF NOT EXISTS github_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          github_user_id TEXT UNIQUE NOT NULL,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          user_json TEXT NOT NULL,
          expires_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_github_tokens_user ON github_tokens(github_user_id);

        -- Custom prompt templates per user
        CREATE TABLE IF NOT EXISTS user_prompt_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          template_id TEXT NOT NULL,
          template_name TEXT NOT NULL,
          template_content TEXT NOT NULL,
          is_active INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, template_id)
        );

        CREATE INDEX IF NOT EXISTS idx_prompt_templates_user ON user_prompt_templates(user_id);
        CREATE INDEX IF NOT EXISTS idx_prompt_templates_active ON user_prompt_templates(user_id, is_active);

        -- Persistent queue for surviving server restarts
        CREATE TABLE IF NOT EXISTS queue_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          queue_id TEXT UNIQUE NOT NULL,
          task_type TEXT NOT NULL,
          user_id TEXT DEFAULT 'default',
          data_json TEXT NOT NULL,
          priority INTEGER DEFAULT 2,
          status TEXT DEFAULT 'pending',
          retry_count INTEGER DEFAULT 0,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_items(status);
        CREATE INDEX IF NOT EXISTS idx_queue_priority ON queue_items(priority, created_at);
        CREATE INDEX IF NOT EXISTS idx_queue_user ON queue_items(user_id);
      `);
      
      // Save initial state
      saveDatabase();
      
      // Start auto-save interval
      saveInterval = setInterval(saveDatabase, 30000);
      
      dbReady = true;
      console.log('✅ Database initialized with sql.js (ARM64 compatible)');
      
    } catch (error) {
      console.error('❌ Database initialization failed:', error.message);
      db = null;
      dbReady = false;
    }
  })();
  
  return dbReadyPromise;
}

// Helper to ensure db is ready
function ensureDb() {
  if (!db || !dbReady) {
    return false;
  }
  return true;
}

// Helper to run a query and get first result
function getOne(sql, params = []) {
  if (!ensureDb()) return null;
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  } catch (error) {
    console.error('❌ Query error:', error);
    return null;
  }
}

// Helper to run a query and get all results
function getAll(sql, params = []) {
  if (!ensureDb()) return [];
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (error) {
    console.error('❌ Query error:', error);
    return [];
  }
}

// Helper to run a statement
function run(sql, params = []) {
  if (!ensureDb()) return false;
  try {
    db.run(sql, params);
    saveDatabase(); // Save after modifications
    return true;
  } catch (error) {
    console.error('❌ Query error:', error);
    return false;
  }
}

// ============================================
// Tweet Functions
// ============================================

async function getLastTweetId(repoName) {
  const row = getOne(
    'SELECT tweet_id FROM tweets WHERE repo_name = ? ORDER BY created_at DESC LIMIT 1',
    [repoName]
  );
  return row ? row.tweet_id : null;
}

async function saveTweetId(repoName, commitSha, tweetId) {
  const success = run(
    'INSERT OR IGNORE INTO tweets (repo_name, commit_sha, tweet_id) VALUES (?, ?, ?)',
    [repoName, commitSha, tweetId]
  );
  if (success) {
    console.log(`💾 Saved tweet ID: ${tweetId}`);
  }
  return success;
}

async function getTweetsForRepo(repoName) {
  return getAll(
    'SELECT * FROM tweets WHERE repo_name = ? ORDER BY created_at DESC',
    [repoName]
  );
}

// ============================================
// OG Post Functions
// ============================================

async function setOgPost(repoName, tweetId) {
  const success = run(
    `INSERT INTO og_posts (repo_name, tweet_id) VALUES (?, ?)
     ON CONFLICT(repo_name) DO UPDATE SET tweet_id = excluded.tweet_id, created_at = CURRENT_TIMESTAMP`,
    [repoName, tweetId]
  );
  if (success) {
    console.log(`💾 OG post set for ${repoName}: ${tweetId}`);
  }
  return success;
}

async function getOgPost(repoName) {
  const row = getOne('SELECT tweet_id FROM og_posts WHERE repo_name = ?', [repoName]);
  return row ? row.tweet_id : null;
}

// ============================================
// OAuth Token Functions (X/Twitter - per-user)
// ============================================

/**
 * Store X OAuth token for a specific user
 * @param {object} token - OAuth token object
 * @param {string} userId - User ID (use GitHub user ID like 'github:123456' for per-user tokens)
 */
function storeOAuthToken(token, userId = 'default') {
  if (!ensureDb()) {
    return storeOAuthTokenFile(token, userId);
  }
  
  try {
    run('DELETE FROM oauth_tokens WHERE user_id = ?', [userId]);
    run(
      'INSERT INTO oauth_tokens (user_id, token, expires_at, refresh_token) VALUES (?, ?, ?, ?)',
      [userId, JSON.stringify(token), token.expires_at || 0, token.refresh_token || null]
    );
    console.log(`💾 X OAuth token stored in database for user: ${userId}`);
    return true;
  } catch (error) {
    console.error('❌ Error storing OAuth token:', error);
    return storeOAuthTokenFile(token, userId);
  }
}

/**
 * Get X OAuth token for a specific user
 * Falls back to 'default' if user-specific token not found (for backward compatibility)
 * @param {string} userId - User ID to get token for
 */
function getOAuthToken(userId = 'default') {
  if (!ensureDb()) {
    return getOAuthTokenFile(userId);
  }
  
  // Try user-specific token first
  let row = getOne(
    'SELECT token FROM oauth_tokens WHERE user_id = ? ORDER BY expires_at DESC LIMIT 1',
    [userId]
  );
  
  if (row && row.token) {
    return JSON.parse(row.token);
  }
  
  // Fall back to 'default' for backward compatibility (only if not already querying default)
  if (userId !== 'default') {
    row = getOne(
      'SELECT token FROM oauth_tokens WHERE user_id = ? ORDER BY expires_at DESC LIMIT 1',
      ['default']
    );
    if (row && row.token) {
      console.log(`⚠️  Using legacy 'default' X OAuth token for user: ${userId}`);
      return JSON.parse(row.token);
    }
  }
  
  return getOAuthTokenFile(userId);
}

/**
 * Check if X OAuth token is valid for a specific user
 * @param {string} userId - User ID to check
 */
function isOAuthTokenValid(userId = 'default') {
  const token = getOAuthToken(userId);
  if (!token) return false;
  const expiresAt = token.expires_at || 0;
  return Date.now() / 1000 < expiresAt;
}

/**
 * Get X OAuth refresh token for a specific user
 * @param {string} userId - User ID to get refresh token for
 */
function getRefreshToken(userId = 'default') {
  if (!ensureDb()) {
    const token = getOAuthTokenFile(userId);
    return token ? token.refresh_token : null;
  }
  
  // Try user-specific token first
  let row = getOne(
    'SELECT refresh_token FROM oauth_tokens WHERE user_id = ? ORDER BY expires_at DESC LIMIT 1',
    [userId]
  );
  
  if (row && row.refresh_token) {
    return row.refresh_token;
  }
  
  // Fall back to 'default' for backward compatibility
  if (userId !== 'default') {
    row = getOne(
      'SELECT refresh_token FROM oauth_tokens WHERE user_id = ? ORDER BY expires_at DESC LIMIT 1',
      ['default']
    );
    if (row && row.refresh_token) {
      return row.refresh_token;
    }
  }
  
  const token = getOAuthTokenFile(userId);
  return token ? token.refresh_token : null;
}

/**
 * Delete X OAuth token for a specific user
 * @param {string} userId - User ID to delete token for
 */
function deleteOAuthToken(userId) {
  if (!ensureDb()) return false;
  
  const success = run('DELETE FROM oauth_tokens WHERE user_id = ?', [userId]);
  if (success) {
    console.log(`🗑️ X OAuth token deleted for user: ${userId}`);
  }
  return success;
}

/**
 * Get X OAuth user ID for a GitHub user (maps github user to their X auth)
 * Returns the userId to use for X OAuth operations
 * @param {string} githubUserId - GitHub user ID (without 'github:' prefix)
 */
function getXOAuthUserId(githubUserId) {
  return `github:${githubUserId}`;
}

// ============================================
// User Management Functions
// ============================================

function upsertUser(userData) {
  if (!ensureDb()) return null;
  
  run(
    `INSERT INTO users (user_id, github_username, display_name, email, tier)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       github_username = excluded.github_username,
       display_name = excluded.display_name,
       email = excluded.email,
       updated_at = CURRENT_TIMESTAMP`,
    [
      userData.userId,
      userData.githubUsername || null,
      userData.displayName || null,
      userData.email || null,
      userData.tier || 'free'
    ]
  );
  
  return getUser(userData.userId);
}

function getUser(userId) {
  return getOne('SELECT * FROM users WHERE user_id = ?', [userId]);
}

function getUserByRepo(repoFullName) {
  return getOne(
    `SELECT u.* FROM users u
     JOIN user_repos ur ON u.user_id = ur.user_id
     WHERE ur.repo_full_name = ? AND ur.is_active = 1
     LIMIT 1`,
    [repoFullName]
  );
}

function addUserRepo(userId, repoFullName, webhookSecret = null) {
  const success = run(
    `INSERT INTO user_repos (user_id, repo_full_name, webhook_secret)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, repo_full_name) DO UPDATE SET
       webhook_secret = COALESCE(excluded.webhook_secret, webhook_secret),
       is_active = 1`,
    [userId, repoFullName, webhookSecret]
  );
  
  if (success) {
    console.log(`📁 Repo ${repoFullName} associated with user ${userId}`);
  }
  return success;
}

function getUserRepos(userId) {
  return getAll('SELECT * FROM user_repos WHERE user_id = ?', [userId]);
}

function getRepoWebhookSecret(repoFullName) {
  const row = getOne(
    'SELECT webhook_secret FROM user_repos WHERE repo_full_name = ? AND is_active = 1 LIMIT 1',
    [repoFullName]
  );
  return row ? row.webhook_secret : null;
}

// ============================================
// Repo Posting Control Functions
// ============================================

function enableRepo(userId, repoFullName) {
  // Try to update existing
  run('UPDATE user_repos SET is_active = 1 WHERE user_id = ? AND repo_full_name = ?', [userId, repoFullName]);
  
  // Check if it exists, if not add it
  const existing = getOne('SELECT id FROM user_repos WHERE user_id = ? AND repo_full_name = ?', [userId, repoFullName]);
  if (!existing) {
    return addUserRepo(userId, repoFullName);
  }
  
  console.log(`✅ Enabled posting for ${repoFullName}`);
  return true;
}

function disableRepo(userId, repoFullName) {
  const success = run(
    'UPDATE user_repos SET is_active = 0 WHERE user_id = ? AND repo_full_name = ?',
    [userId, repoFullName]
  );
  if (success) {
    console.log(`🚫 Disabled posting for ${repoFullName}`);
  }
  return success;
}

function isRepoEnabled(repoFullName) {
  if (!ensureDb()) {
    console.log(`⚠️  Database not ready, cannot check if repo ${repoFullName} is enabled`);
    return false;
  }
  
  const row = getOne(
    'SELECT is_active FROM user_repos WHERE repo_full_name = ? AND is_active = 1 LIMIT 1',
    [repoFullName]
  );
  
  const isEnabled = row ? row.is_active === 1 : false;
  console.log(`🗄️  DB check for ${repoFullName}: row=${JSON.stringify(row)}, isEnabled=${isEnabled}`);
  
  return isEnabled;
}

function getRepoStatus(userId, repoFullName) {
  const row = getOne(
    'SELECT is_active FROM user_repos WHERE user_id = ? AND repo_full_name = ?',
    [userId, repoFullName]
  );
  return row ? { enabled: row.is_active === 1 } : null;
}

// ============================================
// Repository Context Functions
// ============================================

function storeRepoContext(repoFullName, context, readmeContent = '') {
  const success = run(
    `INSERT INTO repo_contexts (repo_full_name, context_json, readme_content, last_updated)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(repo_full_name) DO UPDATE SET
       context_json = excluded.context_json,
       readme_content = excluded.readme_content,
       last_updated = CURRENT_TIMESTAMP`,
    [repoFullName, JSON.stringify(context), readmeContent]
  );
  
  if (success) {
    console.log(`📝 Repo context cached for: ${repoFullName}`);
  }
  return success;
}

function getRepoContext(repoFullName) {
  const row = getOne('SELECT * FROM repo_contexts WHERE repo_full_name = ?', [repoFullName]);
  if (!row) return null;
  
  return {
    ...JSON.parse(row.context_json),
    readme_content: row.readme_content,
    last_updated: row.last_updated
  };
}

function isRepoContextStale(repoFullName, maxAgeHours = 24) {
  const row = getOne('SELECT last_updated FROM repo_contexts WHERE repo_full_name = ?', [repoFullName]);
  if (!row) return true;
  
  const lastUpdated = new Date(row.last_updated);
  const ageMs = Date.now() - lastUpdated.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  
  return ageHours > maxAgeHours;
}

// ============================================
// GitHub Token Functions (persistent storage with refresh token support)
// ============================================

function storeGithubToken(githubUserId, accessToken, user, expiresAt = null, refreshToken = null) {
  if (!ensureDb()) {
    console.warn('⚠️ Database not ready, cannot store GitHub token');
    return false;
  }
  
  try {
    // expiresAt can be null for classic OAuth apps (tokens don't expire)
    const expiry = expiresAt ? new Date(expiresAt).toISOString() : null;
    
    run(
      `INSERT INTO github_tokens (github_user_id, access_token, refresh_token, user_json, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(github_user_id) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = COALESCE(excluded.refresh_token, github_tokens.refresh_token),
         user_json = excluded.user_json,
         expires_at = excluded.expires_at,
         updated_at = CURRENT_TIMESTAMP`,
      [githubUserId, accessToken, refreshToken, JSON.stringify(user), expiry]
    );
    
    const hasRefresh = refreshToken ? ' (with refresh token)' : ' (no refresh token - classic OAuth)';
    console.log(`💾 GitHub token stored for user: ${user.login || githubUserId}${hasRefresh}`);
    return true;
  } catch (error) {
    console.error('❌ Error storing GitHub token:', error);
    return false;
  }
}

function getGithubToken(githubUserId) {
  if (!ensureDb()) {
    return null;
  }
  
  const row = getOne(
    'SELECT * FROM github_tokens WHERE github_user_id = ?',
    [githubUserId]
  );
  
  if (!row) return null;
  
  return {
    token: row.access_token,
    refreshToken: row.refresh_token,
    user: JSON.parse(row.user_json),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function isGithubTokenExpired(githubUserId) {
  const tokenData = getGithubToken(githubUserId);
  if (!tokenData) return true;
  
  // If no expiry set (classic OAuth), token never expires
  if (!tokenData.expiresAt) {
    return false;
  }
  
  const expiresAt = new Date(tokenData.expiresAt);
  const now = new Date();
  return now >= expiresAt;
}

function hasValidGithubToken(githubUserId) {
  const tokenData = getGithubToken(githubUserId);
  if (!tokenData) return false;
  
  // If token is expired but we have a refresh token, it's still "valid" (refreshable)
  if (isGithubTokenExpired(githubUserId)) {
    return !!tokenData.refreshToken;
  }
  
  return true;
}

function deleteGithubToken(githubUserId) {
  if (!ensureDb()) return false;
  
  const success = run('DELETE FROM github_tokens WHERE github_user_id = ?', [githubUserId]);
  if (success) {
    console.log(`🗑️ GitHub token deleted for user: ${githubUserId}`);
  }
  return success;
}

// Alias for backward compatibility
function getValidGithubTokenData(githubUserId) {
  return getGithubToken(githubUserId);
}

function isGithubTokenValid(githubUserId) {
  return hasValidGithubToken(githubUserId);
}

// ============================================
// API Usage Tracking Functions
// ============================================

function trackApiUsage(userId, endpoint = 'gemini') {
  if (!ensureDb()) return;
  
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  const periodEnd = new Date(periodStart.getTime() + 3600000);
  
  const existing = getOne(
    'SELECT id, request_count FROM api_usage WHERE user_id = ? AND endpoint = ? AND period_start = ?',
    [userId, endpoint, periodStart.toISOString()]
  );
  
  if (existing) {
    run('UPDATE api_usage SET request_count = request_count + 1 WHERE id = ?', [existing.id]);
  } else {
    run(
      'INSERT INTO api_usage (user_id, endpoint, request_count, period_start, period_end) VALUES (?, ?, 1, ?, ?)',
      [userId, endpoint, periodStart.toISOString(), periodEnd.toISOString()]
    );
  }
}

function getApiUsage(userId, endpoint = 'gemini') {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  
  const row = getOne(
    'SELECT request_count FROM api_usage WHERE user_id = ? AND endpoint = ? AND period_start = ?',
    [userId, endpoint, periodStart.toISOString()]
  );
  
  return row ? row.request_count : 0;
}

function isUserOverQuota(userId, endpoint = 'gemini') {
  const user = getUser(userId);
  const limit = user ? user.api_quota_limit : 100;
  const usage = getApiUsage(userId, endpoint);
  return usage >= limit;
}

// ============================================
// Prompt Template Functions
// ============================================

function savePromptTemplate(userId, templateId, templateName, templateContent) {
  if (!ensureDb()) return false;
  
  const success = run(
    `INSERT INTO user_prompt_templates (user_id, template_id, template_name, template_content, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, template_id) DO UPDATE SET
       template_name = excluded.template_name,
       template_content = excluded.template_content,
       updated_at = CURRENT_TIMESTAMP`,
    [userId, templateId, templateName, templateContent]
  );
  
  if (success) {
    console.log(`📝 Prompt template saved for user ${userId}: ${templateId}`);
  }
  return success;
}

function getPromptTemplates(userId) {
  if (!ensureDb()) return [];
  return getAll('SELECT * FROM user_prompt_templates WHERE user_id = ? ORDER BY created_at DESC', [userId]);
}

function getActivePromptTemplate(userId) {
  if (!ensureDb()) return null;
  return getOne('SELECT * FROM user_prompt_templates WHERE user_id = ? AND is_active = 1', [userId]);
}

function setActivePromptTemplate(userId, templateId) {
  if (!ensureDb()) return false;
  
  // First, deactivate all templates for this user
  run('UPDATE user_prompt_templates SET is_active = 0 WHERE user_id = ?', [userId]);
  
  // If templateId is null or 'default', just deactivate (use default)
  if (!templateId || templateId === 'default') {
    console.log(`📝 Reset to default prompt template for user ${userId}`);
    return true;
  }
  
  // Activate the specified template
  const success = run(
    'UPDATE user_prompt_templates SET is_active = 1 WHERE user_id = ? AND template_id = ?',
    [userId, templateId]
  );
  
  if (success) {
    console.log(`📝 Activated prompt template ${templateId} for user ${userId}`);
  }
  return success;
}

function deletePromptTemplate(userId, templateId) {
  if (!ensureDb()) return false;
  
  const success = run(
    'DELETE FROM user_prompt_templates WHERE user_id = ? AND template_id = ?',
    [userId, templateId]
  );
  
  if (success) {
    console.log(`🗑️ Deleted prompt template ${templateId} for user ${userId}`);
  }
  return success;
}

// ============================================
// Queue Persistence Functions
// ============================================

/**
 * Save a queue item to the database for persistence
 * @param {object} item - Queue item to persist
 */
function saveQueueItem(item) {
  if (!ensureDb()) return false;
  
  const success = run(
    `INSERT INTO queue_items (queue_id, task_type, user_id, data_json, priority, status, retry_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(queue_id) DO UPDATE SET
       status = excluded.status,
       retry_count = excluded.retry_count,
       error_message = excluded.error_message,
       updated_at = CURRENT_TIMESTAMP`,
    [
      item.id,
      item.taskType,
      item.userId || 'default',
      JSON.stringify(item.data),
      item.priority || 2,
      item.status || 'pending',
      item.retryCount || 0
    ]
  );
  
  return success;
}

/**
 * Update queue item status
 * @param {string} queueId - Queue item ID
 * @param {string} status - New status
 * @param {string} errorMessage - Optional error message
 */
function updateQueueItemStatus(queueId, status, errorMessage = null) {
  if (!ensureDb()) return false;
  
  if (errorMessage) {
    return run(
      'UPDATE queue_items SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE queue_id = ?',
      [status, errorMessage, queueId]
    );
  }
  
  return run(
    'UPDATE queue_items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE queue_id = ?',
    [status, queueId]
  );
}

/**
 * Increment retry count for a queue item
 * @param {string} queueId - Queue item ID
 */
function incrementQueueItemRetry(queueId) {
  if (!ensureDb()) return false;
  
  return run(
    'UPDATE queue_items SET retry_count = retry_count + 1, status = ?, updated_at = CURRENT_TIMESTAMP WHERE queue_id = ?',
    ['retrying', queueId]
  );
}

/**
 * Get all pending/retrying queue items (for restoration on startup)
 * @returns {Array} - Array of queue items
 */
function getPendingQueueItems() {
  if (!ensureDb()) return [];
  
  const rows = getAll(
    `SELECT * FROM queue_items 
     WHERE status IN ('pending', 'retrying', 'processing') 
     ORDER BY priority ASC, created_at ASC`
  );
  
  return rows.map(row => ({
    id: row.queue_id,
    taskType: row.task_type,
    userId: row.user_id,
    data: JSON.parse(row.data_json),
    priority: row.priority,
    status: row.status,
    retryCount: row.retry_count,
    createdAt: new Date(row.created_at).getTime(),
    errorMessage: row.error_message
  }));
}

/**
 * Delete a queue item (after completion or final failure)
 * @param {string} queueId - Queue item ID
 */
function deleteQueueItem(queueId) {
  if (!ensureDb()) return false;
  
  return run('DELETE FROM queue_items WHERE queue_id = ?', [queueId]);
}

/**
 * Mark processing items as pending (for restart recovery)
 * Items that were processing when server stopped should be retried
 */
function resetProcessingQueueItems() {
  if (!ensureDb()) return false;
  
  const count = getOne('SELECT COUNT(*) as count FROM queue_items WHERE status = ?', ['processing']);
  if (count && count.count > 0) {
    console.log(`🔄 Resetting ${count.count} processing queue items to pending`);
    return run(
      'UPDATE queue_items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE status = ?',
      ['pending', 'processing']
    );
  }
  return true;
}

/**
 * Clean up old completed/failed queue items (older than 24 hours)
 */
function cleanupOldQueueItems() {
  if (!ensureDb()) return false;
  
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return run(
    'DELETE FROM queue_items WHERE status IN (?, ?) AND updated_at < ?',
    ['completed', 'failed', oneDayAgo]
  );
}

/**
 * Get queue statistics
 */
function getQueueItemStats() {
  if (!ensureDb()) return null;
  
  const pending = getOne('SELECT COUNT(*) as count FROM queue_items WHERE status = ?', ['pending']);
  const processing = getOne('SELECT COUNT(*) as count FROM queue_items WHERE status = ?', ['processing']);
  const retrying = getOne('SELECT COUNT(*) as count FROM queue_items WHERE status = ?', ['retrying']);
  const failed = getOne('SELECT COUNT(*) as count FROM queue_items WHERE status = ?', ['failed']);
  
  return {
    pending: pending?.count || 0,
    processing: processing?.count || 0,
    retrying: retrying?.count || 0,
    failed: failed?.count || 0
  };
}

function closeDatabase() {
  if (saveInterval) {
    clearInterval(saveInterval);
  }
  if (db) {
    saveDatabase();
    db.close();
    console.log('👋 Database connection closed');
  }
}

// Initialize on module load
initDatabase();

module.exports = {
  // Initialization
  initDatabase,
  
  // Tweet functions
  getLastTweetId,
  saveTweetId,
  getTweetsForRepo,
  
  // OG post functions
  setOgPost,
  getOgPost,
  
  // X OAuth functions (per-user)
  storeOAuthToken,
  getOAuthToken,
  isOAuthTokenValid,
  getRefreshToken,
  deleteOAuthToken,
  getXOAuthUserId,
  
  // User management
  upsertUser,
  getUser,
  getUserByRepo,
  addUserRepo,
  getUserRepos,
  getRepoWebhookSecret,
  
  // Repo posting control
  enableRepo,
  disableRepo,
  isRepoEnabled,
  getRepoStatus,
  
  // Repository context
  storeRepoContext,
  getRepoContext,
  isRepoContextStale,
  
  // API usage tracking
  trackApiUsage,
  getApiUsage,
  isUserOverQuota,
  
  // GitHub token storage
  storeGithubToken,
  getGithubToken,
  isGithubTokenValid,
  deleteGithubToken,
  getValidGithubTokenData,
  
  // Prompt templates
  savePromptTemplate,
  getPromptTemplates,
  getActivePromptTemplate,
  setActivePromptTemplate,
  deletePromptTemplate,
  
  // Queue persistence
  saveQueueItem,
  updateQueueItemStatus,
  incrementQueueItemRetry,
  getPendingQueueItems,
  deleteQueueItem,
  resetProcessingQueueItems,
  cleanupOldQueueItems,
  getQueueItemStats,
  
  // Database management
  closeDatabase
};
