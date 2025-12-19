const fs = require('fs');
const path = require('path');

let Database;
let db = null;

// Try to load better-sqlite3, handle gracefully if it fails
try {
  Database = require('better-sqlite3');
} catch (error) {
  console.error('❌ Failed to load better-sqlite3:', error.message);
  console.error('   This usually means native bindings are missing.');
  console.error('   OAuth tokens will be stored in a file instead.');
  Database = null;
}

const config = require('../config/config');

// File-based token storage (fallback when database is unavailable)
const TOKEN_FILE_PATH = path.join(process.cwd(), '.oauth_tokens.json');

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

function initDatabase() {
  // Database is always enabled for OAuth token storage
  // ENABLE_THREADING only controls tweet threading features
  
  if (!Database) {
    console.error('❌ Cannot initialize database: better-sqlite3 module not loaded');
    console.error('   Database features (OAuth token storage) will not work.');
    console.error('   Please fix the better-sqlite3 installation issue.');
    db = null;
    return;
  }
  
  try {
    db = new Database(config.database.path);
    
    // Core tables for multi-user support
    db.exec(`
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
        UNIQUE(user_id, repo_full_name),
        FOREIGN KEY (user_id) REFERENCES users(user_id)
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

      -- API usage tracking for rate limiting
      CREATE TABLE IF NOT EXISTS api_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        request_count INTEGER DEFAULT 1,
        period_start DATETIME NOT NULL,
        period_end DATETIME NOT NULL
      );

      -- Original posts for quoting (one per repo)
      CREATE TABLE IF NOT EXISTS og_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_name TEXT UNIQUE NOT NULL,
        tweet_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_og_posts_repo ON og_posts(repo_name);
    `);

    // Migration: Add missing user_id columns to existing tables
    // This handles databases created before multi-user support was added
    try {
      // Check if tweets table has user_id column, add it if missing
      const tweetsColumns = db.prepare("PRAGMA table_info(tweets)").all();
      const hasUserIdInTweets = tweetsColumns.some(col => col.name === 'user_id');

      if (!hasUserIdInTweets) {
        console.log('🔄 Migrating tweets table: adding user_id column');
        db.exec(`ALTER TABLE tweets ADD COLUMN user_id TEXT DEFAULT 'default'`);
      }

      // Check if oauth_tokens table has user_id column, add it if missing
      const oauthColumns = db.prepare("PRAGMA table_info(oauth_tokens)").all();
      const hasUserIdInOauth = oauthColumns.some(col => col.name === 'user_id');

      if (!hasUserIdInOauth) {
        console.log('🔄 Migrating oauth_tokens table: adding user_id column');
        db.exec(`ALTER TABLE oauth_tokens ADD COLUMN user_id TEXT DEFAULT 'default'`);
      }

      // Check if api_usage table has user_id column, add it if missing
      const apiColumns = db.prepare("PRAGMA table_info(api_usage)").all();
      const hasUserIdInApi = apiColumns.some(col => col.name === 'user_id');

      if (!hasUserIdInApi) {
        console.log('🔄 Migrating api_usage table: adding user_id column');
        db.exec(`ALTER TABLE api_usage ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'`);
      }

      // Create indexes for user_id columns (safe to run even if they exist)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_tweets_user ON tweets(user_id);
        CREATE INDEX IF NOT EXISTS idx_api_usage_user_period ON api_usage(user_id, period_start);
      `);

    } catch (migrationError) {
      console.error('❌ Database migration failed:', migrationError.message);
      // Continue with initialization even if migration fails
      // The app might still work with single-user mode
    }
    
    console.log('✅ Database initialized with multi-user support');
    if (!config.database.enabled) {
      console.log('ℹ️  Threading disabled - tweet threading not available');
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    console.error('   Error details:', error);
    db = null;
  }
}
async function getLastTweetId(repoName) {
  if (!db) return null;

  try {
    const stmt = db.prepare(`
      SELECT tweet_id 
      FROM tweets 
      WHERE repo_name = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    const row = stmt.get(repoName);
    return row ? row.tweet_id : null;
  } catch (error) {
    console.error('❌ Error getting last tweet ID:', error);
    return null;
  }
}

async function saveTweetId(repoName, commitSha, tweetId) {
  if (!db) return false;

  try {
    const stmt = db.prepare(`
      INSERT INTO tweets (repo_name, commit_sha, tweet_id)
      VALUES (?, ?, ?)
    `);
    
    stmt.run(repoName, commitSha, tweetId);
    console.log(`💾 Saved tweet ID: ${tweetId}`);
    return true;
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      console.warn(`⚠️  Commit ${commitSha} already posted`);
    } else {
      console.error('❌ Error saving tweet ID:', error);
    }
    return false;
  }
}

