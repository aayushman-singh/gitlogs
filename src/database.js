const Database = require('better-sqlite3');
const config = require('../config/config');

/**
 * SQLite database for storing tweet IDs
 * Used for threading commits from the same repo
 */

let db = null;

/**
 * Initialize database and create tables
 * Only runs if threading is enabled in config
 */
function initDatabase() {
  if (!config.database.enabled) {
    console.log('ℹ️  Database disabled - threading not available');
    return;
  }

  try {
    // Open database connection
    db = new Database(config.database.path);
    
    // Create tweets table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS tweets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_name TEXT NOT NULL,
        commit_sha TEXT NOT NULL,
        tweet_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        -- Index for faster lookups
        UNIQUE(commit_sha)
      );
      
      CREATE INDEX IF NOT EXISTS idx_repo_created 
      ON tweets(repo_name, created_at DESC);
    `);
    
    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    db = null;
  }
}

/**
 * Get the most recent tweet ID for a repository
 * Used to create thread continuity
 * 
 * @param {string} repoName - Repository full name (owner/repo)
 * @returns {Promise<string|null>} - Tweet ID or null
 */
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

/**
 * Save tweet ID to database
 * 
 * @param {string} repoName - Repository full name
 * @param {string} commitSha - Commit SHA
 * @param {string} tweetId - Posted tweet ID
 * @returns {Promise<boolean>} - Success status
 */
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
    // If unique constraint violation, commit was already posted
    if (error.code === 'SQLITE_CONSTRAINT') {
      console.warn(`⚠️  Commit ${commitSha} already posted`);
    } else {
      console.error('❌ Error saving tweet ID:', error);
    }
    return false;
  }
}

/**
 * Get all tweets for a repository
 * Useful for debugging or stats
 * 
 * @param {string} repoName - Repository full name
 * @returns {Promise<Array>} - Array of tweet records
 */
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
 * Close database connection
 * Call this when shutting down the server
 */
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
  closeDatabase
};

