const crypto = require('crypto');
const https = require('https');
const http = require('http');

/**
 * Test script for sending mock GitHub webhook payloads
 * Usage: node test-webhook.js [webhook-secret] [server-url]
 */

// Default values
const WEBHOOK_SECRET = process.argv[2] || 'test-secret';
const SERVER_URL = process.argv[3] || 'http://localhost:3000/webhook/github';

// Sample GitHub webhook payload (push event)
const mockPayload = {
  ref: 'refs/heads/main',
  commits: [
    {
      id: 'abc123def456',
      message: 'feat: Add new feature\n\nThis commit adds a cool new feature to the project.',
      timestamp: new Date().toISOString(),
      url: 'https://github.com/testuser/testrepo/commit/abc123def456',
      author: {
        name: 'Test User',
        email: 'test@example.com',
        username: 'testuser'
      },
      added: ['src/newfile.js'],
      removed: [],
      modified: ['README.md']
    },
    {
      id: 'def456ghi789',
      message: 'fix: Fix critical bug\n\nFixes an important bug that was causing issues.',
      timestamp: new Date().toISOString(),
      url: 'https://github.com/testuser/testrepo/commit/def456ghi789',
      author: {
        name: 'Test User',
        email: 'test@example.com',
        username: 'testuser'
      },
      added: [],
      removed: ['oldfile.js'],
      modified: ['src/main.js']
    }
  ],
  repository: {
    name: 'testrepo',
    full_name: 'testuser/testrepo',
    url: 'https://github.com/testuser/testrepo'
  },
  pusher: {
    name: 'Test User',
    email: 'test@example.com'
  }
};

/**
 * Generate GitHub webhook signature
 */
function generateSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(JSON.stringify(payload)).digest('hex');
  return `sha256=${digest}`;
}

/**
 * Send test webhook
 */
function sendWebhook() {
  const payloadString = JSON.stringify(mockPayload);
  const signature = generateSignature(mockPayload, WEBHOOK_SECRET);
  
  const url = new URL(SERVER_URL);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;
  
  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payloadString),
      'X-GitHub-Event': 'push',
      'X-Hub-Signature-256': signature,
      'X-GitHub-Delivery': 'test-delivery-id-' + Date.now()
    }
  };

  console.log('📤 Sending test webhook...');
  console.log(`   URL: ${SERVER_URL}`);
  console.log(`   Event: push`);
  console.log(`   Commits: ${mockPayload.commits.length}`);
  console.log(`   Repository: ${mockPayload.repository.full_name}`);
  console.log('');

  const req = client.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log(`📥 Response Status: ${res.statusCode}`);
      console.log(`📥 Response Body: ${data || '(empty)'}`);
      
      if (res.statusCode === 200) {
        console.log('✅ Webhook accepted!');
      } else {
        console.log('❌ Webhook rejected!');
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Error sending webhook:', error.message);
    console.error('   Make sure the server is running!');
  });

  req.write(payloadString);
  req.end();
}

// Run the test
console.log('🧪 GitHub Webhook Test Script');
console.log('==============================\n');
sendWebhook();

