/**
 * OAuth 2.0 PKCE Flow Helper - Get Refresh Token
 * 
 * This script helps you obtain a refresh token for Twitter/X API OAuth 2.0 with PKCE.
 * PKCE (Proof Key for Code Exchange) provides additional security without requiring client_secret.
 * 
 * Run this script to complete the OAuth flow and get your refresh token.
 * 
 * Usage:
 *   node scripts/get-refresh-token.js
 * 
 * PKCE Flow:
 * 1. Generate code_verifier (random string)
 * 2. Generate code_challenge = BASE64URL(SHA256(code_verifier))
 * 3. Send code_challenge in authorization request
 * 4. Exchange authorization code + code_verifier for tokens
 */

const { Client, auth } = require('twitter-api-sdk');
const http = require('http');
const url = require('url');
const { generatePKCEPair } = require('../src/pkceHelper');
require('dotenv').config();

// Try to import 'open' package (optional)
let open;
try {
  open = require('open');
} catch (e) {
  // open package not installed, that's okay
}

const PORT = process.env.PORT || 3000;
// Use OAUTH_CALLBACK_URL from env, or default to production URL
const CALLBACK_URL = process.env.OAUTH_CALLBACK_URL || 'https://gitlogs.aayushman.dev/callback';
const IS_LOCAL_CALLBACK = CALLBACK_URL.includes('localhost') || CALLBACK_URL.includes('127.0.0.1');

// Helper function to process tokens
function processTokens(tokenResponse) {
  console.log('');
  console.log('✅ Authorization successful!');
  console.log('');
  console.log('📋 Your tokens:');
  console.log('================================================');
  console.log('');
  console.log('Access Token:');
  console.log(tokenResponse.token.access_token);
  console.log('');
  
  if (tokenResponse.token.refresh_token) {
    console.log('🔄 Refresh Token (IMPORTANT - Save this!):');
    console.log(tokenResponse.token.refresh_token);
    console.log('');
    console.log('Add this to your .env file:');
    console.log(`TWITTER_REFRESH_TOKEN=${tokenResponse.token.refresh_token}`);
    console.log('');
    console.log('Also update your access token:');
    console.log(`TWITTER_ACCESS_TOKEN=${tokenResponse.token.access_token}`);
    console.log('');
  } else {
    console.log('⚠️  Warning: No refresh token received.');
    console.log('Make sure you requested the "offline.access" scope.');
    console.log('');
  }
  
  console.log('================================================');
  console.log('');
  console.log('💡 Tip: Copy the refresh token above and add it to your .env file');
  console.log('   Then restart your bot service.');
  console.log('');
}

// Check required environment variables
if (!process.env.OAUTH_CLIENT_ID) {
  console.error('❌ Error: Missing required environment variable');
  console.error('');
  console.error('Please set the following in your .env file:');
  console.error('  OAUTH_CLIENT_ID=your_client_id');
  console.error('');
  console.error('Note: OAUTH_CLIENT_SECRET is optional for PKCE flow (public clients)');
  console.error('      If provided, it will be used as a confidential client');
  console.error('');
  console.error('Get these from: https://developer.x.com/en/portal/dashboard');
  process.exit(1);
}

// Generate PKCE pair for this OAuth flow
const pkcePair = generatePKCEPair();
console.log('');
console.log('🔐 PKCE Security:');
console.log('   Code Verifier (length):', pkcePair.verifier.length, 'chars');
console.log('   Code Challenge:', pkcePair.challenge.substring(0, 20) + '...');
console.log('   Challenge Method:', pkcePair.method);
console.log('');

// Create OAuth2User client
// Note: client_secret is optional for PKCE (public client flow)
// If provided, Twitter treats it as confidential client (more secure)
const authClientConfig = {
  client_id: process.env.OAUTH_CLIENT_ID,
  callback: CALLBACK_URL,
  scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
};

// Add client_secret if provided (confidential client)
if (process.env.OAUTH_CLIENT_SECRET) {
  authClientConfig.client_secret = process.env.OAUTH_CLIENT_SECRET;
  console.log('✅ Using confidential client mode (client_secret provided)');
  console.log('');
} else {
  console.log('ℹ️  Using public client mode (PKCE only, no client_secret)');
  console.log('');
}

const authClient = new auth.OAuth2User(authClientConfig);

