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
const { TEMPLATE_VARIABLES, TEMPLATE_PRESETS } = require('./geminiClient');

const app = express();

// Serve static files from frontend dist (production) or public (fallback)
// fallthrough: true ensures requests for non-existent files pass to next middleware (for SPA routing)
const frontendPath = path.join(__dirname, '../frontend/dist');
const publicPath = path.join(__dirname, '../public');
app.use(express.static(frontendPath, { fallthrough: true }));
app.use(express.static(publicPath, { fallthrough: true }));

// In-memory store for PKCE verifiers and GitHub OAuth state
// pkceStore: state -> { codeVerifier, githubUserId, timestamp }
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
// Direct OAuth with refresh token support - no Firebase needed
// ============================================

// Start GitHub OAuth flow
app.get('/auth/github', (req, res) => {
  if (!config.github.clientId) {
    return res.status(500).json({ error: 'GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' });
  }
  
  const state = githubAuth.generateSecureToken();
  githubStateStore.set(state, Date.now());
  
  // Clean up old states (older than 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, timestamp] of githubStateStore.entries()) {
    if (timestamp < tenMinutesAgo) {
      githubStateStore.delete(key);
    }
  }
  
  const authUrl = githubAuth.getAuthUrl(state);
  res.redirect(authUrl);
});

// GitHub OAuth callback - exchanges code for tokens (including refresh token)
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
    // Exchange code for tokens (access + refresh)
    const tokens = await githubAuth.exchangeCodeForTokens(code);
    
    // Get user info
    const user = await githubAuth.getGitHubUser(tokens.accessToken);
    
    // Calculate expiration time (if provided by GitHub)
    // GitHub Apps: tokens expire in ~8 hours
    // Classic OAuth: tokens don't expire (expiresIn will be null)
    const expiresAt = tokens.expiresIn 
      ? new Date(Date.now() + tokens.expiresIn * 1000)
      : null;
    
    // Store tokens in database (persistent, survives server restarts)
    database.storeGithubToken(
      user.id.toString(),
      tokens.accessToken,
      user,
      expiresAt,
      tokens.refreshToken
    );
    
    // Create/update user in database
    database.upsertUser({
      userId: `github:${user.id}`,
      githubUsername: user.login,
      displayName: user.name || user.login,
      email: user.email
    });
    
    // Set cookie to identify the user (long-lived - 6 months to match refresh token)
    res.cookie('github_user_id', user.id, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 180 * 24 * 60 * 60 * 1000, // 180 days (6 months)
      domain: config.server.nodeEnv === 'production' ? '.aayushman.dev' : undefined
    });
    
    const tokenType = tokens.refreshToken ? 'with refresh token' : 'classic (no expiry)';
    console.log(`✅ GitHub user logged in: @${user.login} (${tokenType})`);
    res.redirect(`${FRONTEND_URL}/dashboard?auth=success`);
  } catch (err) {
    console.error('❌ GitHub OAuth callback error:', err);
    res.redirect(`${FRONTEND_URL}/dashboard?error=${encodeURIComponent(err.message)}`);
  }
});

// ============================================
// User API Routes (/api/me/*)
// All endpoints use automatic token refresh via githubAuth.getValidAccessToken()
// ============================================

// Helper to get GitHub user ID from cookie
function getGithubUserIdFromCookie(req) {
  return req.cookies?.github_user_id?.toString() || null;
}

// Get current user (based on stored GitHub token)
app.get('/api/me', async (req, res) => {
  const githubUserId = getGithubUserIdFromCookie(req);
  if (!githubUserId) {
    return res.status(401).json({ error: 'Not authenticated', user: null });
  }
  
  const tokenData = database.getGithubToken(githubUserId);
  if (!tokenData) {
    return res.status(401).json({ 
      error: 'not_authenticated', 
      message: 'Please sign in with GitHub.',
      user: null 
    });
  }
  
  // Try to get a valid token (will auto-refresh if needed)
  const validToken = await githubAuth.getValidAccessToken(githubUserId);
  if (!validToken) {
    return res.status(401).json({ 
      error: 'token_expired', 
      message: 'Session expired. Please sign in again.',
      user: null 
    });
  }
  
  // Get fresh token data after potential refresh
  const freshTokenData = database.getGithubToken(githubUserId);
  
  // Get X/Twitter user info if connected (per-user X OAuth)
  const xOAuthUserId = database.getXOAuthUserId(githubUserId);
  let xUserInfo = null;
  const xConnected = database.isOAuthTokenValid(xOAuthUserId);
  
  if (xConnected) {
    try {
      const { getXUserInfo } = require('./twitterClient');
      xUserInfo = await getXUserInfo(xOAuthUserId);
    } catch (err) {
      console.error('Failed to get X user info:', err.message);
      // Continue without X user info
    }
  }
  
  res.json({ 
    user: freshTokenData.user, 
    xConnected: xConnected,
    tokenExpiresAt: freshTokenData.expiresAt,
    hasRefreshToken: !!freshTokenData.refreshToken,
    xUserInfo: xUserInfo
  });
});

