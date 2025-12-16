const { Client, auth } = require('twitter-api-sdk');
const config = require('../config/config');
const OAuthHandler = require('./oauthHandler');
const { calculateTwitterLength } = require('./commitFormatter');

/**
 * X API v2 Endpoint Mapping:
 * 
 * POST statuses/update (v1.1) → Manage Posts (v2) → tweets.createTweet()
 * GET account/verify_credentials (v1.1) → Users lookup (v2) → users.findMyUser()
 * 
 * Reference: https://docs.x.com/x-api/migrate/x-api-endpoint-map
 * 
 * OAuth 2.0 PKCE Implementation:
 * This client supports both public client (PKCE only) and confidential client modes.
 * Token refresh follows OAuth 2.0 PKCE standards (RFC 7636).
 */

// Initialize X API client (lazy initialization)
let twitterClient;
let authClientRef; // Store reference to auth client for token refresh
let oauthHandler; // OAuth handler for token management (similar to Python XAuth)
let isInitialized = false;

// Initialize OAuth handler if client ID is available
if (config.twitter.clientId) {
  try {
    oauthHandler = new OAuthHandler();
  } catch (error) {
    console.warn('⚠️  OAuth handler initialization failed:', error.message);
  }
}

/**
 * Initialize OAuth 2.0 client with PKCE support (lazy initialization)
 * 
 * Uses OAuthHandler for token management (similar to Python XAuth implementation).
 * Tokens are stored in database and automatically refreshed.
 * 
 * This function is called automatically when postTweet or verifyCredentials is called.
 */
function initializeTwitterClient() {
  if (isInitialized && twitterClient) {
    return; // Already initialized
  }

  if (!config.twitter.clientId) {
    throw new Error(
      'X API credentials not properly configured.\n' +
      'Required:\n' +
      '  - OAUTH_CLIENT_ID (required for OAuth 2.0 with PKCE)\n' +
      '  - OAUTH_CLIENT_SECRET (optional, for confidential client mode)\n\n' +
      'To authenticate with OAuth 2.0 PKCE:\n' +
      '  1. Set OAUTH_CLIENT_ID in your .env file\n' +
      '  2. Visit http://localhost:' + config.server.port + '/oauth\n' +
      '  3. Tokens will be stored automatically in the database'
    );
  }

  const callbackUrl = process.env.OAUTH_CALLBACK_URL || `http://localhost:${config.server.port}/oauth/callback`;
  
  // Determine client type based on presence of client_secret
  const isConfidentialClient = config.twitter.clientSecret && config.twitter.clientSecret !== '';
  
  // Build OAuth2User configuration
  const authClientConfig = {
    client_id: config.twitter.clientId,
    callback: callbackUrl,
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
  };
  
  // Add client_secret only if available (confidential client)
  if (isConfidentialClient) {
    authClientConfig.client_secret = config.twitter.clientSecret;
  }
  
  const authClient = new auth.OAuth2User(authClientConfig);

  // Get token from database (similar to Python implementation)
  // Tokens must be obtained via OAuth flow
  let storedToken = null;
  if (oauthHandler) {
    try {
      // Get token directly from database (supports both DB and file storage)
      storedToken = require('./database').getOAuthToken();
    } catch (error) {
      // Database might not have a token yet
    }
  }

  if (!storedToken || !storedToken.access_token) {
    throw new Error(
      'No OAuth token found. Please authenticate first.\n' +
      `Visit http://localhost:${config.server.port}/oauth to authenticate with X API (OAuth 2.0 with PKCE).`
    );
  }

  const accessToken = storedToken.access_token;
  const refreshToken = storedToken.refresh_token || null;

  // Set initial token
  authClient.token = {
    access_token: accessToken,
    token_type: 'Bearer',
    refresh_token: refreshToken || 'dummy_refresh_token', // Placeholder if not available yet
  };

  // Override refreshAccessToken to use OAuth handler (similar to Python implementation)
  // This ensures tokens are stored in database and refreshed properly
  authClient.refreshAccessToken = async () => {
    if (!oauthHandler) {
      throw new Error(
        'OAuth handler not available. Please authenticate via OAuth first.\n' +
        `Visit http://localhost:${config.server.port}/oauth to authenticate.`
      );
    }

    try {
      console.log('🔄 Refreshing token using OAuth handler...');
      const newToken = await oauthHandler._refreshToken();
      
      if (!newToken) {
        throw new Error(
          'Token refresh failed. Please re-authenticate.\n' +
          `Visit http://localhost:${config.server.port}/oauth to authenticate.`
        );
      }

      // Update authClient with new token
      authClient.token = {
        access_token: newToken.access_token,
        token_type: newToken.token_type || 'Bearer',
        refresh_token: newToken.refresh_token,
        expires_in: newToken.expires_in,
        scope: newToken.scope,
      };
      
      return authClient.token;
    } catch (error) {
      console.error('❌ OAuth handler refresh failed:', error.message);
      throw new Error(
        `Token refresh failed: ${error.message}\n` +
        `Please re-authenticate by visiting http://localhost:${config.server.port}/oauth`
      );
    }
  };

  authClientRef = authClient; // Store reference for use in post actions
  twitterClient = new Client(authClient);
  isInitialized = true;
  
  // Log successful initialization
  const clientType = isConfidentialClient ? 'confidential' : 'public (PKCE)';
  const hasRefreshToken = refreshToken && refreshToken !== 'dummy_refresh_token';
  console.log(`✅ X API client initialized (${clientType} mode)`);
  console.log(`   Token source: database`);
  console.log(`   Refresh token: ${hasRefreshToken ? 'Available' : 'Not available'}`);
  if (!hasRefreshToken) {
    console.log(`   To authenticate: Visit http://localhost:${config.server.port}/oauth`);
  }
}

