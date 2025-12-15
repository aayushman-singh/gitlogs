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
    apiKey: process.env.TWITTER_API_KEY,
    apiSecret: process.env.TWITTER_API_SECRET,
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