// Get user's repos with OG post and enabled status
app.get('/api/me/repos', async (req, res) => {
  const githubUserId = getGithubUserIdFromCookie(req);
  
  if (!githubUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    // This automatically refreshes the token if needed
    const repos = await githubAuth.getUserRepos(githubUserId);
    
    // Enrich with OG post data and enabled status
    const enrichedRepos = await Promise.all(repos.map(async (repo) => {
      const ogPostId = await database.getOgPost(repo.full_name);
      const repoStatus = database.getRepoStatus(`github:${githubUserId}`, repo.full_name);
      
      return {
        id: repo.id,
        full_name: repo.full_name,
        name: repo.name,
        description: repo.description,
        html_url: repo.html_url,
        private: repo.private,
        stargazers_count: repo.stargazers_count || 0,
        pushed_at: repo.pushed_at,
        updated_at: repo.updated_at,
        og_post_id: ogPostId,
        enabled: repoStatus?.enabled || false
      };
    }));
    
    res.json({ repos: enrichedRepos });
  } catch (err) {
    console.error('❌ Failed to get repos:', err);
    if (err.message === 'No valid access token available' || err.message === 'Token expired') {
      return res.status(401).json({ error: 'token_expired', message: 'Please sign in again.' });
    }
    res.status(500).json({ error: 'Failed to get repositories' });
  }
});

