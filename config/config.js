require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development'
  },
  github: {
    webhookSecret: process.env.WEBHOOK_SECRET,
    allowedRepos: process.env.ALLOWED_REPOS 
      ? process.env.ALLOWED_REPOS.split(',').map(r => r.trim())
      : null
  },
  twitter: {
    // OAuth 2.0 credentials (primary method)
    clientId: process.env.OAUTH_CLIENT_ID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET,
    // OAuth 1.0a credentials (fallback - API Key = Consumer Key, API Secret = Consumer Secret)
    apiKey: process.env.TWITTER_API_KEY || process.env.TWITTER_CONSUMER_KEY,
    apiSecret: process.env.TWITTER_API_SECRET || process.env.TWITTER_CONSUMER_SECRET,
    // Access tokens (required for posting tweets - generate from X Developer Portal)
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET
  },
  database: {
    path: process.env.DATABASE_PATH || './tweets.db',
    enabled: process.env.ENABLE_THREADING === 'true'
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-pro'
  }
};