// Check if we have an authorization code (for remote callback flow)
// NOTE: With PKCE, you MUST use the same code_verifier that was used to generate the code_challenge
// For remote callbacks, you need to:
// 1. Keep the script running and handle callback on production server
// 2. Use localhost callback with ngrok/tunneling
// 3. Store PKCE verifier persistently (database, file, etc.)
if (process.env.OAUTH_CODE) {
  console.log('⚠️  WARNING: Using OAUTH_CODE with remote callback.');
  console.log('   Make sure you are using the SAME code_verifier that was used in the authorization URL.');
  console.log('   If this is a new script instance, the PKCE verifier will be different and token exchange will fail.');
  console.log('');
  console.log('   Current code_verifier (first 20 chars):', pkcePair.verifier.substring(0, 20) + '...');
  console.log('');
  
  // If you have a stored verifier from a previous run, use it here:
  // const storedVerifier = process.env.PKCE_CODE_VERIFIER;
  // if (storedVerifier) {
  //   pkcePair.verifier = storedVerifier;
  //   console.log('✅ Using stored PKCE verifier from environment');
  // }
  
  // Exchange code for tokens directly
  (async () => {
    try {
      console.log('🔄 Exchanging authorization code for tokens with PKCE...');
      
      // For PKCE, we need to provide the code_verifier
      // The SDK's requestAccessToken handles this internally if we used generateAuthURL
      // But for manual code exchange, we need to ensure the verifier matches
      const tokenResponse = await authClient.requestAccessToken(process.env.OAUTH_CODE);
      processTokens(tokenResponse);
      process.exit(0);
    } catch (error) {
      console.error('❌ Error exchanging code:', error.message);
      console.error('');
      console.error('Common causes:');
      console.error('  1. PKCE verifier mismatch (different script instance)');
      console.error('  2. Authorization code already used (codes are single-use)');
      console.error('  3. Authorization code expired (10 minutes validity)');
      console.error('  4. Redirect URI mismatch');
      console.error('');
      console.error('Solution: Keep this script running and handle the callback in real-time,');
      console.error('          or use a localhost callback with port forwarding.');
      process.exit(1);
    }
  })();
} else {

  // Generate authorization URL with PKCE
  // The SDK's generateAuthURL automatically includes PKCE parameters
  // code_challenge and code_challenge_method will be added automatically
  const authUrl = authClient.generateAuthURL({
    state: 'state',
    code_challenge: pkcePair.challenge,
    code_challenge_method: pkcePair.method,
  });

  // Parse and display authorization URL details for debugging
  try {
    const urlObj = new URL(authUrl);
    const params = new URLSearchParams(urlObj.search);
    console.log('');
    console.log('🔐 Twitter/X OAuth 2.0 Flow - Get Refresh Token');
    console.log('================================================');
    console.log('');
    console.log('📋 Authorization URL Details:');
    console.log('   Full URL:', authUrl.substring(0, 100) + '...');
    console.log('   Client ID:', params.get('client_id') ? params.get('client_id').substring(0, 10) + '...' : 'Missing!');
    console.log('   Redirect URI:', decodeURIComponent(params.get('redirect_uri') || 'Not found'));
    console.log('   Expected Callback:', CALLBACK_URL);
    console.log('   Scopes:', params.get('scope') || 'Not found');
    console.log('   Response Type:', params.get('response_type') || 'Missing!');
    console.log('   Code Challenge Method:', params.get('code_challenge_method') || 'Missing!');
    const urlCodeChallenge = params.get('code_challenge');
    console.log('   Code Challenge:', urlCodeChallenge ? 'Present (' + urlCodeChallenge.substring(0, 20) + '...)' : 'Missing!');
    console.log('   State:', params.get('state') || 'Missing!');
    console.log('');
    
    // Verify PKCE challenge matches what we generated
    if (urlCodeChallenge && urlCodeChallenge === pkcePair.challenge) {
      console.log('✅ PKCE code_challenge matches our generated challenge');
      console.log('');
    } else if (urlCodeChallenge) {
      console.log('⚠️  WARNING: Code challenge mismatch!');
      console.log('   URL has:', urlCodeChallenge.substring(0, 30) + '...');
      console.log('   We generated:', pkcePair.challenge.substring(0, 30) + '...');
      console.log('   This might cause token exchange to fail.');
      console.log('');
    }
    
    // Check for required PKCE parameters
    const requiredParams = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'scope', 'state'];
    const missingParams = requiredParams.filter(param => !params.get(param));
    if (missingParams.length > 0) {
      console.log('❌ ERROR: Missing required PKCE parameters:');
      missingParams.forEach(param => console.log('   -', param));
      console.log('');
      console.log('   PKCE requires code_challenge and code_challenge_method!');
      console.log('');
    }
    
    // Verify redirect_uri matches (decode to compare)
    const redirectUri = decodeURIComponent(params.get('redirect_uri') || '');
    if (redirectUri && redirectUri !== CALLBACK_URL) {
      console.log('⚠️  WARNING: Redirect URI mismatch!');
      console.log('   In URL:', redirectUri);
      console.log('   Expected:', CALLBACK_URL);
      console.log('   Match:', redirectUri === CALLBACK_URL ? 'Yes' : 'No');
      console.log('');
    } else if (redirectUri === CALLBACK_URL) {
      console.log('✅ Redirect URI matches callback URL');
      console.log('');
    }
    
    console.log('⚠️  IMPORTANT: Verify callback URL matches EXACTLY in:');
    console.log('   https://developer.x.com/en/portal/dashboard');
    console.log('   → Your App → Settings → User authentication settings');
    console.log('   → Callback URI / Redirect URL:', CALLBACK_URL);
    console.log('');
    console.log('💡 PKCE Configuration:');
    console.log('   ✓ Code challenge generated:', pkcePair.challenge.substring(0, 30) + '...');
    console.log('   ✓ Code verifier stored in memory (will be used for token exchange)');
    console.log('   ✓ Challenge method: S256 (SHA256)');
    console.log('');
    console.log('💡 If you see "invalid_request" error, check:');
    console.log('   1. All required PKCE parameters are present (see above)');
    console.log('   2. Redirect URI matches exactly (no trailing slash, correct protocol)');
    console.log('   3. Code challenge is present and in correct format');
    console.log('   4. Client ID is correct');
    console.log('   5. OAuth 2.0 is enabled (not OAuth 1.0a)');
    console.log('');
  } catch (error) {
    console.log('⚠️  Could not parse authorization URL:', error.message);
    console.log('   Full URL:', authUrl);
    console.log('');
  }
  
  if (!IS_LOCAL_CALLBACK) {
    console.log('📡 Using remote callback URL.');
    console.log('   After authorization, Twitter will redirect to:', CALLBACK_URL);
    console.log('   The code will be logged in your server console.');
    console.log('');
    console.log('⚠️  CRITICAL: PKCE verifier for this session:');
    console.log('   ' + pkcePair.verifier);
    console.log('');
    console.log('   Save this verifier! You will need it to exchange the authorization code.');
    console.log('   After getting the code from callback, run:');
    console.log('   OAUTH_CODE=your_code PKCE_CODE_VERIFIER=' + pkcePair.verifier.substring(0, 20) + '... node scripts/get-refresh-token.js');
    console.log('');
    console.log('💡 Better approach: Keep this script running to handle the callback immediately');
    console.log('   Or use localhost callback with port forwarding (ngrok, tunnelmole, etc.)');
    console.log('');
  }
  console.log('Step 1: Opening browser for authorization...');
  console.log('If browser doesn\'t open, visit this URL:');
  console.log('');
  console.log(authUrl);
  console.log('');
  console.log('💡 If you see "invalid_request" error:');
  console.log('   1. Check callback URL matches EXACTLY in Twitter Developer Portal');
  console.log('   2. Ensure no trailing slashes or protocol mismatches');
  console.log('   3. Verify OAuth 2.0 is enabled (not OAuth 1.0a)');
  console.log('   4. Check app has "Read and Write" permissions');
  console.log('');

  // Open browser automatically (optional)
  if (open) {
    open(authUrl).catch(() => {
      console.log('⚠️  Could not open browser automatically. Please visit the URL above.');
    });
  } else {
    console.log('💡 Tip: Install "open" package (npm install open) to auto-open browser');
  }

  // Create temporary server to receive callback (only if using local callback)
  let server;
  if (IS_LOCAL_CALLBACK) {
  server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = url.parse(req.url, true);
      
      if (parsedUrl.pathname === '/callback') {
        const { code, state } = parsedUrl.query;
        
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial; padding: 40px; text-align: center;">
                <h1>❌ Authorization Failed</h1>
                <p>No authorization code received.</p>
                <p>Please try again.</p>
              </body>
            </html>
          `);
          server.close();
          return;
        }

        // Exchange code for tokens with PKCE
        // The authClient has the code_verifier stored from generateAuthURL
        // It will automatically include it in the token request
        console.log('');
        console.log('🔄 Exchanging authorization code for tokens...');
        console.log('   Using PKCE code_verifier (first 20 chars):', pkcePair.verifier.substring(0, 20) + '...');
        console.log('');
        
        const tokenResponse = await authClient.requestAccessToken(code);
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto;">
              <h1>✅ Success!</h1>
              <p>Your tokens have been obtained. Check the console for your refresh token.</p>
              <p style="color: #666;">You can close this window now.</p>
            </body>
          </html>
        `);

        processTokens(tokenResponse);

        server.close();
        setTimeout(() => process.exit(0), 2000);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1>❌ Error</h1>
            <p>${error.message}</p>
          </body>
        </html>
      `);
      server.close();
      setTimeout(() => process.exit(1), 2000);
    }
  });
}

if (IS_LOCAL_CALLBACK) {
  // Only start local server if using localhost callback
  server.listen(PORT, () => {
    console.log(`📡 Listening on ${CALLBACK_URL}`);
    console.log('');
    console.log('⏳ Waiting for authorization...');
    console.log('   (This window will close automatically after authorization)');
    console.log('');
  });
} else {
  // Remote callback URL - user needs to handle callback on their server
  console.log(`📡 Callback URL: ${CALLBACK_URL}`);
  console.log('');
  console.log('⚠️  Note: Using remote callback URL.');
  console.log('   Make sure your server at ' + CALLBACK_URL + ' can handle the OAuth callback.');
  console.log('   After authorization, Twitter will redirect there with a code parameter.');
  console.log('');
  console.log('⏳ Visit the authorization URL above to start the flow.');
  console.log('   After authorization, check your server logs for the callback.');
  console.log('');
}

// Handle server shutdown
if (IS_LOCAL_CALLBACK && server) {
  process.on('SIGINT', () => {
    console.log('\n\n⚠️  Interrupted. Server shutting down...');
    server.close();
    process.exit(0);
  });
}
}
