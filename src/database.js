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

function storeOAuthTokenFile(token) {
  try {
    fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify(token, null, 2), 'utf8');
    console.log('💾 OAuth token stored in file (.oauth_tokens.json)');
    return true;
  } catch (error) {
    console.error('❌ Error storing OAuth token to file:', error);
    return false;
  }
}

function getOAuthTokenFile() {
  try {
    if (!fs.existsSync(TOKEN_FILE_PATH)) {
      return null;
    }
    const data = fs.readFileSync(TOKEN_FILE_PATH, 'utf8');
    return JSON.parse(data);
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
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL,
        expires_at REAL NOT NULL,
        refresh_token TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_oauth_expires 
      ON oauth_tokens(expires_at DESC);
      
      ${config.database.enabled ? `
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
      ` : ''}
    `);
    
    console.log('✅ Database initialized');
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

function storeOAuthToken(token) {
  // Try database first, fall back to file storage
  if (db) {
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
      console.error('❌ Error storing OAuth token in database:', error);
      // Fall through to file storage
    }
  }
  
  // Fallback to file storage
  console.log('ℹ️  Using file-based token storage (database unavailable)');
  return storeOAuthTokenFile(token);
}

function getOAuthToken() {
  // Try database first, fall back to file storage
  if (db) {
    try {
      const stmt = db.prepare(`
        SELECT token FROM oauth_tokens 
        ORDER BY expires_at DESC 
        LIMIT 1
      `);
      
      const row = stmt.get();
      if (row) {
        return JSON.parse(row.token);
      }
    } catch (error) {
      console.error('❌ Error getting OAuth token from database:', error);
      // Fall through to file storage
    }
  }
  
  // Fallback to file storage
  return getOAuthTokenFile();
}

function isOAuthTokenValid() {
  const token = getOAuthToken();
  if (!token) return false;
  
  const expiresAt = token.expires_at || 0;
  return Date.now() / 1000 < expiresAt;
}

function getRefreshToken() {
  // Try database first, fall back to file storage
  if (db) {
    try {
      const stmt = db.prepare(`
        SELECT refresh_token FROM oauth_tokens 
        ORDER BY expires_at DESC 
        LIMIT 1
      `);
      
      const row = stmt.get();
      if (row && row.refresh_token) {
        return row.refresh_token;
      }
    } catch (error) {
      console.error('❌ Error getting refresh token from database:', error);
      // Fall through to file storage
    }
  }
  
  // Fallback to file storage
  const token = getOAuthTokenFile();
  return token ? token.refresh_token : null;
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

