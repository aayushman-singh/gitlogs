const express = require('express');
const path = require('path');
const config = require('../config/config');
const webhookHandler = require('./webhookHandler');
const OAuthHandler = require('./oauthHandler');
const database = require('./database');
const { getQueueService } = require('./queueService');
const githubAuth = require('./githubAuth');

const app = express();

// Serve static files from frontend dist (production) or public (fallback)
const frontendPath = path.join(__dirname, '../frontend/dist');
const publicPath = path.join(__dirname, '../public');
app.use(express.static(frontendPath));
app.use(express.static(publicPath));

// In-memory store for PKCE verifiers and GitHub OAuth state
const pkceStore = new Map();
const githubStateStore = new Map();

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

// ============================================
// GitHub OAuth Routes (User Authentication)
// ============================================

// Start GitHub OAuth flow
app.get('/auth/github', (req, res) => {
  if (!config.github.clientId) {
    return res.status(500).json({ error: 'GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' });
  }
  
  const state = githubAuth.generateSessionId();
  githubStateStore.set(state, Date.now());
  
  const authUrl = githubAuth.getAuthUrl(state);
  res.redirect(authUrl);
});

// GitHub OAuth callback
app.get('/auth/github/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    console.error('❌ GitHub OAuth error:', error);
    return res.redirect('/dashboard?error=' + encodeURIComponent(error));
  }
  
  if (!code || !state) {
    return res.redirect('/dashboard?error=missing_code');
  }
  
  // Verify state
  if (!githubStateStore.has(state)) {
    return res.redirect('/dashboard?error=invalid_state');
  }
  githubStateStore.delete(state);
  
  try {
    // Exchange code for token
    const accessToken = await githubAuth.exchangeCodeForToken(code);
    
    // Get user info
    const user = await githubAuth.getGitHubUser(accessToken);
    
    // Create session
    const sessionId = githubAuth.createSession(user, accessToken);
    
    // Also create/update user in database
    database.upsertUser({
      userId: `github:${user.id}`,
      githubUsername: user.login,
      displayName: user.name || user.login,
      email: user.email
    });
    
    // Set session cookie
    res.cookie('session_id', sessionId, {
      httpOnly: true,
      secure: config.server.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    console.log(`✅ GitHub user logged in: @${user.login}`);
    res.redirect('/dashboard');
  } catch (err) {
    console.error('❌ GitHub OAuth callback error:', err);
    res.redirect('/dashboard?error=' + encodeURIComponent(err.message));
  }
});

// Auth middleware for user routes
function requireAuth(req, res, next) {
  const sessionId = req.cookies?.session_id || githubAuth.getSessionFromCookie(req.headers.cookie);
  const session = githubAuth.getSession(sessionId);
  
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  req.session = session;
  req.user = session.user;
  next();
}

// Get current user
app.get('/auth/me', (req, res) => {
  const sessionId = req.cookies?.session_id || githubAuth.getSessionFromCookie(req.headers.cookie);
  const session = githubAuth.getSession(sessionId);
  
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated', user: null });
  }
  
  res.json({ user: session.user });
});

// Get user's repos with OG post status
app.get('/auth/repos', requireAuth, async (req, res) => {
  try {
    const repos = await githubAuth.getUserRepos(req.session.accessToken);
    
    // Enrich with OG post data
    const enrichedRepos = await Promise.all(repos.map(async (repo) => {
      const ogPostId = await database.getOgPost(repo.full_name);
      return {
        id: repo.id,
        full_name: repo.full_name,
        name: repo.name,
        description: repo.description,
        html_url: repo.html_url,
        private: repo.private,
        og_post_id: ogPostId
      };
    }));
    
    res.json({ repos: enrichedRepos });
  } catch (err) {
    console.error('❌ Failed to get repos:', err);
    res.status(500).json({ error: 'Failed to get repositories' });
  }
});

