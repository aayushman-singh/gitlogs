const express = require('express');
const config = require('../config/config');
const webhookHandler = require('./webhookHandler');
const OAuthHandler = require('./oauthHandler');

const app = express();

// In-memory store for PKCE verifiers (keyed by state)
// Similar to Flask session storage in Python implementation
const pkceStore = new Map();

// Capture raw body for webhook signature verification (must be before parsing)
app.use('/webhook/github', express.raw({ type: '*/*' }), (req, res, next) => {
  req.rawBody = req.body.toString('utf8');
  next();
});

// Parse form-encoded and JSON for webhook route
app.use('/webhook/github', express.urlencoded({ extended: false }));
app.use('/webhook/github', express.json());

// Parse JSON for other routes
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Gitlogs bot is running',
    version: '1.0.0'
  });
});

// OAuth 2.0 with PKCE - Start authentication flow
// Similar to Python auth_start route
app.get('/oauth', async (req, res) => {
  try {
    const oauthHandler = new OAuthHandler();
    const { authUrl, codeVerifier } = oauthHandler.generateAuthUrl();
    
    // Store code verifier with state (using 'state' as key for simplicity)
    // In production, use a proper session store or generate unique state
    pkceStore.set('state', codeVerifier);
    
    // Redirect to authorization URL
    res.redirect(authUrl);
  } catch (error) {
    console.error('❌ OAuth initialization error:', error);
    res.status(500).send(`
      <html>
        <head><title>OAuth Error</title></head>
        <body style="font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto;">
          <h1>❌ OAuth Initialization Failed</h1>
          <p><strong>Error:</strong> ${error.message}</p>
          <p>Make sure OAUTH_CLIENT_ID is set in your .env file.</p>
        </body>
      </html>
    `);
  }
});

// OAuth 2.0 callback endpoint with PKCE
// Handles both /callback and /oauth/callback for flexibility
async function handleOAuthCallback(req, res) {
  const { code, error, error_description, state } = req.query;
  
  if (error) {
    console.error('❌ OAuth Error:', error);
    if (error_description) {
      console.error('   Description:', error_description);
    }
    res.send(`
      <html>
        <head><title>OAuth Error</title></head>
        <body style="font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto;">
          <h1>❌ OAuth Authorization Failed</h1>
          <p><strong>Error:</strong> ${error}</p>
          ${error_description ? `<p><strong>Description:</strong> ${error_description}</p>` : ''}
          <p>Check the server logs for more details.</p>
        </body>
      </html>
    `);
    return;
  }

  if (!code) {
    res.status(400).send(`
      <html>
        <head><title>OAuth Error</title></head>
        <body style="font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto;">
          <h1>❌ No Authorization Code</h1>
          <p>No authorization code received. Please try again.</p>
        </body>
      </html>
    `);
    return;
  }

  try {
    // Get stored code verifier
    const codeVerifier = pkceStore.get(state || 'state');
    if (!codeVerifier) {
      throw new Error('PKCE code verifier not found. Please restart the OAuth flow.');
    }

    // Exchange code for tokens
    const oauthHandler = new OAuthHandler();
    const token = await oauthHandler.exchangeCodeForTokens(code, codeVerifier);
    
    // Clean up stored verifier
    pkceStore.delete(state || 'state');
    
    res.send(`
      <html>
        <head><title>Authentication Successful</title></head>
        <body style="font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto;">
          <h1>✅ Authentication Successful!</h1>
          <p>Your tokens have been stored. You can now close this window.</p>
          <p style="color: #666; margin-top: 30px;">
            Access token and refresh token have been saved to the database.
          </p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ Token exchange error:', error);
    res.status(500).send(`
      <html>
        <head><title>OAuth Error</title></head>
        <body style="font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto;">
          <h1>❌ Token Exchange Failed</h1>
          <p><strong>Error:</strong> ${error.message}</p>
          <p>Check the server logs for more details.</p>
        </body>
      </html>
    `);
  }
}

// Register callback handler for both routes
app.get('/callback', handleOAuthCallback);
app.get('/oauth/callback', handleOAuthCallback);

app.post('/webhook/github', webhookHandler.handleWebhook);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: config.server.nodeEnv === 'development' ? err.message : undefined
  });
});

const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`🚀 Git→X Bot listening on port ${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook/github`);
  if (config.twitter.clientId) {
    console.log(`🔐 OAuth endpoint: http://localhost:${PORT}/oauth`);
    console.log(`   Visit this URL to authenticate with X API (OAuth 2.0 with PKCE)`);
  }
  console.log(`🔒 Webhook secret is ${config.github.webhookSecret ? 'SET' : 'NOT SET'}`);
  console.log(`🐦 X API credentials are ${config.twitter.apiKey || config.twitter.clientId ? 'SET' : 'NOT SET'}`);
});