// Enable posting for a repo
app.post('/api/me/repos/enable', async (req, res) => {
  const githubUserId = getGithubUserIdFromCookie(req);
  
  if (!githubUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const { repoFullName } = req.body;
  
  if (!repoFullName) {
    return res.status(400).json({ error: 'repoFullName is required' });
  }
  
  try {
    // Verify user has access to this repo (auto-refreshes token)
    const repos = await githubAuth.getUserRepos(githubUserId);
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
    
    // Create webhook automatically (uses auto-refresh)
    const webhookUrl = `${process.env.API_BASE_URL || `http://localhost:${config.server.port}`}/webhook/github`;
    const webhookSecret = config.github.webhookSecret;
    
    if (!webhookSecret) {
      return res.status(500).json({ error: 'Webhook secret not configured on server' });
    }
    
    const webhookResult = await githubAuth.createWebhook(githubUserId, repoFullName, webhookUrl, webhookSecret);
    
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
    if (err.message === 'No valid access token available') {
      return res.status(401).json({ error: 'token_expired', message: 'Please sign in again.' });
    }
    res.status(500).json({ error: err.message || 'Failed to enable repo' });
  }
});

// Disable posting for a repo
app.post('/api/me/repos/disable', async (req, res) => {
  const githubUserId = getGithubUserIdFromCookie(req);
  
  if (!githubUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const { repoFullName } = req.body;
  
  if (!repoFullName) {
    return res.status(400).json({ error: 'repoFullName is required' });
  }
  
  try {
    // Delete webhook (uses auto-refresh)
    const webhookUrl = `${process.env.API_BASE_URL || `http://localhost:${config.server.port}`}/webhook/github`;
    let webhookDeleted = false;
    
    try {
      const result = await githubAuth.deleteWebhook(githubUserId, repoFullName, webhookUrl);
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
    if (err.message === 'No valid access token available') {
      return res.status(401).json({ error: 'token_expired', message: 'Please sign in again.' });
    }
    res.status(500).json({ error: 'Failed to disable repo' });
  }
});

// Set OG post for user's repo
app.post('/api/me/repos/og-post', async (req, res) => {
  const githubUserId = getGithubUserIdFromCookie(req);
  
  if (!githubUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const { repoFullName, tweetId } = req.body;
  
  if (!repoFullName || !tweetId) {
    return res.status(400).json({ error: 'repoFullName and tweetId are required' });
  }
  
  // Verify user has access to this repo (auto-refreshes token)
  try {
    const repos = await githubAuth.getUserRepos(githubUserId);
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
    if (err.message === 'No valid access token available') {
      return res.status(401).json({ error: 'token_expired', message: 'Please sign in again.' });
    }
    res.status(500).json({ error: 'Failed to set OG post' });
  }
});

// ============================================
// Prompt Template API Routes
// ============================================

// Get user's custom templates and active template
app.get('/api/me/templates', (req, res) => {
  const githubUserId = getGithubUserIdFromCookie(req);
  
  if (!githubUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const userId = `github:${githubUserId}`;
  const templates = database.getPromptTemplates(userId);
  const activeTemplate = database.getActivePromptTemplate(userId);
  
  res.json({
    templates: templates.map(t => ({
      id: t.template_id,
      name: t.template_name,
      template: t.template_content,
      isActive: t.is_active === 1,
      createdAt: t.created_at,
      updatedAt: t.updated_at
    })),
    activeTemplateId: activeTemplate ? activeTemplate.template_id : 'default'
  });
});

// Save a custom template
app.post('/api/me/templates', (req, res) => {
  const githubUserId = getGithubUserIdFromCookie(req);
  
  if (!githubUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const { templateId, templateName, templateContent } = req.body;
  
  if (!templateId || !templateName || !templateContent) {
    return res.status(400).json({ error: 'templateId, templateName, and templateContent are required' });
  }
  
  // Prevent overwriting preset IDs
  if (TEMPLATE_PRESETS[templateId]) {
    return res.status(400).json({ error: 'Cannot use a preset template ID for custom templates' });
  }
  
  const userId = `github:${githubUserId}`;
  const success = database.savePromptTemplate(userId, templateId, templateName, templateContent);
  
  if (!success) {
    return res.status(500).json({ error: 'Failed to save template' });
  }
  
  res.json({ success: true, templateId, templateName });
});

// Set active template (can be a preset or custom template)
app.post('/api/me/templates/active', (req, res) => {
  const githubUserId = getGithubUserIdFromCookie(req);
  
  if (!githubUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const { templateId } = req.body;
  const userId = `github:${githubUserId}`;
  
  // If it's a preset, save it as a custom template first
  if (templateId && TEMPLATE_PRESETS[templateId]) {
    const preset = TEMPLATE_PRESETS[templateId];
    database.savePromptTemplate(userId, templateId, preset.name, preset.template);
  }
  
  const success = database.setActivePromptTemplate(userId, templateId);
  
  if (!success) {
    return res.status(500).json({ error: 'Failed to set active template' });
  }
  
  res.json({ success: true, activeTemplateId: templateId || 'default' });
});

// Delete a custom template
app.delete('/api/me/templates/:templateId', (req, res) => {
  const githubUserId = getGithubUserIdFromCookie(req);
  
  if (!githubUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const { templateId } = req.params;
  
  if (!templateId) {
    return res.status(400).json({ error: 'templateId is required' });
  }
  
  const userId = `github:${githubUserId}`;
  const success = database.deletePromptTemplate(userId, templateId);
  
  if (!success) {
    return res.status(500).json({ error: 'Failed to delete template' });
  }
  
  res.json({ success: true });
});

// Logout
app.post('/auth/logout', (req, res) => {
  const githubUserId = req.cookies?.github_user_id;
  
  // Clear stored token from database
  if (githubUserId) {
    database.deleteGithubToken(githubUserId.toString());
  }
  
  res.clearCookie('github_user_id', {
    domain: config.server.nodeEnv === 'production' ? '.aayushman.dev' : undefined
  });
  res.clearCookie('session_id');
  res.json({ success: true });
});

// ============================================
// X/Twitter OAuth Routes (per-user X OAuth)
// ============================================

// OAuth 2.0 with PKCE - Start authentication flow
// User must be logged in with GitHub first
app.get('/auth/x', async (req, res) => {
  try {
    // Get GitHub user from cookie - required for per-user X OAuth
    const githubUserId = getGithubUserIdFromCookie(req);
    if (!githubUserId) {
      return res.send(renderXAuthPage({
        title: 'GitHub login required',
        message: 'Please sign in with GitHub before connecting your X account.',
        detail: 'X accounts are linked to your GitHub account for multi-user support.',
        status: 'error'
      }));
    }
    
    const oauthHandler = new OAuthHandler();
    const { authUrl, codeVerifier } = oauthHandler.generateAuthUrl();
    
    // Generate a unique state to prevent CSRF and store with user info
    const state = `x_${Date.now()}_${githubUserId}`;
    
    // Store PKCE verifier with GitHub user ID for callback
    pkceStore.set(state, {
      codeVerifier,
      githubUserId,
      timestamp: Date.now()
    });
    
    // Clean up old PKCE states (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of pkceStore.entries()) {
      if (value.timestamp && value.timestamp < tenMinutesAgo) {
        pkceStore.delete(key);
      }
    }
    
    // Modify auth URL to use our custom state
    const authUrlWithState = authUrl.replace(/state=[^&]+/, `state=${encodeURIComponent(state)}`);
    
    console.log(`🔐 Starting X OAuth for GitHub user: ${githubUserId}`);
    res.redirect(authUrlWithState);
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

// X OAuth callback with PKCE (per-user)
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
    // Get stored PKCE data including GitHub user ID
    const pkceData = pkceStore.get(state);
    if (!pkceData || !pkceData.codeVerifier) {
      throw new Error('PKCE code verifier not found. Please restart the OAuth flow.');
    }
    
    const { codeVerifier, githubUserId } = pkceData;
    
    if (!githubUserId) {
      throw new Error('GitHub user ID not found. Please sign in with GitHub first.');
    }
    
    // Get the X OAuth user ID for this GitHub user
    const xOAuthUserId = database.getXOAuthUserId(githubUserId);
    
    const oauthHandler = new OAuthHandler();
    await oauthHandler.exchangeCodeForTokens(code, codeVerifier, xOAuthUserId);
    
    pkceStore.delete(state);
    
    console.log(`✅ X account connected for GitHub user: ${githubUserId} (stored as: ${xOAuthUserId})`);
    
    res.send(renderXAuthPage({
      title: 'X connected successfully',
      message: 'Your X account is now linked to your GitLogs account.',
      detail: 'Your X connection is personal and won\'t affect other users. You can safely close this window.',
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

// Debug endpoint to check repo status
app.get('/api/debug/repo/:owner/:repo', requireApiKey, (req, res) => {
  const repoFullName = `${req.params.owner}/${req.params.repo}`;
  
  const isEnabled = database.isRepoEnabled(repoFullName);
  const user = database.getUserByRepo(repoFullName);
  const context = database.getRepoContext(repoFullName);
  const allReposInDb = database.getUserRepos(user?.user_id || '');
  
  res.json({
    repoFullName,
    isEnabled,
    user: user ? { user_id: user.user_id, github_username: user.github_username } : null,
    hasContext: !!context,
    allowedReposEnv: config.github.allowedRepos,
    webhookSecret: config.github.webhookSecret ? 'SET' : 'NOT SET',
    allReposForUser: allReposInDb
  });
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
// This must be last, after all API routes and static file serving
// Express will only reach this if no previous route matched
app.get('*', (req, res) => {
  // API routes that don't exist should return JSON 404, not HTML
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ 
      error: 'Not found',
      message: `API endpoint ${req.method} ${req.path} does not exist`
    });
  }
  
  // Try frontend dist first, then public
  const indexPath = path.join(frontendPath, 'index.html');
  const publicIndex = path.join(publicPath, 'index.html');
  
  // Try to send frontend dist index.html first
  res.sendFile(indexPath, (err) => {
    if (err) {
      // If frontend dist doesn't exist, try public folder
      res.sendFile(publicIndex, (err2) => {
        if (err2) {
          // If neither exists, return 404
          console.error('Failed to serve index.html:', err2.message);
          res.status(404).json({ 
            error: 'Frontend not found', 
            message: 'Please ensure the frontend is built and index.html exists.' 
          });
        }
      });
    }
  });
});

// Catch-all for other HTTP methods (POST, PUT, DELETE, etc.) on non-API routes
app.use((req, res) => {
  // API routes that don't exist should return JSON 404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ 
      error: 'Not found',
      message: `API endpoint ${req.method} ${req.path} does not exist`
    });
  }
  
  // For non-API routes, return 404
  res.status(404).json({ 
    error: 'Not found',
    message: `${req.method} ${req.path} does not exist`
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

