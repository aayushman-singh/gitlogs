require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'https://gitlogs.aayushman.dev'
  },
  github: {
    webhookSecret: process.env.WEBHOOK_SECRET,
    allowedRepos: process.env.ALLOWED_REPOS 
      ? process.env.ALLOWED_REPOS.split(',').map(r => r.trim())
      : null,
    // GitHub OAuth for user login
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET
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
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
    // Refresh token (optional but recommended for OAuth 2.0 - obtained during OAuth flow)
    refreshToken: process.env.TWITTER_REFRESH_TOKEN,
    // Proxy URL for refresh token requests (used in post actions)
    proxyUrl: process.env.TWITTER_PROXY_URL || 'https://mainproxy.rule34.dev/proxy?q='
  },
  database: {
    path: process.env.DATABASE_PATH || './tweets.db',
    enabled: process.env.ENABLE_THREADING === 'true'
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  },
  // Queue configuration for rate limiting and retry mechanism
  queue: {
    // Gemini API rate limits: Free tier = 15 RPM, Pay-as-you-go = 1000+ RPM
    // Set conservatively by default, adjust based on your tier
    maxRequestsPerMinute: parseInt(process.env.QUEUE_MAX_RPM) || 15,
    // Number of retry attempts for failed requests
    maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES) || 3,
    // Base delay for exponential backoff (ms)
    baseRetryDelayMs: parseInt(process.env.QUEUE_BASE_RETRY_DELAY) || 2000,
    // Maximum retry delay (ms) - caps exponential backoff
    maxRetryDelayMs: parseInt(process.env.QUEUE_MAX_RETRY_DELAY) || 60000,
    // How often to process the queue (ms)
    processingIntervalMs: parseInt(process.env.QUEUE_PROCESSING_INTERVAL) || 1000,
    // Per-user hourly quota (for commercial multi-user deployment)
    userQuotaLimit: parseInt(process.env.USER_QUOTA_LIMIT) || 100
  },
  // Multi-user configuration
  multiUser: {
    enabled: process.env.MULTI_USER_ENABLED === 'true',
    // Default tier for new users
    defaultTier: process.env.DEFAULT_USER_TIER || 'free',
    // Tier-based quotas
    tierQuotas: {
      free: parseInt(process.env.FREE_TIER_QUOTA) || 50,
      pro: parseInt(process.env.PRO_TIER_QUOTA) || 500,
      enterprise: parseInt(process.env.ENTERPRISE_TIER_QUOTA) || 5000
    }
  }
};

