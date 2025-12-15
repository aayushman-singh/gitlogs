const { Client, auth } = require('twitter-api-sdk');
const config = require('../config/config');

/**
 * X API v2 Endpoint Mapping:
 * 
 * POST statuses/update (v1.1) → Manage Posts (v2) → tweets.createTweet()
 * GET account/verify_credentials (v1.1) → Users lookup (v2) → users.findMyUser()
 * 
 * Reference: https://docs.x.com/x-api/migrate/x-api-endpoint-map
 */

// Initialize X API client
let twitterClient;

// Try bearer token first if available (simpler, no refresh needed)
if (config.twitter.bearerToken) {
  // Use bearer token authentication (app-only or user context bearer token)
  if (auth.OAuth2BearerToken) {
    const authClient = new auth.OAuth2BearerToken(config.twitter.bearerToken);
    twitterClient = new Client(authClient);
  } else {
    // Fallback: Use bearer token as access token in OAuth2User
    if (!config.twitter.clientId || !config.twitter.clientSecret) {
      throw new Error('OAuth 2.0 credentials (OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET) required when using bearer token');
    }
    const callbackUrl = process.env.OAUTH_CALLBACK_URL || `http://localhost:${config.server.port}/callback`;
    const authClient = new auth.OAuth2User({
      client_id: config.twitter.clientId,
      client_secret: config.twitter.clientSecret,
      callback: callbackUrl,
      scopes: ['tweet.read', 'tweet.write', 'users.read'],
    });
    authClient.token = {
      access_token: config.twitter.bearerToken,
      token_type: 'Bearer',
      refresh_token: 'dummy_refresh_token',
    };
    twitterClient = new Client(authClient);
  }
} else if (!config.twitter.accessToken) {
  throw new Error('X API access token (TWITTER_ACCESS_TOKEN) or bearer token (TWITTER_BEARER_TOKEN) is required');
} else if (config.twitter.refreshToken && config.twitter.clientId && config.twitter.clientSecret) {
  // Check if we have refresh token support (OAuth 2.0 flow)
  // OAuth 2.0 with refresh token support (full OAuth flow)
  const callbackUrl = process.env.OAUTH_CALLBACK_URL || `http://localhost:${config.server.port}/callback`;
  
  const authClient = new auth.OAuth2User({
    client_id: config.twitter.clientId,
    client_secret: config.twitter.clientSecret,
    callback: callbackUrl,
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  });

  authClient.token = {
    access_token: config.twitter.accessToken,
    token_type: 'Bearer',
    refresh_token: config.twitter.refreshToken,
  };

  twitterClient = new Client(authClient);
} else if (config.twitter.clientId && config.twitter.clientSecret) {
  // OAuth 2.0 without refresh token (static access token from developer portal)
  // Provide a dummy refresh token to prevent SDK errors, but it won't work for actual refresh
  const callbackUrl = process.env.OAUTH_CALLBACK_URL || `http://localhost:${config.server.port}/callback`;
  
  const authClient = new auth.OAuth2User({
    client_id: config.twitter.clientId,
    client_secret: config.twitter.clientSecret,
    callback: callbackUrl,
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  });

  // Set token with a dummy refresh token to prevent SDK errors
  // Note: Token refresh won't work - user will need to regenerate token when it expires
  authClient.token = {
    access_token: config.twitter.accessToken,
    token_type: 'Bearer',
    refresh_token: 'dummy_refresh_token', // Dummy to prevent SDK error
  };

  // Override refreshAccessToken to provide helpful error
  const originalRefresh = authClient.refreshAccessToken.bind(authClient);
  authClient.refreshAccessToken = async () => {
    throw new Error(
      'Access token expired and refresh token not available.\n' +
      'Please regenerate your access token from https://developer.x.com\n' +
      'Or complete the OAuth flow to obtain a refresh token.'
    );
  };

  twitterClient = new Client(authClient);
} else {
  throw new Error(
    'X API credentials not properly configured.\n' +
    'Need either:\n' +
    '1. OAuth 2.0: OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, TWITTER_ACCESS_TOKEN (and optionally TWITTER_REFRESH_TOKEN)\n' +
    '2. Complete OAuth flow to obtain refresh token for automatic token refresh'
  );
}

/**
 * Post a tweet using X API v2 Manage Posts endpoint
 * Maps to: POST statuses/update (v1.1) → POST /2/tweets (v2)
 * Endpoint: https://docs.x.com/x-api/posts/manage-tweets/introduction
 */
async function postTweet(text, imageBuffer = null, replyToId = null) {
  try {
    const tweetPayload = {
      text: text,
    };

    if (replyToId) {
      tweetPayload.reply = {
        in_reply_to_tweet_id: replyToId
      };
      console.log(`🧵 Threading to tweet: ${replyToId}`);
    }

    // X API v2: POST /2/tweets - Create Tweet
    const response = await twitterClient.tweets.createTweet({ requestBody: tweetPayload });
    
    if (!response.data || !response.data.id) {
      throw new Error('Failed to get tweet ID from response');
    }

    console.log(`✅ Tweet posted: ${response.data.id}`);
    return response.data.id;

  } catch (error) {
    console.error('❌ Error posting tweet:', error);
    
    if (error.status === 403) {
      const errorDetail = error.detail || error.message;
      if (errorDetail && (errorDetail.includes('oauth') || errorDetail.includes('permissions'))) {
        throw new Error(
          'X API permissions error: Your app needs "Read and Write" permissions.\n' +
          '1. Go to https://developer.x.com\n' +
          '2. Select your app → Settings → User authentication settings\n' +
          '3. Change App permissions to "Read and Write"\n' +
          '4. Regenerate your Access Token\n' +
          '5. Update your environment variables with the new token'
        );
      }
      throw new Error('X API authentication failed. Check your credentials.');
    }
    if (error.status === 429) {
      throw new Error('X API rate limit exceeded. Please wait before posting again.');
    }
    
    throw new Error(`Failed to post tweet: ${error.message || error.detail || 'Unknown error'}`);
  }
}

/**
 * Verify credentials using X API v2 Users lookup endpoint
 * Maps to: GET account/verify_credentials (v1.1) → GET /2/users/me (v2)
 * Endpoint: https://docs.x.com/x-api/users/lookup/introduction
 */
async function verifyCredentials() {
  try {
    // X API v2: GET /2/users/me - Get authenticated user
    const response = await twitterClient.users.findMyUser();
    if (response.data && response.data.username) {
      console.log(`✅ X API authenticated as: @${response.data.username}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ X API authentication failed:', error.message || error.detail);
    return false;
  }
}

module.exports = {
  postTweet,
  verifyCredentials
};
