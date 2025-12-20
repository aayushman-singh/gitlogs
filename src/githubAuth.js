/**
 * GitHub OAuth Handler for User Authentication
 * 
 * Allows users to login with GitHub to manage their repositories
 * and set OG posts for tweet quoting.
 */

const crypto = require('crypto');
const config = require('../config/config');

// In-memory session store (use Redis in production)
const sessions = new Map();
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a secure session ID
 */
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a new session for a user
 */
function createSession(user, accessToken) {
  const sessionId = generateSessionId();
  const session = {
    user,
    accessToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION
  };
  
  sessions.set(sessionId, session);
  return sessionId;
}

/**
 * Get session by ID
 */
function getSession(sessionId) {
  if (!sessionId) return null;
  
  const session = sessions.get(sessionId);
  if (!session) return null;
  
  // Check if expired
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  
  return session;
}

/**
 * Delete a session (logout)
 */
function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Get GitHub OAuth authorization URL
 */
function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: getCallbackUrl(),
    scope: 'read:user repo',
    state
  });
  
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Get callback URL
 */
function getCallbackUrl() {
  // Use API_BASE_URL for the callback since OAuth redirects back to the API
  const baseUrl = process.env.API_BASE_URL || process.env.BASE_URL || `http://localhost:${config.server.port}`;
  return `${baseUrl}/auth/github/callback`;
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret,
      code
    })
  });
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }
  
  return data.access_token;
}

/**
 * Get GitHub user info
 */
async function getGitHubUser(accessToken) {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitLogs-Bot'
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get user info');
  }
  
  return response.json();
}

/**
 * Get user's repositories
 */
async function getUserRepos(accessToken) {
  const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitLogs-Bot'
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get repositories');
  }
  
  return response.json();
}

/**
 * Create a webhook on a repository
 */
async function createWebhook(accessToken, repoFullName, webhookUrl, webhookSecret) {
  // First check if webhook already exists
  const existingHooks = await getWebhooks(accessToken, repoFullName);
  const existingHook = existingHooks.find(h => h.config?.url === webhookUrl);
  
  if (existingHook) {
    console.log(`✅ Webhook already exists for ${repoFullName}`);
    return { id: existingHook.id, alreadyExists: true };
  }
  
  const response = await fetch(`https://api.github.com/repos/${repoFullName}/hooks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'GitLogs-Bot'
    },
    body: JSON.stringify({
      name: 'web',
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret: webhookSecret,
        insecure_ssl: '0'
      },
      events: ['push'],
      active: true
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create webhook');
  }
  
  const hook = await response.json();
  console.log(`✅ Webhook created for ${repoFullName} (ID: ${hook.id})`);
  return { id: hook.id, alreadyExists: false };
}

/**
 * Get webhooks for a repository
 */
async function getWebhooks(accessToken, repoFullName) {
  const response = await fetch(`https://api.github.com/repos/${repoFullName}/hooks`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitLogs-Bot'
    }
  });
  
  if (!response.ok) {
    // If 404, user might not have admin access - return empty array
    if (response.status === 404) {
      return [];
    }
    throw new Error('Failed to get webhooks');
  }
  
  return response.json();
}

/**
 * Delete a webhook from a repository
 */
async function deleteWebhook(accessToken, repoFullName, webhookUrl) {
  const hooks = await getWebhooks(accessToken, repoFullName);
  const hook = hooks.find(h => h.config?.url === webhookUrl);
  
  if (!hook) {
    console.log(`ℹ️ No webhook found for ${repoFullName}`);
    return { deleted: false, reason: 'not_found' };
  }
  
  const response = await fetch(`https://api.github.com/repos/${repoFullName}/hooks/${hook.id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitLogs-Bot'
    }
  });
  
  if (!response.ok && response.status !== 204) {
    throw new Error('Failed to delete webhook');
  }
  
  console.log(`✅ Webhook deleted for ${repoFullName}`);
  return { deleted: true };
}

/**
 * Parse session ID from cookie header
 */
function getSessionFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});
  
  return cookies.session_id || null;
}

module.exports = {
  createSession,
  getSession,
  deleteSession,
  getAuthUrl,
  getCallbackUrl,
  exchangeCodeForToken,
  getGitHubUser,
  getUserRepos,
  getSessionFromCookie,
  generateSessionId,
  createWebhook,
  deleteWebhook,
  getWebhooks
};
