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

if (config.twitter.clientId && config.twitter.clientSecret) {
  // OAuth 2.0 with user context
  const callbackUrl = process.env.OAUTH_CALLBACK_URL || `http://localhost:${config.server.port}/callback`;
  
  const authClient = new auth.OAuth2User({
    client_id: config.twitter.clientId,
    client_secret: config.twitter.clientSecret,
    callback: callbackUrl,
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  });

  // If we have an access token, set it
  if (config.twitter.accessToken) {
    authClient.token = {
      access_token: config.twitter.accessToken,
      token_type: 'Bearer',
    };
  }

  twitterClient = new Client(authClient);
} else if (config.twitter.apiKey && config.twitter.apiSecret && config.twitter.accessToken && config.twitter.accessSecret) {
  // OAuth 1.0a (fallback)
  const authClient = new auth.OAuth1User({
    consumer_key: config.twitter.apiKey,
    consumer_secret: config.twitter.apiSecret,
    access_token: config.twitter.accessToken,
    access_token_secret: config.twitter.accessSecret,
  });

  twitterClient = new Client(authClient);
} else {
  throw new Error('X API credentials not properly configured. Need either OAuth 1.0a (API Key/Secret + Access Token/Secret) or OAuth 2.0 (Client ID/Secret + Access Token)');
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
