/**
 * GitHub OAuth Handler with Refresh Token Support
 * 
 * Handles GitHub OAuth flow with automatic token refresh.
 * Tokens are stored in the database for persistence.
 * 
 * Requirements:
 * - GitHub App with "Expire user authorization tokens" enabled
 * - GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env
 */

const crypto = require('crypto');
const config = require('../config/config');
const database = require('./database');

// Token expiration buffer - refresh 10 minutes before expiry
const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000;

/**
 * Generate a secure random string
 */
function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
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
  const baseUrl = process.env.API_BASE_URL || process.env.BASE_URL || `http://localhost:${config.server.port}`;
  return `${baseUrl}/auth/github/callback`;
}

/**
 * Exchange authorization code for tokens (access + refresh)
 * GitHub Apps return both access_token and refresh_token
 */
async function exchangeCodeForTokens(code) {
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
  
  // GitHub Apps return: access_token, expires_in, refresh_token, refresh_token_expires_in
  // Classic OAuth Apps only return: access_token (no expiry)
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn: data.expires_in || null, // seconds until access token expires
    refreshTokenExpiresIn: data.refresh_token_expires_in || null,
    tokenType: data.token_type || 'bearer',
    scope: data.scope
  };
}

/**
 * Refresh an access token using the refresh token
 */
async function refreshAccessToken(refreshToken) {
  console.log('🔄 Refreshing GitHub access token...');
  
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });
  
  const data = await response.json();
  
  if (data.error) {
    console.error('❌ Token refresh failed:', data.error_description || data.error);
    throw new Error(data.error_description || data.error);
  }
  
  console.log('✅ GitHub access token refreshed successfully');
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // New refresh token or keep old one
    expiresIn: data.expires_in || null,
    refreshTokenExpiresIn: data.refresh_token_expires_in || null,
    tokenType: data.token_type || 'bearer',
    scope: data.scope
  };
}

/**
 * Get a valid access token for a user, refreshing if necessary
 * This is the main function to call when you need to make GitHub API requests
 */
async function getValidAccessToken(githubUserId) {
  const tokenData = database.getGithubToken(githubUserId);
  
  if (!tokenData) {
    return null;
  }
  
  // Check if token is expired or about to expire
  if (tokenData.expiresAt) {
    const expiresAt = new Date(tokenData.expiresAt).getTime();
    const now = Date.now();
    
    // If token is expired or will expire soon, try to refresh
    if (now >= expiresAt - TOKEN_REFRESH_BUFFER_MS) {
      if (tokenData.refreshToken) {
        try {
          const newTokens = await refreshAccessToken(tokenData.refreshToken);
          
          // Calculate new expiration time
          const newExpiresAt = newTokens.expiresIn 
            ? new Date(Date.now() + newTokens.expiresIn * 1000)
            : null;
          
          // Update stored tokens
          database.storeGithubToken(
            githubUserId,
            newTokens.accessToken,
            tokenData.user,
            newExpiresAt,
            newTokens.refreshToken
          );
          
          return newTokens.accessToken;
        } catch (error) {
          console.error(`❌ Failed to refresh token for user ${githubUserId}:`, error.message);
          // Token refresh failed - user needs to re-authenticate
          return null;
        }
      } else {
        // No refresh token and access token expired
        console.log(`⚠️ Token expired for user ${githubUserId} and no refresh token available`);
        return null;
      }
    }
  }
  
  // Token is still valid
  return tokenData.token;
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
    const status = response.status;
    if (status === 401) {
      throw new Error('Token expired or invalid');
    }
    throw new Error('Failed to get user info');
  }
  
  return response.json();
}

/**
 * Get user's repositories with automatic token refresh
 */
async function getUserRepos(githubUserId) {
  const accessToken = await getValidAccessToken(githubUserId);
  
  if (!accessToken) {
    throw new Error('No valid access token available');
  }
  
  const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitLogs-Bot'
    }
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Token expired');
    }
    throw new Error('Failed to get repositories');
  }
  
  return response.json();
}

/**
 * Get user's repositories using a provided token (for initial auth)
 */
async function getUserReposWithToken(accessToken) {
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
async function createWebhook(githubUserId, repoFullName, webhookUrl, webhookSecret) {
  const accessToken = await getValidAccessToken(githubUserId);
  
  if (!accessToken) {
    throw new Error('No valid access token available');
  }
  
  // First check if webhook already exists
  const existingHooks = await getWebhooksWithToken(accessToken, repoFullName);
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
 * Get webhooks for a repository using token
 */
async function getWebhooksWithToken(accessToken, repoFullName) {
  const response = await fetch(`https://api.github.com/repos/${repoFullName}/hooks`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitLogs-Bot'
    }
  });
  
  if (!response.ok) {
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
async function deleteWebhook(githubUserId, repoFullName, webhookUrl) {
  const accessToken = await getValidAccessToken(githubUserId);
  
  if (!accessToken) {
    throw new Error('No valid access token available');
  }
  
  const hooks = await getWebhooksWithToken(accessToken, repoFullName);
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
  
  return cookies.github_user_id || null;
}

module.exports = {
  generateSecureToken,
  getAuthUrl,
  getCallbackUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  getGitHubUser,
  getUserRepos,
  getUserReposWithToken,
  createWebhook,
  deleteWebhook,
  getWebhooksWithToken,
  getSessionFromCookie
};