async function getTweetsForRepo(repoName) {
  if (!db) return [];

  try {
    const stmt = db.prepare(`
      SELECT * 
      FROM tweets 
      WHERE repo_name = ? 
      ORDER BY created_at DESC
    `);
    
    return stmt.all(repoName);
  } catch (error) {
    console.error('❌ Error getting tweets:', error);
    return [];
  }
}

/**
 * Set the original post (OG post) for a repository
 * This is the post that all commit tweets will quote
 */
async function setOgPost(repoName, tweetId) {
  if (!db) return false;

  try {
    const stmt = db.prepare(`
      INSERT INTO og_posts (repo_name, tweet_id)
      VALUES (?, ?)
      ON CONFLICT(repo_name) DO UPDATE SET
        tweet_id = excluded.tweet_id,
        created_at = CURRENT_TIMESTAMP
    `);
    
    stmt.run(repoName, tweetId);
    console.log(`💾 OG post set for ${repoName}: ${tweetId}`);
    return true;
  } catch (error) {
    console.error('❌ Error setting OG post:', error);
    return false;
  }
}

/**
 * Get the original post (OG post) tweet ID for a repository
 * Returns the tweet ID that commit tweets should quote
 */
async function getOgPost(repoName) {
  if (!db) return null;

  try {
    const stmt = db.prepare(`
      SELECT tweet_id 
      FROM og_posts 
      WHERE repo_name = ?
    `);
    
    const row = stmt.get(repoName);
    return row ? row.tweet_id : null;
  } catch (error) {
    console.error('❌ Error getting OG post:', error);
    return null;
  }
}

function storeOAuthToken(token, userId = 'default') {
  // Try database first, fall back to file storage
  if (db) {
    try {
      // Delete old tokens for this user
      const deleteStmt = db.prepare('DELETE FROM oauth_tokens WHERE user_id = ?');
      deleteStmt.run(userId);
      
      // Insert new token
      const insertStmt = db.prepare(`
        INSERT INTO oauth_tokens (user_id, token, expires_at, refresh_token)
        VALUES (?, ?, ?, ?)
      `);
      
      insertStmt.run(
        userId,
        JSON.stringify(token),
        token.expires_at || 0,
        token.refresh_token || null
      );
      
      console.log(`💾 OAuth token stored in database for user: ${userId}`);
      return true;
    } catch (error) {
      console.error('❌ Error storing OAuth token in database:', error);
      // Fall through to file storage
    }
  }
  
  // Fallback to file storage
  console.log('ℹ️  Using file-based token storage (database unavailable)');
  return storeOAuthTokenFile(token, userId);
}

function getOAuthToken(userId = 'default') {
  // Try database first, fall back to file storage
  if (db) {
    try {
      const stmt = db.prepare(`
        SELECT token FROM oauth_tokens 
        WHERE user_id = ?
        ORDER BY expires_at DESC 
        LIMIT 1
      `);
      
      const row = stmt.get(userId);
      if (row) {
        return JSON.parse(row.token);
      }
    } catch (error) {
      console.error('❌ Error getting OAuth token from database:', error);
      // Fall through to file storage
    }
  }
  
  // Fallback to file storage
  return getOAuthTokenFile(userId);
}

function isOAuthTokenValid(userId = 'default') {
  const token = getOAuthToken(userId);
  if (!token) return false;
  
  const expiresAt = token.expires_at || 0;
  return Date.now() / 1000 < expiresAt;
}

