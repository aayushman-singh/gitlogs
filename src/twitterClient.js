const { Client, auth } = require('twitter-api-sdk');
const config = require('../config/config');
const https = require('https');
const http = require('http');

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

// Initialize X API client
let twitterClient;
let authClientRef; // Store reference to auth client for token refresh

if (!config.twitter.accessToken) {
  throw new Error('X API access token (TWITTER_ACCESS_TOKEN) is required');
}

/**
 * Helper function to refresh access token using proxy with PKCE support
 * 
 * OAuth 2.0 Token Refresh Flow:
 * - Public clients (PKCE only): No client_secret required
 * - Confidential clients: Use Basic Auth with client_id:client_secret
 * 
 * References:
 * - Twitter OAuth 2.0: https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
 * - PKCE RFC 7636: https://tools.ietf.org/html/rfc7636
 * 
 * @param {Object} authClient - OAuth2User instance with token and client_id
 * @param {string} proxyUrl - Proxy URL to route requests through
 * @returns {Promise<Object>} Token object with access_token, refresh_token, etc.
 */
async function refreshTokenWithProxy(authClient, proxyUrl) {
  // Use api.x.com endpoint as per official documentation
  const tokenEndpoint = 'https://api.x.com/2/oauth2/token';
  const proxiedUrl = `${proxyUrl}${encodeURIComponent(tokenEndpoint)}`;
  
  // Determine if we're using confidential client mode (has client_secret)
  // or public client mode (PKCE only, no client_secret)
  const isConfidentialClient = authClient.client_secret && authClient.client_secret !== '';
  
  // Build request body parameters for token refresh
  // For PKCE (public client): only client_id, refresh_token, grant_type
  // For confidential client: can also use Basic Auth
  const params = new URLSearchParams({
    refresh_token: authClient.token.refresh_token,
    grant_type: 'refresh_token',
    client_id: authClient.client_id,
  });

  // Build request headers
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(params.toString()),
  };

  // For confidential clients, use Basic Auth (RFC 6749 Section 2.3.1)
  // For public clients (PKCE), client authentication is not used
  if (isConfidentialClient) {
    const credentials = Buffer.from(`${authClient.client_id}:${authClient.client_secret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
    console.log('🔐 Using confidential client mode (Basic Auth)');
  } else {
    console.log('🔐 Using public client mode (PKCE only, no client_secret)');
  }

  return new Promise((resolve, reject) => {
    const urlObj = new URL(proxiedUrl);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: headers,
    };

    const req = (urlObj.protocol === 'https:' ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          // Log response for debugging
          if (res.statusCode !== 200) {
            console.error(`❌ Token refresh HTTP ${res.statusCode}:`, data);
          }
          
          const response = JSON.parse(data);
          if (res.statusCode === 200 && response.access_token) {
            // Update token in authClient
            authClient.token = {
              access_token: response.access_token,
              token_type: response.token_type || 'Bearer',
              refresh_token: response.refresh_token || authClient.token.refresh_token,
              expires_in: response.expires_in,
              scope: response.scope,
            };
            
            const clientMode = isConfidentialClient ? 'confidential' : 'public (PKCE)';
            console.log(`✅ Token refreshed successfully via proxy (${clientMode} mode)`);
            resolve(authClient.token);
          } else {
            // Provide more detailed error message
            const errorMsg = response.error_description || response.error || data || 'Unknown error';
            reject(new Error(`Token refresh failed (${res.statusCode}): ${errorMsg}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse token response: ${error.message}. Response: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Token refresh request failed: ${error.message}`));
    });

    req.write(params.toString());
    req.end();
  });
}

/**
 * Initialize OAuth 2.0 client with PKCE support
 * 
 * Supports two modes:
 * 1. Confidential Client: Uses client_id + client_secret (more secure)
 * 2. Public Client: Uses client_id only with PKCE (for apps that can't store secrets)
 * 
 * Both modes support token refresh with proper PKCE compliance.
 */

// Check if we have OAuth 2.0 credentials
if (config.twitter.clientId) {
  const callbackUrl = process.env.OAUTH_CALLBACK_URL || `http://localhost:${config.server.port}/callback`;
  
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
    console.log('🔐 Initializing OAuth 2.0 confidential client (with client_secret)');
  } else {
    console.log('🔐 Initializing OAuth 2.0 public client (PKCE only, no client_secret)');
  }
  
  const authClient = new auth.OAuth2User(authClientConfig);

  // Try to get refresh token from multiple sources
  const refreshToken = config.twitter.refreshToken || 
                       process.env.TWITTER_REFRESH_TOKEN || 
                       null;

  // Set initial token
  authClient.token = {
    access_token: config.twitter.accessToken,
    token_type: 'Bearer',
    refresh_token: refreshToken || 'dummy_refresh_token', // Placeholder if not available yet
  };

  // Override refreshAccessToken to use PKCE-compliant refresh
  const originalRefresh = authClient.refreshAccessToken.bind(authClient);
  authClient.refreshAccessToken = async () => {
    // Re-check for refresh token in case it was added after initialization
    const currentRefreshToken = config.twitter.refreshToken || 
                                process.env.TWITTER_REFRESH_TOKEN || 
                                authClient.token.refresh_token;
    
    const hasValidRefreshToken = currentRefreshToken && 
                                 currentRefreshToken !== 'dummy_refresh_token';
    
    if (!hasValidRefreshToken) {
      throw new Error(
        'Access token expired and refresh token not available.\n' +
        'Please run: node scripts/get-refresh-token.js\n' +
        'Then add TWITTER_REFRESH_TOKEN to your .env file.\n' +
        'Or regenerate your access token from https://developer.x.com'
      );
    }
    
    // Update token with current refresh token if needed
    if (currentRefreshToken !== authClient.token.refresh_token) {
      authClient.token.refresh_token = currentRefreshToken;
    }
    
    // Try proxy refresh first (PKCE-compliant)
    if (config.twitter.proxyUrl) {
      try {
        console.log('🔄 Refreshing access token via proxy (PKCE-compliant)...');
        return await refreshTokenWithProxy(authClient, config.twitter.proxyUrl);
      } catch (error) {
        console.error('❌ Proxy refresh failed:', error.message);
        
        // Fallback to original SDK method
        if (originalRefresh) {
          try {
            console.log('🔄 Trying SDK default refresh method...');
            return await originalRefresh();
          } catch (fallbackError) {
            throw new Error(
              `Token refresh failed:\n` +
              `  Proxy: ${error.message}\n` +
              `  Fallback: ${fallbackError.message}`
            );
          }
        }
        
        throw error;
      }
    } else {
      // No proxy configured, use SDK default method
      try {
        console.log('🔄 Refreshing access token using SDK method...');
        return await originalRefresh();
      } catch (error) {
        throw new Error(`Token refresh failed: ${error.message}`);
      }
    }
  };

  authClientRef = authClient; // Store reference for use in post actions
  twitterClient = new Client(authClient);
  
  // Log successful initialization
  const clientType = isConfidentialClient ? 'confidential' : 'public (PKCE)';
  const hasRefreshToken = refreshToken && refreshToken !== 'dummy_refresh_token';
  console.log(`✅ X API client initialized (${clientType} mode)`);
  console.log(`   Refresh token: ${hasRefreshToken ? 'Available' : 'Not available (will need to run get-refresh-token.js)'}`);
  
} else {
  throw new Error(
    'X API credentials not properly configured.\n' +
    'Required:\n' +
    '  - OAUTH_CLIENT_ID (required)\n' +
    '  - TWITTER_ACCESS_TOKEN (required)\n' +
    '  - OAUTH_CLIENT_SECRET (optional, for confidential client mode)\n' +
    '  - TWITTER_REFRESH_TOKEN (optional, for automatic token refresh)\n\n' +
    'To get these:\n' +
    '  1. Go to https://developer.x.com/en/portal/dashboard\n' +
    '  2. Create or select your app\n' +
    '  3. Get your Client ID (and optionally Client Secret)\n' +
    '  4. Run: node scripts/get-refresh-token.js\n' +
    '  5. Add the tokens to your .env file'
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
    
    // Check if error is due to expired token (401 Unauthorized) or refresh token error
    if (error.status === 401 || 
        (error.message && (error.message.includes('Unauthorized') || error.message.includes('expired')))) {
      // Try to refresh token and retry if we have auth client
      if (authClientRef && config.twitter.clientId && config.twitter.clientSecret) {
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
          // Don't throw here - let the original error propagate
          throw new Error(`Token refresh failed: ${refreshError.message}`);
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