/**
 * Post a tweet using X API v2 Manage Posts endpoint
 * Maps to: POST statuses/update (v1.1) → POST /2/tweets (v2)
 * Endpoint: https://docs.x.com/x-api/posts/manage-tweets/introduction
 */
async function postTweet(text, imageBuffer = null, replyToId = null) {
  // Initialize client if not already initialized
  if (!isInitialized) {
    initializeTwitterClient();
  }

  // Validate tweet text
  if (!text || typeof text !== 'string') {
    throw new Error('Tweet text is required and must be a string');
  }
  
  if (text.trim().length === 0) {
    throw new Error('Tweet text cannot be empty');
  }
  
  // Twitter's character limit is 280, but URLs count as 23 characters
  const twitterLength = calculateTwitterLength(text);
  if (twitterLength > 280) {
    throw new Error(`Tweet text is too long: ${twitterLength} Twitter characters (max 280). Raw length: ${text.length} characters`);
  }

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
    // Log detailed error information
    console.error('❌ Error posting tweet:', error);
    
    // Log the actual Twitter API error details if available
    if (error.error && error.error.errors) {
      console.error('📋 Twitter API Error Details:');
      error.error.errors.forEach((err, index) => {
        console.error(`   Error ${index + 1}:`, JSON.stringify(err, null, 2));
      });
      if (error.error.title) {
        console.error(`   Title: ${error.error.title}`);
      }
      if (error.error.detail) {
        console.error(`   Detail: ${error.error.detail}`);
      }
    }
    
    // Log the tweet payload for debugging (without sensitive data)
    if (tweetPayload) {
      console.error('📝 Tweet payload that failed:');
      console.error(`   Text length: ${tweetPayload.text ? tweetPayload.text.length : 0} characters`);
      console.error(`   Text preview: ${tweetPayload.text ? tweetPayload.text.substring(0, 100) : 'null'}...`);
      if (tweetPayload.reply) {
        console.error(`   Reply to: ${tweetPayload.reply.in_reply_to_tweet_id}`);
      }
    }
    
    // Check if error is due to expired token (401 Unauthorized) or refresh token error
    if (error.status === 401 || 
        (error.message && (error.message.includes('Unauthorized') || error.message.includes('expired')))) {
      // Try to refresh token and retry if we have auth client
      if (authClientRef && oauthHandler) {
        try {
          console.log('🔄 Access token expired, attempting refresh...');
          await authClientRef.refreshAccessToken();
          console.log('✅ Token refreshed, retrying tweet post...');
          // Retry the tweet post after refresh
          const retryResponse = await twitterClient.tweets.createTweet({ requestBody: tweetPayload });
          if (retryResponse.data && retryResponse.data.id) {
            console.log(`✅ Tweet posted after token refresh: ${retryResponse.data.id}`);
            return retryResponse.data.id;
          }
        } catch (refreshError) {
          console.error('❌ Failed to refresh token:', refreshError.message);
          throw new Error(
            `Token refresh failed: ${refreshError.message}\n` +
            `Please re-authenticate by visiting http://localhost:${config.server.port}/oauth`
          );
        }
      }
    }
    
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
    
    // Handle 400 Bad Request with more specific error messages
    if (error.status === 400) {
      let errorMessage = 'Invalid request parameters';
      if (error.error && error.error.errors && error.error.errors.length > 0) {
        const firstError = error.error.errors[0];
        errorMessage = firstError.message || errorMessage;
        if (firstError.code) {
          errorMessage = `[${firstError.code}] ${errorMessage}`;
        }
      }
      throw new Error(`Failed to post tweet: ${errorMessage}`);
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
  // Initialize client if not already initialized
  if (!isInitialized) {
    initializeTwitterClient();
  }

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