// Set OG post for user's repo
app.post('/auth/repos/og-post', requireAuth, async (req, res) => {
  const { repoFullName, tweetId } = req.body;
  
  if (!repoFullName || !tweetId) {
    return res.status(400).json({ error: 'repoFullName and tweetId are required' });
  }
  
  // Verify user has access to this repo
  try {
    const repos = await githubAuth.getUserRepos(req.session.accessToken);
    const hasAccess = repos.some(r => r.full_name === repoFullName);
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this repository' });
    }
    
    // Set OG post
    const success = await database.setOgPost(repoFullName, tweetId);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to set OG post' });
    }
    
    // Also associate repo with user
    database.addUserRepo(`github:${req.user.id}`, repoFullName);
    
    res.json({ success: true, repoFullName, tweetId });
  } catch (err) {
    console.error('❌ Failed to set OG post:', err);
    res.status(500).json({ error: 'Failed to set OG post' });
  }
});

// Logout
app.post('/auth/logout', (req, res) => {
  const sessionId = req.cookies?.session_id || githubAuth.getSessionFromCookie(req.headers.cookie);
  
  if (sessionId) {
    githubAuth.deleteSession(sessionId);
  }
  
  res.clearCookie('session_id');
  res.json({ success: true });
});

// ============================================
// X/Twitter OAuth Routes
// ============================================

// OAuth 2.0 with PKCE - Start authentication flow
app.get('/oauth', async (req, res) => {
  try {
    const oauthHandler = new OAuthHandler();
    const { authUrl, codeVerifier } = oauthHandler.generateAuthUrl();
    
    pkceStore.set('state', codeVerifier);
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
async function handleOAuthCallback(req, res) {
  const { code, error, error_description, state } = req.query;
  
  if (error) {
    console.error('❌ OAuth Error:', error);
    res.send(`
      <html>
        <head><title>OAuth Error</title></head>
        <body style="font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto;">
          <h1>❌ OAuth Authorization Failed</h1>
          <p><strong>Error:</strong> ${error}</p>
          ${error_description ? `<p><strong>Description:</strong> ${error_description}</p>` : ''}
        </body>
      </html>
    `);
    return;
  }

  if (!code) {
    res.status(400).send('No authorization code received');
    return;
  }

  try {
    const codeVerifier = pkceStore.get(state || 'state');
    if (!codeVerifier) {
      throw new Error('PKCE code verifier not found. Please restart the OAuth flow.');
    }

    const oauthHandler = new OAuthHandler();
    await oauthHandler.exchangeCodeForTokens(code, codeVerifier);
    
    pkceStore.delete(state || 'state');
    
    res.send(`
      <html>
        <head><title>Authentication Successful</title></head>
        <body style="font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto;">
          <h1>✅ Authentication Successful!</h1>
          <p>Your tokens have been stored. You can now close this window.</p>
          <script>setTimeout(() => window.close(), 2000);</script>
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
        </body>
      </html>
    `);
  }
}

app.get('/callback', handleOAuthCallback);
app.get('/oauth/callback', handleOAuthCallback);

// ============================================
// Webhook
// ============================================

app.post('/webhook/github', webhookHandler.handleWebhook);

// ============================================
// Admin API Endpoints (require API key)
// ============================================

function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!adminKey) {
    if (config.server.nodeEnv === 'development') {
      return next();
    }
    return res.status(403).json({ error: 'Admin API not configured' });
  }
  
  if (apiKey !== adminKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
}

// Get queue and system stats
app.get('/api/stats', requireApiKey, (req, res) => {
  const stats = webhookHandler.getStats();
  const queueService = getQueueService();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    queue: queueService ? queueService.getStats() : null,
    ...stats
  });
});

// User management - Create/Update user
app.post('/api/users', requireApiKey, (req, res) => {
  const { userId, githubUsername, displayName, email, tier } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  
  const user = database.upsertUser({ userId, githubUsername, displayName, email, tier });
  
  if (!user) {
    return res.status(500).json({ error: 'Failed to create/update user' });
  }
  
  res.json({ success: true, user });
});

