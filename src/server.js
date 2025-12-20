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

function renderXAuthPage({ title, message, detail = '', status = 'success' }) {
  const isSuccess = status === 'success';
  const accent = isSuccess ? '#3fb950' : '#f85149';
  const actionLabel = isSuccess ? 'Return to GitLogs' : 'Back to GitLogs';
  const statusLabel = isSuccess ? 'Connected' : 'Action needed';

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          :root {
            color-scheme: dark;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: radial-gradient(circle at top, rgba(88, 166, 255, 0.12), transparent 55%),
              radial-gradient(circle at 20% 40%, rgba(63, 185, 80, 0.14), transparent 45%),
              #0b0f14;
            color: #e6edf3;
            font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
            padding: 32px 18px;
          }
          .card {
            width: min(560px, 100%);
            background: rgba(16, 20, 28, 0.92);
            border: 1px solid rgba(148, 163, 184, 0.25);
            border-radius: 20px;
            padding: 36px;
            box-shadow: 0 28px 60px rgba(0, 0, 0, 0.45);
            text-align: center;
          }
          .logo {
            width: 140px;
            height: auto;
            margin: 0 auto 18px;
            display: block;
            filter: invert(1);
          }
          .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            border-radius: 999px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: ${accent};
            border: 1px solid ${accent}66;
            background: ${accent}1a;
            margin-bottom: 18px;
          }
          h1 {
            font-size: 28px;
            margin: 0 0 12px;
          }
          p {
            margin: 0 0 12px;
            color: rgba(226, 232, 240, 0.7);
            line-height: 1.6;
          }
          .detail {
            margin-top: 12px;
            padding: 12px 16px;
            background: rgba(12, 15, 20, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 12px;
            font-size: 13px;
            color: rgba(226, 232, 240, 0.65);
          }
          .actions {
            margin-top: 26px;
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            justify-content: center;
          }
          .btn {
            padding: 12px 18px;
            border-radius: 10px;
            border: 1px solid transparent;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            text-decoration: none;
          }
          .btn-primary {
            background: ${accent};
            color: #0b0f14;
          }
          .btn-secondary {
            background: rgba(20, 25, 34, 0.7);
            border-color: rgba(148, 163, 184, 0.3);
            color: #e2e8f0;
          }
          .note {
            margin-top: 18px;
            font-size: 12px;
            color: rgba(226, 232, 240, 0.5);
          }
        </style>
      </head>
      <body>
        <main class="card">
          <img class="logo" src="/gitlogs.png" alt="GitLogs logo" />
          <span class="status-pill">${statusLabel}</span>
          <h1>${title}</h1>
          <p>${message}</p>
          ${detail ? `<div class="detail">${detail}</div>` : ''}
          <div class="actions">
            <a class="btn btn-primary" href="${FRONTEND_URL}" target="_blank" rel="noopener noreferrer">${actionLabel}</a>
            <button class="btn btn-secondary" onclick="window.close()">Close</button>
          </div>
          ${isSuccess ? '<div class="note">This window will close automatically in a moment.</div>' : ''}
        </main>
        ${isSuccess ? '<script>setTimeout(() => window.close(), 2000);</script>' : ''}
      </body>
    </html>
  `;
}

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
  
  res.json({ user: stored.user, xConnected: database.isOAuthTokenValid() });
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
    const repo = repos.find(r => r.full_name === repoFullName);
    
    if (!repo) {
      return res.status(403).json({ error: 'You do not have access to this repository' });
    }
    
    // Check if user has admin access (required for webhook creation)
    if (!repo.permissions?.admin) {
      return res.status(403).json({ 
        error: 'Admin access required to enable webhooks. You need push access to this repository.' 
      });
    }
    
    // Create webhook automatically
    const webhookUrl = `${process.env.API_BASE_URL || `http://localhost:${config.server.port}`}/webhook/github`;
    const webhookSecret = config.github.webhookSecret;
    
    if (!webhookSecret) {
      return res.status(500).json({ error: 'Webhook secret not configured on server' });
    }
    
    const webhookResult = await githubAuth.createWebhook(githubToken, repoFullName, webhookUrl, webhookSecret);
    
    const success = database.enableRepo(`github:${githubUserId}`, repoFullName);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to enable repo' });
    }
    
    console.log(`✅ Enabled repo ${repoFullName} for user github:${githubUserId}`);
    res.json({ 
      success: true, 
      repoFullName, 
      enabled: true,
      webhookCreated: !webhookResult.alreadyExists,
      webhookExists: webhookResult.alreadyExists
    });
  } catch (err) {
    console.error('❌ Failed to enable repo:', err);
    res.status(500).json({ error: err.message || 'Failed to enable repo' });
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
    // Delete webhook
    const webhookUrl = `${process.env.API_BASE_URL || `http://localhost:${config.server.port}`}/webhook/github`;
    let webhookDeleted = false;
    
    try {
      const result = await githubAuth.deleteWebhook(githubToken, repoFullName, webhookUrl);
      webhookDeleted = result.deleted;
    } catch (webhookErr) {
      // Log but don't fail - user might have lost admin access
      console.log(`⚠️ Could not delete webhook for ${repoFullName}:`, webhookErr.message);
    }
    
    const success = database.disableRepo(`github:${githubUserId}`, repoFullName);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to disable repo' });
    }
    
    console.log(`✅ Disabled repo ${repoFullName} for user github:${githubUserId}`);
    res.json({ success: true, repoFullName, enabled: false, webhookDeleted });
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
    res
      .status(500)
      .send(renderXAuthPage({
        title: 'X OAuth initialization failed',
        message: 'We could not start the X connection flow. Please try again in a moment.',
        detail: `Error: ${error.message}. Make sure OAUTH_CLIENT_ID is set.`,
        status: 'error'
      }));
  }
});

// X OAuth callback with PKCE
app.get('/auth/x/callback', async (req, res) => {
  const { code, error, error_description, state } = req.query;
  
  if (error) {
    console.error('❌ X OAuth Error:', error);
    res.send(renderXAuthPage({
      title: 'X authorization failed',
      message: 'We did not receive authorization from X.',
      detail: `Error: ${error}${error_description ? `. ${error_description}` : ''}`,
      status: 'error'
    }));
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
    
    res.send(renderXAuthPage({
      title: 'X connected successfully',
      message: 'Your X account is now linked to GitLogs.',
      detail: 'You can safely close this window or return to the dashboard.',
      status: 'success'
    }));
  } catch (error) {
    console.error('❌ X Token exchange error:', error);
    res
      .status(500)
      .send(renderXAuthPage({
        title: 'X token exchange failed',
        message: 'We could not finish the X connection.',
        detail: `Error: ${error.message}`,
        status: 'error'
      }));
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

