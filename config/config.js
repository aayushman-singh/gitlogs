// Load environment variables from .env file
require('dotenv').config();

/**
 * Application configuration
 * All config values loaded from environment variables
 */
module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development'
  },

  // GitHub webhook configuration
  github: {
    webhookSecret: process.env.WEBHOOK_SECRET,
    // Optional: filter commits from specific repos only
    allowedRepos: process.env.ALLOWED_REPOS 
      ? process.env.ALLOWED_REPOS.split(',').map(r => r.trim())
      : null
  },

  // Twitter API configuration
  twitter: {
    apiKey: process.env.TWITTER_API_KEY,
    apiSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET
  },

  // Database configuration (optional for MVP)
  database: {
    path: process.env.DATABASE_PATH || './tweets.db',
    enabled: process.env.ENABLE_THREADING === 'true'
  }
};