// Get user info
app.get('/api/users/:userId', requireApiKey, (req, res) => {
  const user = database.getUser(req.params.userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const repos = database.getUserRepos(req.params.userId);
  const usage = database.getApiUsage(req.params.userId, 'gemini');
  
  res.json({
    user,
    repos,
    currentHourUsage: usage,
    quotaRemaining: user.api_quota_limit - usage
  });
});

// Add repository to user
app.post('/api/users/:userId/repos', requireApiKey, (req, res) => {
  const { repoFullName, webhookSecret } = req.body;
  
  if (!repoFullName) {
    return res.status(400).json({ error: 'repoFullName is required' });
  }
  
  const user = database.getUser(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const success = database.addUserRepo(req.params.userId, repoFullName, webhookSecret);
  
  if (!success) {
    return res.status(500).json({ error: 'Failed to add repository' });
  }
  
  res.json({ success: true, repoFullName });
});

// Get user's repositories
app.get('/api/users/:userId/repos', requireApiKey, (req, res) => {
  const repos = database.getUserRepos(req.params.userId);
  res.json({ repos });
});

// Get repository context
app.get('/api/repos/:owner/:repo/context', requireApiKey, async (req, res) => {
  const repoFullName = `${req.params.owner}/${req.params.repo}`;
  const context = database.getRepoContext(repoFullName);
  
  if (!context) {
    return res.status(404).json({ error: 'Repository context not found' });
  }
  
  res.json({ context });
});

// Set OG post for a repository (admin)
app.post('/api/repos/:owner/:repo/og-post', requireApiKey, async (req, res) => {
  const repoFullName = `${req.params.owner}/${req.params.repo}`;
  const { tweetId } = req.body;
  
  if (!tweetId) {
    return res.status(400).json({ error: 'tweetId is required' });
  }
  
  const success = await database.setOgPost(repoFullName, tweetId);
  
  if (!success) {
    return res.status(500).json({ error: 'Failed to set OG post' });
  }
  
  res.json({ success: true, repoFullName, tweetId });
});

// Get OG post for a repository
app.get('/api/repos/:owner/:repo/og-post', requireApiKey, async (req, res) => {
  const repoFullName = `${req.params.owner}/${req.params.repo}`;
  const tweetId = await database.getOgPost(repoFullName);
  
  res.json({ repoFullName, tweetId });
});

// Health check
app.get('/api/health', (req, res) => {
  const queueService = getQueueService();
  const queueStats = queueService ? queueService.getStats() : null;
  
  res.json({
    status: 'healthy',
    version: '2.0.0',
    features: {
      multiUser: config.multiUser?.enabled || false,
      queueEnabled: !!queueService,
      geminiEnabled: !!config.gemini.apiKey,
      githubOAuth: !!config.github.clientId
    },
    queue: queueStats ? {
      pending: queueStats.currentQueueLength,
      processing: queueStats.processingCount,
      rateLimitRemaining: queueStats.rateLimitRemaining
    } : null
  });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Gitlogs bot is running',
    version: '2.0.0',
    endpoints: {
      health: '/api/health',
      stats: '/api/stats',
      webhook: '/webhook/github',
      oauth: '/oauth',
      githubAuth: '/auth/github'
    }
  });
});

// SPA fallback - serve index.html for client-side routing
app.get('*', (req, res) => {
  // Try frontend dist first, then public
  const indexPath = path.join(frontendPath, 'index.html');
  const publicIndex = path.join(publicPath, 'index.html');
  
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.sendFile(publicIndex, (err2) => {
        if (err2) {
          res.status(404).json({ error: 'Not found' });
        }
      });
    }
  });
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
  console.log(`🌐 Frontend: http://localhost:${PORT}`);
  console.log(`📡 Webhook: http://localhost:${PORT}/webhook/github`);
  if (config.twitter.clientId) {
    console.log(`🐦 X OAuth: http://localhost:${PORT}/oauth`);
  }
  if (config.github.clientId) {
    console.log(`🐙 GitHub OAuth: http://localhost:${PORT}/auth/github`);
  }
  console.log(`🔒 Webhook secret: ${config.github.webhookSecret ? 'SET' : 'NOT SET'}`);
});
