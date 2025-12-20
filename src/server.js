const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
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

// Parse cookies
app.use(cookieParser());

// Frontend URL for redirects after OAuth
const FRONTEND_URL = process.env.FRONTEND_URL || config.server.frontendUrl || 'https://gitlogs.aayushman.dev';

// CORS configuration - allow frontend domain
const allowedOrigins = [
  'https://gitlogs.aayushman.dev',
  'http://localhost:5173', // Vite dev server
  'http://localhost:3000',
  process.env.FRONTEND_URL,
  config.server.frontendUrl
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

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
    return res.redirect(`${FRONTEND_URL}/dashboard?error=${encodeURIComponent(error)}`);
  }
  
  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/dashboard?error=missing_code`);
  }
  
  // Verify state
  if (!githubStateStore.has(state)) {
    return res.redirect(`${FRONTEND_URL}/dashboard?error=invalid_state`);
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
    
    // Set session cookie - use SameSite=None for cross-domain
    res.cookie('session_id', sessionId, {
      httpOnly: true,
      secure: true, // Required for SameSite=None
      sameSite: 'none', // Allow cross-domain cookie
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      domain: config.server.nodeEnv === 'production' ? '.aayushman.dev' : undefined // Share across subdomains
    });
    
    console.log(`✅ GitHub user logged in: @${user.login}`);
    res.redirect(`${FRONTEND_URL}/dashboard?auth=success`);
  } catch (err) {
    console.error('❌ GitHub OAuth callback error:', err);
    res.redirect(`${FRONTEND_URL}/dashboard?error=${encodeURIComponent(err.message)}`);
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

// ============================================
// User API Routes (/api/me/*)
// ============================================

// In-memory store for GitHub tokens (use Redis/DB in production)
const githubTokenStore = new Map();

// Register GitHub token from Firebase auth
app.post('/api/me/github-token', async (req, res) => {
  const { githubToken } = req.body;
  
  if (!githubToken) {
    return res.status(400).json({ error: 'githubToken is required' });
  }
  
  try {
    // Verify token by fetching user info
    const user = await githubAuth.getGitHubUser(githubToken);
    
    // Store token mapped to GitHub user ID
    githubTokenStore.set(`github:${user.id}`, {
      token: githubToken,
      user,
      createdAt: Date.now()
    });
    
    // Create/update user in database
    database.upsertUser({
      userId: `github:${user.id}`,
      githubUsername: user.login,
      displayName: user.name || user.login,
      email: user.email
    });
    
    // Set a cookie to identify the user
    res.cookie('github_user_id', user.id, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      domain: config.server.nodeEnv === 'production' ? '.aayushman.dev' : undefined
    });
    
    console.log(`✅ GitHub token registered for @${user.login}`);
    res.json({ success: true, user: { login: user.login, id: user.id } });
  } catch (err) {
    console.error('❌ Failed to register GitHub token:', err);
    res.status(401).json({ error: 'Invalid GitHub token' });
  }
});

// Helper to get GitHub token from cookie
function getGithubTokenFromCookie(req) {
  const githubUserId = req.cookies?.github_user_id;
  if (!githubUserId) return null;
  
  const stored = githubTokenStore.get(`github:${githubUserId}`);
  return stored?.token || null;
}

// Get current user (based on stored GitHub token)
app.get('/api/me', (req, res) => {
  const githubUserId = req.cookies?.github_user_id;
  if (!githubUserId) {
    return res.status(401).json({ error: 'Not authenticated', user: null });
  }
  
  const stored = githubTokenStore.get(`github:${githubUserId}`);
  if (!stored) {
    return res.status(401).json({ error: 'Session expired', user: null });
  }
  
  res.json({ user: stored.user });
});

// Get user's repos with OG post and enabled status
app.get('/api/me/repos', async (req, res) => {
  const githubToken = getGithubTokenFromCookie(req);
  const githubUserId = req.cookies?.github_user_id;
  
  if (!githubToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const repos = await githubAuth.getUserRepos(githubToken);
    
    // Enrich with OG post data and enabled status
    const enrichedRepos = await Promise.all(repos.map(async (repo) => {
      const ogPostId = await database.getOgPost(repo.full_name);
      const repoStatus = githubUserId ? database.getRepoStatus(`github:${githubUserId}`, repo.full_name) : null;
      
      return {
        id: repo.id,
        full_name: repo.full_name,
        name: repo.name,
        description: repo.description,
        html_url: repo.html_url,
        private: repo.private,
        og_post_id: ogPostId,
        enabled: repoStatus?.enabled || false
      };
    }));
    
    res.json({ repos: enrichedRepos });
  } catch (err) {
    console.error('❌ Failed to get repos:', err);
    res.status(500).json({ error: 'Failed to get repositories' });
  }
});

// Enable posting for a repo
app.post('/api/me/repos/enable', async (req, res) => {
  const githubToken = getGithubTokenFromCookie(req);
  const githubUserId = req.cookies?.github_user_id;
  
  if (!githubToken || !githubUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const { repoFullName } = req.body;
  
  if (!repoFullName) {
    return res.status(400).json({ error: 'repoFullName is required' });
  }
  
  try {
    // Verify user has access to this repo
    const repos = await githubAuth.getUserRepos(githubToken);
    const hasAccess = repos.some(r => r.full_name === repoFullName);
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have access to this repository' });
    }
    
    const success = database.enableRepo(`github:${githubUserId}`, repoFullName);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to enable repo' });
    }
    
    res.json({ success: true, repoFullName, enabled: true });
  } catch (err) {
    console.error('❌ Failed to enable repo:', err);
    res.status(500).json({ error: 'Failed to enable repo' });
  }
});

// Disable posting for a repo
app.post('/api/me/repos/disable', async (req, res) => {
  const githubToken = getGithubTokenFromCookie(req);
  const githubUserId = req.cookies?.github_user_id;
  
  if (!githubToken || !githubUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const { repoFullName } = req.body;
  
  if (!repoFullName) {
    return res.status(400).json({ error: 'repoFullName is required' });
  }
  
  try {
    const success = database.disableRepo(`github:${githubUserId}`, repoFullName);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to disable repo' });
    }
    
    res.json({ success: true, repoFullName, enabled: false });
  } catch (err) {
    console.error('❌ Failed to disable repo:', err);
    res.status(500).json({ error: 'Failed to disable repo' });
  }
});

// Set OG post for user's repo
app.post('/api/me/repos/og-post', async (req, res) => {
  const githubToken = getGithubTokenFromCookie(req);
  const githubUserId = req.cookies?.github_user_id;
  
  if (!githubToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const { repoFullName, tweetId } = req.body;
  
  if (!repoFullName || !tweetId) {
    return res.status(400).json({ error: 'repoFullName and tweetId are required' });
  }
  
  // Verify user has access to this repo
  try {
    const repos = await githubAuth.getUserRepos(githubToken);
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
    if (githubUserId) {
      database.addUserRepo(`github:${githubUserId}`, repoFullName);
    }
    
    res.json({ success: true, repoFullName, tweetId });
  } catch (err) {
    console.error('❌ Failed to set OG post:', err);
    res.status(500).json({ error: 'Failed to set OG post' });
  }
});

// Logout
app.post('/auth/logout', (req, res) => {
  const githubUserId = req.cookies?.github_user_id;
  
  // Clear stored token
  if (githubUserId) {
    githubTokenStore.delete(`github:${githubUserId}`);
  }
  
  res.clearCookie('github_user_id', {
    domain: config.server.nodeEnv === 'production' ? '.aayushman.dev' : undefined
  });
  res.clearCookie('session_id');
  res.json({ success: true });
});

// ============================================
// X/Twitter OAuth Routes
// ============================================

// OAuth 2.0 with PKCE - Start authentication flow
app.get('/auth/x', async (req, res) => {
  try {
    const oauthHandler = new OAuthHandler();
    const { authUrl, codeVerifier } = oauthHandler.generateAuthUrl();
    
    pkceStore.set('state', codeVerifier);
    res.redirect(authUrl);
  } catch (error) {
    console.error('❌ X OAuth initialization error:', error);
    res.status(500).send(`
      <html>
        <head><title>OAuth Error</title></head>
        <body style="font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto;">
          <h1>❌ X OAuth Initialization Failed</h1>
          <p><strong>Error:</strong> ${error.message}</p>
          <p>Make sure OAUTH_CLIENT_ID is set in your .env file.</p>
        </body>
      </html>
    `);
  }
});

// X OAuth callback with PKCE
app.get('/auth/x/callback', async (req, res) => {
  const { code, error, error_description, state } = req.query;
  
  if (error) {
    console.error('❌ X OAuth Error:', error);
    res.send(`
      <html>
        <head><title>OAuth Error</title></head>
        <body style="font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto;">
          <h1>❌ X Authorization Failed</h1>
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
          <h1>✅ X Authentication Successful!</h1>
          <p>Your tokens have been stored. You can now close this window.</p>
          <script>setTimeout(() => window.close(), 2000);</script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ X Token exchange error:', error);
    res.status(500).send(`
      <html>
        <head><title>OAuth Error</title></head>
        <body style="font-family: Arial; padding: 40px; max-width: 800px; margin: 0 auto;">
          <h1>❌ X Token Exchange Failed</h1>
          <p><strong>Error:</strong> ${error.message}</p>
        </body>
      </html>
    `);
  }
});

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
      auth: {
        github: '/auth/github',
        githubCallback: '/auth/github/callback',
        x: '/auth/x',
        xCallback: '/auth/x/callback',
        logout: '/auth/logout'
      },
      user: {
        me: '/api/me',
        repos: '/api/me/repos',
        setOgPost: '/api/me/repos/og-post'
      }
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
  console.log(`🌐 Frontend: ${FRONTEND_URL}`);
  console.log(`📡 Webhook: /webhook/github`);
  console.log(`🔐 Auth endpoints:`);
  if (config.github.clientId) {
    console.log(`   GitHub: /auth/github → /auth/github/callback`);
  }
  if (config.twitter.clientId) {
    console.log(`   X:      /auth/x → /auth/x/callback`);
  }
  console.log(`📊 API: /api/me, /api/me/repos`);
  console.log(`🔒 Webhook secret: ${config.github.webhookSecret ? 'SET' : 'NOT SET'}`);
});

