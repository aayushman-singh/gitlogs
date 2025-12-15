const express = require('express');
const config = require('../config/config');
const webhookHandler = require('./webhookHandler');

const app = express();

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

// X API OAuth callback endpoint (for token generation if needed)
app.get('/callback', (req, res) => {
  const { code, error, error_description, state } = req.query;
  
  // Log callback details for debugging
  console.log('📥 OAuth Callback received:');
  console.log('  Code:', code ? 'Present' : 'Missing');
  console.log('  Error:', error || 'None');
  console.log('  Error Description:', error_description || 'None');
  console.log('  State:', state || 'None');
  
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
          <p style="color: #666; margin-top: 30px;">
            Common causes:<br>
            • Callback URL mismatch<br>
            • PKCE verification failed<br>
            • Invalid client credentials<br>
            • Missing required scopes
          </p>
        </body>
      </html>
    `);
  } else if (code) {
    console.log('✅ Authorization code received!');
    console.log('   Code:', code.substring(0, 20) + '...');
    console.log('');
    console.log('📋 Next steps:');
    console.log('   1. Copy the authorization code from the URL');
    console.log('   2. Run: OAUTH_CODE=' + code + ' node scripts/get-refresh-token.js');
    console.log('   3. Or extract it manually from the callback URL');
    console.log('');
    res.send(`
      <html>
        <head><title>OAuth Success</title></head>
        <body style="font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto;">
          <h1>✅ Authorization Code Received</h1>
          <p>Your authorization code has been received and logged.</p>
          <p><strong>Check your server console/logs for the next steps.</strong></p>
          <p style="color: #666; margin-top: 30px;">
            To complete the OAuth flow, run:<br>
            <code style="background: #f0f0f0; padding: 5px 10px; border-radius: 3px;">
              OAUTH_CODE=${code} node scripts/get-refresh-token.js
            </code>
          </p>
          <p style="color: #666;">
            Or manually extract the code from the URL and use it with the script.
          </p>
        </body>
      </html>
    `);
  } else {
    res.send(`
      <html>
        <head><title>X API OAuth Callback</title></head>
        <body style="font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto;">
          <h1>X API OAuth Callback</h1>
          <p>This endpoint is used for X API OAuth authentication.</p>
          <p>If you're seeing this, the callback URL is configured correctly.</p>
          <p>Check the server logs for OAuth token information.</p>
          <p style="color: #666; margin-top: 30px;">
            No authorization code or error received. Make sure you're completing the OAuth flow.
          </p>
        </body>
      </html>
    `);
  }
});

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
  console.log(`🔒 Webhook secret is ${config.github.webhookSecret ? 'SET' : 'NOT SET'}`);
  console.log(`🐦 X API credentials are ${config.twitter.apiKey || config.twitter.clientId ? 'SET' : 'NOT SET'}`);
});