function getRefreshToken(userId = 'default') {
  // Try database first, fall back to file storage
  if (db) {
    try {
      const stmt = db.prepare(`
        SELECT refresh_token FROM oauth_tokens 
        WHERE user_id = ?
        ORDER BY expires_at DESC 
        LIMIT 1
      `);
      
      const row = stmt.get(userId);
      if (row && row.refresh_token) {
        return row.refresh_token;
      }
    } catch (error) {
      console.error('❌ Error getting refresh token from database:', error);
      // Fall through to file storage
    }
  }
  
  // Fallback to file storage
  const token = getOAuthTokenFile(userId);
  return token ? token.refresh_token : null;
}

// ============================================
// Multi-User Management Functions
// ============================================

/**
 * Create or update a user
 */
function upsertUser(userData) {
  if (!db) return null;
  
  try {
    const stmt = db.prepare(`
      INSERT INTO users (user_id, github_username, display_name, email, tier)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        github_username = excluded.github_username,
        display_name = excluded.display_name,
        email = excluded.email,
        updated_at = CURRENT_TIMESTAMP
    `);
    
    stmt.run(
      userData.userId,
      userData.githubUsername || null,
      userData.displayName || null,
      userData.email || null,
      userData.tier || 'free'
    );
    
    return getUser(userData.userId);
  } catch (error) {
    console.error('❌ Error upserting user:', error);
    return null;
  }
}

/**
 * Get user by ID
 */
function getUser(userId) {
  if (!db) return null;
  
  try {
    const stmt = db.prepare('SELECT * FROM users WHERE user_id = ?');
    return stmt.get(userId);
  } catch (error) {
    console.error('❌ Error getting user:', error);
    return null;
  }
}

/**
 * Get user by repository (find who owns a repo)
 */
function getUserByRepo(repoFullName) {
  if (!db) return null;
  
  try {
    const stmt = db.prepare(`
      SELECT u.* FROM users u
      JOIN user_repos ur ON u.user_id = ur.user_id
      WHERE ur.repo_full_name = ? AND ur.is_active = 1
      LIMIT 1
    `);
    return stmt.get(repoFullName);
  } catch (error) {
    console.error('❌ Error getting user by repo:', error);
    return null;
  }
}

/**
 * Associate a repository with a user
 */
function addUserRepo(userId, repoFullName, webhookSecret = null) {
  if (!db) return false;
  
  try {
    const stmt = db.prepare(`
      INSERT INTO user_repos (user_id, repo_full_name, webhook_secret)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, repo_full_name) DO UPDATE SET
        webhook_secret = COALESCE(excluded.webhook_secret, webhook_secret),
        is_active = 1
    `);
    
    stmt.run(userId, repoFullName, webhookSecret);
    console.log(`📁 Repo ${repoFullName} associated with user ${userId}`);
    return true;
  } catch (error) {
    console.error('❌ Error adding user repo:', error);
    return false;
  }
}

/**
 * Get all repositories for a user
 */
function getUserRepos(userId) {
  if (!db) return [];
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM user_repos WHERE user_id = ? AND is_active = 1
    `);
    return stmt.all(userId);
  } catch (error) {
    console.error('❌ Error getting user repos:', error);
    return [];
  }
}

/**
 * Get webhook secret for a repo
 */
function getRepoWebhookSecret(repoFullName) {
  if (!db) return null;
  
  try {
    const stmt = db.prepare(`
      SELECT webhook_secret FROM user_repos 
      WHERE repo_full_name = ? AND is_active = 1
      LIMIT 1
    `);
    const row = stmt.get(repoFullName);
    return row ? row.webhook_secret : null;
  } catch (error) {
    console.error('❌ Error getting repo webhook secret:', error);
    return null;
  }
}

// ============================================
// Repository Context Functions
// ============================================

/**
 * Store repository context for caching
 */
function storeRepoContext(repoFullName, context, readmeContent = '') {
  if (!db) return false;
  
  try {
    const stmt = db.prepare(`
      INSERT INTO repo_contexts (repo_full_name, context_json, readme_content, last_updated)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(repo_full_name) DO UPDATE SET
        context_json = excluded.context_json,
        readme_content = excluded.readme_content,
        last_updated = CURRENT_TIMESTAMP
    `);
    
    stmt.run(
      repoFullName,
      JSON.stringify(context),
      readmeContent
    );
    
    console.log(`📝 Repo context cached for: ${repoFullName}`);
    return true;
  } catch (error) {
    console.error('❌ Error storing repo context:', error);
    return false;
  }
}

/**
 * Get cached repository context
 */
function getRepoContext(repoFullName) {
  if (!db) return null;
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM repo_contexts WHERE repo_full_name = ?
    `);
    
    const row = stmt.get(repoFullName);
    if (!row) return null;
    
    return {
      ...JSON.parse(row.context_json),
      readme_content: row.readme_content,
      last_updated: row.last_updated
    };
  } catch (error) {
    console.error('❌ Error getting repo context:', error);
    return null;
  }
}

