// API utility functions

// Get backend URL - use production URL for production builds
// In development, use empty string to leverage Vite proxy
export function getBackendUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  // Production builds should use the actual backend URL
  if (import.meta.env.PROD) {
    return 'https://api-gitlogs.aayushman.dev';
  }
  // Development uses proxy (empty string)
  return '';
}

const API_BASE = getBackendUrl();

// Get admin API key from localStorage
export function getAdminApiKey() {
  return localStorage.getItem('adminApiKey') || '';
}

export function setAdminApiKey(key) {
  localStorage.setItem('adminApiKey', key);
}

// Generic API call with admin key
export async function adminApiCall(endpoint, options = {}) {
  const apiKey = getAdminApiKey();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });
  
  // Check if response is JSON before parsing
  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  
  let data;
  if (isJson) {
    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error(`Failed to parse JSON response: ${response.status} ${response.statusText}`);
    }
  } else {
    // If not JSON, read as text for error message
    const text = await response.text();
    throw new Error(`Server returned non-JSON response (${response.status} ${response.statusText}): ${text.substring(0, 100)}`);
  }
  
  if (!response.ok) {
    throw new Error(data.error || data.message || `HTTP ${response.status}: ${response.statusText}`);
  }
  
  return data;
}

// Public API call (no admin key needed)
export async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include' // Include cookies for session auth
  });
  
  // Check if response is JSON before parsing
  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  
  let data;
  if (isJson) {
    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error(`Failed to parse JSON response: ${response.status} ${response.statusText}`);
    }
  } else {
    // If not JSON, read as text for error message
    const text = await response.text();
    throw new Error(`Server returned non-JSON response (${response.status} ${response.statusText}): ${text.substring(0, 100)}`);
  }
  
  if (!response.ok) {
    throw new Error(data.error || data.message || `HTTP ${response.status}: ${response.statusText}`);
  }
  
  return data;
}

// Health check
export async function getHealth() {
  return apiCall('/api/health');
}

// Stats (admin)
export async function getStats() {
  return adminApiCall('/api/stats');
}

// OG Post management
export async function setOgPost(owner, repo, tweetId) {
  return adminApiCall(`/api/repos/${owner}/${repo}/og-post`, {
    method: 'POST',
    body: JSON.stringify({ tweetId })
  });
}

export async function getOgPost(owner, repo) {
  return adminApiCall(`/api/repos/${owner}/${repo}/og-post`);
}

// User management (admin)
export async function createUser(userData) {
  return adminApiCall('/api/users', {
    method: 'POST',
    body: JSON.stringify(userData)
  });
}

export async function getUser(userId) {
  return adminApiCall(`/api/users/${encodeURIComponent(userId)}`);
}

export async function addUserRepo(userId, repoFullName, webhookSecret) {
  return adminApiCall(`/api/users/${encodeURIComponent(userId)}/repos`, {
    method: 'POST',
    body: JSON.stringify({ repoFullName, webhookSecret })
  });
}

export async function getUserRepos(userId) {
  return adminApiCall(`/api/users/${encodeURIComponent(userId)}/repos`);
}

export async function getRepoContext(owner, repo) {
  return adminApiCall(`/api/repos/${owner}/${repo}/context`);
}

// User API (authenticated user data)
export async function getCurrentUser() {
  return apiCall('/api/me');
}

export async function getMyRepos() {
  return apiCall('/api/me/repos');
}

export async function setMyRepoOgPost(repoFullName, tweetId) {
  return apiCall('/api/me/repos/og-post', {
    method: 'POST',
    body: JSON.stringify({ repoFullName, tweetId })
  });
}

export async function enableRepo(repoFullName) {
  return apiCall('/api/me/repos/enable', {
    method: 'POST',
    body: JSON.stringify({ repoFullName })
  });
}

export async function disableRepo(repoFullName) {
  return apiCall('/api/me/repos/disable', {
    method: 'POST',
    body: JSON.stringify({ repoFullName })
  });
}

export async function logout() {
  return apiCall('/auth/logout', { method: 'POST' });
}

// Disconnect X account
export async function disconnectX() {
  return apiCall('/api/me/x/disconnect', { method: 'POST' });
}

// ============================================
// Prompt Template API
// ============================================

// Get user's templates
export async function getMyTemplates() {
  return apiCall('/api/me/templates');
}

// Save a custom template
export async function saveTemplate(templateId, templateName, templateContent) {
  return apiCall('/api/me/templates', {
    method: 'POST',
    body: JSON.stringify({ templateId, templateName, templateContent })
  });
}

// Set active template
export async function setActiveTemplate(templateId) {
  return apiCall('/api/me/templates/active', {
    method: 'POST',
    body: JSON.stringify({ templateId })
  });
}

// Delete a custom template
export async function deleteTemplate(templateId) {
  return apiCall(`/api/me/templates/${encodeURIComponent(templateId)}`, {
    method: 'DELETE'
  });
}