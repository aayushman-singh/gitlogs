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
    message: 'Git→Twitter Bot is running',
    version: '1.0.0'
  });
});

// Twitter OAuth callback endpoint (for token generation if needed)
app.get('/callback', (req, res) => {
  res.send(`
    <html>
      <head><title>Twitter OAuth Callback</title></head>
      <body>
        <h1>Twitter OAuth Callback</h1>
        <p>This endpoint is used for Twitter OAuth authentication.</p>
        <p>If you're seeing this, the callback URL is configured correctly.</p>
        <p>Check the server logs for OAuth token information.</p>
      </body>
    </html>
  `);
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
  console.log(`🚀 Git→Twitter Bot listening on port ${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook/github`);
  console.log(`🔒 Webhook secret is ${config.github.webhookSecret ? 'SET' : 'NOT SET'}`);
  console.log(`🐦 Twitter credentials are ${config.twitter.apiKey ? 'SET' : 'NOT SET'}`);
});