/**
 * Check if repo context is stale (older than specified hours)
 */
function isRepoContextStale(repoFullName, maxAgeHours = 24) {
  if (!db) return true;
  
  try {
    const stmt = db.prepare(`
      SELECT last_updated FROM repo_contexts WHERE repo_full_name = ?
    `);
    
    const row = stmt.get(repoFullName);
    if (!row) return true;
    
    const lastUpdated = new Date(row.last_updated);
    const ageMs = Date.now() - lastUpdated.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    
    return ageHours > maxAgeHours;
  } catch (error) {
    return true;
  }
}

// ============================================
// API Usage Tracking Functions
// ============================================

/**
 * Track API usage for a user
 */
function trackApiUsage(userId, endpoint = 'gemini') {
  if (!db) return;
  
  try {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    const periodEnd = new Date(periodStart.getTime() + 3600000);
    
    const checkStmt = db.prepare(`
      SELECT id, request_count FROM api_usage 
      WHERE user_id = ? AND endpoint = ? AND period_start = ?
    `);
    
    const existing = checkStmt.get(userId, endpoint, periodStart.toISOString());
    
    if (existing) {
      const updateStmt = db.prepare(`
        UPDATE api_usage SET request_count = request_count + 1 WHERE id = ?
      `);
      updateStmt.run(existing.id);
    } else {
      const insertStmt = db.prepare(`
        INSERT INTO api_usage (user_id, endpoint, request_count, period_start, period_end)
        VALUES (?, ?, 1, ?, ?)
      `);
      insertStmt.run(userId, endpoint, periodStart.toISOString(), periodEnd.toISOString());
    }
  } catch (error) {
    console.error('❌ Error tracking API usage:', error);
  }
}

/**
 * Get API usage for a user in the current hour
 */
function getApiUsage(userId, endpoint = 'gemini') {
  if (!db) return 0;
  
  try {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    
    const stmt = db.prepare(`
      SELECT request_count FROM api_usage 
      WHERE user_id = ? AND endpoint = ? AND period_start = ?
    `);
    
    const row = stmt.get(userId, endpoint, periodStart.toISOString());
    return row ? row.request_count : 0;
  } catch (error) {
    console.error('❌ Error getting API usage:', error);
    return 0;
  }
}

/**
 * Check if user has exceeded their API quota
 */
function isUserOverQuota(userId, endpoint = 'gemini') {
  const user = getUser(userId);
  const limit = user ? user.api_quota_limit : 100;
  const usage = getApiUsage(userId, endpoint);
  
  return usage >= limit;
}

function closeDatabase() {
  if (db) {
    db.close();
    console.log('👋 Database connection closed');
  }
}

// Initialize on module load
initDatabase();

module.exports = {
  // Tweet functions
  getLastTweetId,
  saveTweetId,
  getTweetsForRepo,
  
  // OG post functions (for quoting original post)
  setOgPost,
  getOgPost,
  
  // OAuth functions
  storeOAuthToken,
  getOAuthToken,
  isOAuthTokenValid,
  getRefreshToken,
  
  // User management
  upsertUser,
  getUser,
  getUserByRepo,
  addUserRepo,
  getUserRepos,
  getRepoWebhookSecret,
  
  // Repository context
  storeRepoContext,
  getRepoContext,
  isRepoContextStale,
  
  // API usage tracking
  trackApiUsage,
  getApiUsage,
  isUserOverQuota,
  
  // Database management
  closeDatabase
};

