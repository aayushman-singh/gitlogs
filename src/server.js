const express = require('express');
const config = require('../config/config');
const webhookHandler = require('./webhookHandler');

/**
 * Main Express server
 * Receives GitHub webhook events and processes commits
 */

const app = express();

// Middleware to parse JSON payloads
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Git→Twitter Bot is running',
    version: '1.0.0'
  });
});

// GitHub webhook endpoint
// This is where GitHub will POST commit events
app.post('/webhook/github', webhookHandler.handleWebhook);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: config.server.nodeEnv === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`🚀 Git→Twitter Bot listening on port ${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook/github`);
  console.log(`🔒 Webhook secret is ${config.github.webhookSecret ? 'SET' : 'NOT SET'}`);
  console.log(`🐦 Twitter credentials are ${config.twitter.apiKey ? 'SET' : 'NOT SET'}`);
});

