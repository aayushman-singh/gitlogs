const Database = require('better-sqlite3');
const config = require('../config/config');

let db = null;

function initDatabase() {
  if (!config.database.enabled) {
    console.log('ℹ️  Database disabled - threading not available');
    return;
  }

  try {
    db = new Database(config.database.path);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS tweets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_name TEXT NOT NULL,
        commit_sha TEXT NOT NULL,
        tweet_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(commit_sha)
      );
      
      CREATE INDEX IF NOT EXISTS idx_repo_created 
      ON tweets(repo_name, created_at DESC);
      
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL,
        expires_at REAL NOT NULL,
        refresh_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_oauth_expires 
      ON oauth_tokens(expires_at DESC);
    `);
    
    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
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

function storeOAuthToken(token) {
  if (!db) return false;

  try {
    // Delete old tokens
    const deleteStmt = db.prepare('DELETE FROM oauth_tokens');
    deleteStmt.run();
    
    // Insert new token
    const insertStmt = db.prepare(`
      INSERT INTO oauth_tokens (token, expires_at, refresh_token)
      VALUES (?, ?, ?)
    `);
    
    insertStmt.run(
      JSON.stringify(token),
      token.expires_at || 0,
      token.refresh_token || null
    );
    
    console.log('💾 OAuth token stored in database');
    return true;
  } catch (error) {
    console.error('❌ Error storing OAuth token:', error);
    return false;
  }
}

function getOAuthToken() {
  if (!db) return null;

  try {
    const stmt = db.prepare(`
      SELECT token FROM oauth_tokens 
      ORDER BY expires_at DESC 
      LIMIT 1
    `);
    
    const row = stmt.get();
    return row ? JSON.parse(row.token) : null;
  } catch (error) {
    console.error('❌ Error getting OAuth token:', error);
    return null;
  }
}

function isOAuthTokenValid() {
  const token = getOAuthToken();
  if (!token) return false;
  
  const expiresAt = token.expires_at || 0;
  return Date.now() / 1000 < expiresAt;
}

function getRefreshToken() {
  if (!db) return null;

  try {
    const stmt = db.prepare(`
      SELECT refresh_token FROM oauth_tokens 
      ORDER BY expires_at DESC 
      LIMIT 1
    `);
    
    const row = stmt.get();
    return row ? row.refresh_token : null;
  } catch (error) {
    console.error('❌ Error getting refresh token:', error);
    return null;
  }
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
  getLastTweetId,
  saveTweetId,
  getTweetsForRepo,
  storeOAuthToken,
  getOAuthToken,
  isOAuthTokenValid,
  getRefreshToken,
  closeDatabase
};

