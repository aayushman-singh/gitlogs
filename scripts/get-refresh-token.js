/**
 * OAuth 2.0 Flow Helper - Get Refresh Token
 * 
 * This script helps you obtain a refresh token for Twitter/X API OAuth 2.0.
 * Run this script to complete the OAuth flow and get your refresh token.
 * 
 * Usage:
 *   node scripts/get-refresh-token.js
 */

const { Client, auth } = require('twitter-api-sdk');
const http = require('http');
const url = require('url');
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
if (!process.env.OAUTH_CLIENT_ID || !process.env.OAUTH_CLIENT_SECRET) {
  console.error('❌ Error: Missing required environment variables');
  console.error('');
  console.error('Please set the following in your .env file:');
  console.error('  OAUTH_CLIENT_ID=your_client_id');
  console.error('  OAUTH_CLIENT_SECRET=your_client_secret');
  console.error('');
  console.error('Get these from: https://developer.x.com/en/portal/dashboard');
  process.exit(1);
}

const authClient = new auth.OAuth2User({
  client_id: process.env.OAUTH_CLIENT_ID,
  client_secret: process.env.OAUTH_CLIENT_SECRET,
  callback: CALLBACK_URL,
  scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
});

// Check if we have an authorization code (for remote callback flow)
// NOTE: This won't work with PKCE because the verifier is stored in the authClient instance
// that generated the authorization URL. For remote callbacks, you need to either:
// 1. Keep the script running and handle callback on production server
// 2. Use localhost callback with ngrok/tunneling
// 3. Store PKCE state somewhere accessible
if (process.env.OAUTH_CODE) {
  console.log('⚠️  WARNING: Using OAUTH_CODE with remote callback may fail due to PKCE.');
  console.log('   The PKCE verifier must match the one used in the authorization URL.');
  console.log('   Consider using localhost callback or keeping the script running.');
  console.log('');
  
  // Exchange code for tokens directly
  (async () => {
    try {
      console.log('🔄 Exchanging authorization code for tokens...');
      const tokenResponse = await authClient.requestAccessToken(process.env.OAUTH_CODE);
      processTokens(tokenResponse);
      process.exit(0);
    } catch (error) {
      console.error('❌ Error exchanging code:', error.message);
      console.error('');
      console.error('This might be due to PKCE verifier mismatch.');
      console.error('Try using a localhost callback URL instead:');
      console.error('  OAUTH_CALLBACK_URL=http://localhost:3000/callback node scripts/get-refresh-token.js');
      console.error('  Then use ngrok or similar to tunnel localhost to your production server.');
      process.exit(1);
    }
  })();
} else {

  // Generate authorization URL (SDK handles PKCE automatically)
  const authUrl = authClient.generateAuthURL({
    state: 'state',
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
    console.log('   Client ID:', process.env.OAUTH_CLIENT_ID?.substring(0, 10) + '...');
    console.log('   Redirect URI:', params.get('redirect_uri') || 'Not found');
    console.log('   Expected Callback:', CALLBACK_URL);
    console.log('   Scopes:', params.get('scope') || 'Not found');
    console.log('   Response Type:', params.get('response_type') || 'code');
    console.log('   Code Challenge Method:', params.get('code_challenge_method') || 'S256');
    console.log('   Code Challenge:', params.get('code_challenge') ? 'Present (' + params.get('code_challenge').substring(0, 20) + '...)' : 'Missing!');
    console.log('   State:', params.get('state') || 'state');
    console.log('');
    
    // Verify redirect_uri matches
    const redirectUri = params.get('redirect_uri');
    if (redirectUri && redirectUri !== CALLBACK_URL) {
      console.log('⚠️  WARNING: Redirect URI mismatch!');
      console.log('   In URL:', redirectUri);
      console.log('   Expected:', CALLBACK_URL);
      console.log('');
    }
    
    console.log('⚠️  IMPORTANT: Verify callback URL matches EXACTLY in:');
    console.log('   https://developer.x.com/en/portal/dashboard');
    console.log('   → Your App → Settings → User authentication settings');
    console.log('   → Callback URI / Redirect URL: https://gitlogs.aayushman.dev/callback');
    console.log('');
  } catch (error) {
    console.log('⚠️  Could not parse authorization URL:', error.message);
    console.log('');
  }
  
  if (!IS_LOCAL_CALLBACK) {
    console.log('📡 Using remote callback URL.');
    console.log('   After authorization, Twitter will redirect to:', CALLBACK_URL);
    console.log('   The code will be logged in your server console.');
    console.log('   Then run: OAUTH_CODE=your_code node scripts/get-refresh-token.js');
    console.log('');
    console.log('⚠️  Note: You MUST use the SAME script instance to exchange the code!');
    console.log('   The PKCE verifier is stored in memory, so keep this script running.');
    console.log('   Or save the authClient state if you need to restart.');
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

        // Exchange code for tokens
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
