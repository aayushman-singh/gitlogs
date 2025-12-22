import htm from 'https://unpkg.com/htm@3.1.1/dist/htm.module.js';

const html = htm.bind(React.createElement);
const { useEffect, useState, useCallback } = React;

const tabs = [
  { id: 'og-posts', label: '📌 OG Posts' },
  { id: 'users', label: '👥 Users' },
  { id: 'repos', label: '📁 Repositories' },
  { id: 'stats', label: '📊 Stats' }
];

const defaultOverview = {
  status: '--',
  queue: '--',
  processing: '--',
  rateLimit: '--'
};

function ResultMessage({ result }) {
  if (!result) return null;
  if (result.status === 'error') {
    return html`<div className="alert alert-error">❌ ${result.message}</div>`;
  }

  if (typeof result.data === 'object') {
    return html`
      <div>
        <div className="alert alert-success">✅ ${result.message || 'Success'}</div>
        <pre className="json-display">${JSON.stringify(result.data, null, 2)}</pre>
      </div>
    `;
  }

  return html`<div className="alert alert-success">✅ ${result.data}</div>`;
}

function ModeSwitcher({ mode, onChange }) {
  return html`
    <div className="card mb-4">
      <div className="card-header">
        <h2 className="card-title">🔐 Access Mode</h2>
      </div>
      <div className="form-row" style={{ alignItems: 'center' }}>
        <div className="form-group" style={{ flex: 1 }}>
          <p className="text-muted" style={{ marginBottom: '8px' }}>
            Choose how you're viewing the dashboard. Admin mode requires your admin API key.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              style=${mode === 'user' ? {} : { opacity: 0.8 }}
              onClick=${() => onChange('user')}
            >
              User mode
            </button>
            <button
              className="btn btn-primary"
              style=${mode === 'admin' ? {} : { opacity: 0.8 }}
              onClick=${() => onChange('admin')}
            >
              Admin mode
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function ApiKeyBar({ apiKey, onApiKeyChange, showKey, onToggleShow, onSave, notice }) {
  return html`
    <div className="card mb-4">
      <div className="card-header">
        <h2 className="card-title">🔑 Admin API Key</h2>
      </div>
      <div className="api-key-bar" style={{ padding: '12px 0 4px' }}>
        <input
          type=${showKey ? 'text' : 'password'}
          className="form-input"
          placeholder="Enter your ADMIN_API_KEY"
          value=${apiKey}
          onChange=${(e) => onApiKeyChange(e.target.value)}
        />
        <button className="btn btn-secondary btn-sm" onClick=${onToggleShow}>
          ${showKey ? 'Hide' : 'Show'}
        </button>
        <button className="btn btn-primary btn-sm" onClick=${onSave}>Save</button>
      </div>
      ${notice
        ? html`<div className="text-muted" style={{ marginTop: '6px' }}>✅ ${notice}</div>`
        : null}
    </div>
  `;
}

function OverviewCards({ overview }) {
  return html`
    <div className="grid grid-4 mb-4">
      <div className="card stat-card">
        <div className=${`stat-value ${overview.status === '✓ OK' ? 'green' : 'red'}`}>${overview.status}</div>
        <div className="stat-label">Status</div>
      </div>
      <div className="card stat-card">
        <div className="stat-value">${overview.queue}</div>
        <div className="stat-label">Queue Pending</div>
      </div>
      <div className="card stat-card">
        <div className="stat-value yellow">${overview.processing}</div>
        <div className="stat-label">Processing</div>
      </div>
      <div className="card stat-card">
        <div className="stat-value purple">${overview.rateLimit}</div>
        <div className="stat-label">Rate Limit Left</div>
      </div>
    </div>
  `;
}

function OgPostsTab({ apiCall, canUse }) {
  const [repo, setRepo] = useState('');
  const [tweetId, setTweetId] = useState('');
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const parseRepo = (value) => {
    const [owner, repoName] = value.split('/').map((v) => v?.trim());
    if (!owner || !repoName) {
      throw new Error('Invalid repository format. Use owner/repo');
    }
    return { owner, repoName };
  };

  const setOgPost = async () => {
    if (!canUse) {
      setResult({ status: 'error', message: 'Switch to Admin mode and add your API key.' });
      return;
    }

    if (!repo || !tweetId) {
      setResult({ status: 'error', message: 'Repository and Tweet ID are required.' });
      return;
    }

    try {
      setIsLoading(true);
      const { owner, repoName } = parseRepo(repo);
      const data = await apiCall(`/api/repos/${owner}/${repoName}/og-post`, {
        method: 'POST',
        body: JSON.stringify({ tweetId })
      });
      setResult({ status: 'success', data });
    } catch (error) {
      setResult({ status: 'error', message: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const getOgPost = async () => {
    if (!canUse) {
      setResult({ status: 'error', message: 'Switch to Admin mode and add your API key.' });
      return;
    }

    if (!repo) {
      setResult({ status: 'error', message: 'Repository is required.' });
      return;
    }

    try {
      setIsLoading(true);
      const { owner, repoName } = parseRepo(repo);
      const data = await apiCall(`/api/repos/${owner}/${repoName}/og-post`);
      setResult({ status: 'success', data });
    } catch (error) {
      setResult({ status: 'error', message: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  return html`
    <div className="tab-content active">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">📌 Set OG Post for Repository</h2>
        </div>
        <p className="text-muted mb-4">
          Set the original post that all commit tweets will quote for a repository.
        </p>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Repository (owner/repo)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., octocat/hello-world"
              value=${repo}
              onChange=${(e) => setRepo(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Tweet ID</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., 1234567890123456789"
              value=${tweetId}
              onChange=${(e) => setTweetId(e.target.value)}
            />
          </div>
        </div>
        <div className="quick-actions">
          <button className="btn btn-primary" onClick=${setOgPost} disabled=${isLoading}>
            ${isLoading ? 'Saving...' : 'Launch post'}
          </button>
          <button className="btn btn-secondary" onClick=${getOgPost} disabled=${isLoading}>
            ${isLoading ? 'Loading...' : 'Get Current OG Post'}
          </button>
        </div>

        <div className="mt-4">
          <ResultMessage result=${result} />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">📋 How OG Posts Work</h2>
        </div>
        <ul style={{ paddingLeft: '20px', lineHeight: 2 }}>
          <li>Create a tweet manually on X that introduces your project</li>
          <li>Copy the tweet ID from the URL (the number at the end)</li>
          <li>Set it as the OG post for your repository above</li>
          <li>All future commit tweets will <strong>quote</strong> this OG post</li>
        </ul>
      </div>
    </div>
  `;
}

function UsersTab({ apiCall, canUse }) {
  const [userForm, setUserForm] = useState({
    userId: '',
    githubUsername: '',
    displayName: '',
    email: '',
    tier: 'free'
  });
  const [lookupId, setLookupId] = useState('');
  const [createResult, setCreateResult] = useState(null);
  const [lookupResult, setLookupResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const updateUserField = (field, value) =>
    setUserForm((prev) => ({
      ...prev,
      [field]: value
    }));

  const createUser = async () => {
    if (!canUse) {
      setCreateResult({ status: 'error', message: 'Switch to Admin mode and add your API key.' });
      return;
    }
    if (!userForm.userId) {
      setCreateResult({ status: 'error', message: 'User ID is required.' });
      return;
    }

    try {
      setLoading(true);
      const data = await apiCall('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          userId: userForm.userId,
          githubUsername: userForm.githubUsername || undefined,
          displayName: userForm.displayName || undefined,
          email: userForm.email || undefined,
          tier: userForm.tier
        })
      });
      setCreateResult({ status: 'success', data });
    } catch (error) {
      setCreateResult({ status: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const lookupUser = async () => {
    if (!canUse) {
      setLookupResult({ status: 'error', message: 'Switch to Admin mode and add your API key.' });
      return;
    }
    if (!lookupId) {
      setLookupResult({ status: 'error', message: 'User ID is required.' });
      return;
    }
    try {
      setLoading(true);
      const data = await apiCall(`/api/users/${encodeURIComponent(lookupId)}`);
      setLookupResult({ status: 'success', data });
    } catch (error) {
      setLookupResult({ status: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  return html`
    <div className="tab-content active">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">➕ Create/Update User</h2>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">User ID *</label>
            <input
              type="text"
              className="form-input"
              placeholder="Unique user identifier"
              value=${userForm.userId}
              onChange=${(e) => updateUserField('userId', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">GitHub Username</label>
            <input
              type="text"
              className="form-input"
              placeholder="GitHub username"
              value=${userForm.githubUsername}
              onChange=${(e) => updateUserField('githubUsername', e.target.value)}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="Display name"
              value=${userForm.displayName}
              onChange=${(e) => updateUserField('displayName', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="Email address"
              value=${userForm.email}
              onChange=${(e) => updateUserField('email', e.target.value)}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Tier</label>
          <select
            className="form-input"
            value=${userForm.tier}
            onChange=${(e) => updateUserField('tier', e.target.value)}
          >
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick=${createUser} disabled=${loading}>
          ${loading ? 'Saving...' : 'Create/Update User'}
        </button>

        <div className="mt-4">
          <ResultMessage result=${createResult} />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">🔍 Lookup User</h2>
        </div>

        <div className="form-group">
          <label className="form-label">User ID</label>
          <input
            type="text"
            className="form-input"
            placeholder="Enter user ID to lookup"
            value=${lookupId}
            onChange=${(e) => setLookupId(e.target.value)}
          />
        </div>
        <button className="btn btn-secondary" onClick=${lookupUser} disabled=${loading}>
          ${loading ? 'Loading...' : 'Lookup User'}
        </button>

        <div className="mt-4">
          <ResultMessage result=${lookupResult} />
        </div>
      </div>
    </div>
  `;
}

function ReposTab({ apiCall, canUse }) {
  const [repoForm, setRepoForm] = useState({
    userId: '',
    repoFullName: '',
    webhookSecret: ''
  });
  const [contextRepo, setContextRepo] = useState('');
  const [listUserId, setListUserId] = useState('');
  const [addResult, setAddResult] = useState(null);
  const [contextResult, setContextResult] = useState(null);
  const [listResult, setListResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const parseRepo = (value) => {
    const [owner, repoName] = value.split('/').map((v) => v?.trim());
    if (!owner || !repoName) {
      throw new Error('Invalid repository format. Use owner/repo');
    }
    return { owner, repoName };
  };

  const addRepo = async () => {
    if (!canUse) {
      setAddResult({ status: 'error', message: 'Switch to Admin mode and add your API key.' });
      return;
    }
    if (!repoForm.userId || !repoForm.repoFullName) {
      setAddResult({ status: 'error', message: 'User ID and Repository are required.' });
      return;
    }
    try {
      setLoading(true);
      const data = await apiCall(`/api/users/${encodeURIComponent(repoForm.userId)}/repos`, {
        method: 'POST',
        body: JSON.stringify({
          repoFullName: repoForm.repoFullName,
          webhookSecret: repoForm.webhookSecret || undefined
        })
      });
      setAddResult({ status: 'success', data });
    } catch (error) {
      setAddResult({ status: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const getRepoContext = async () => {
    if (!canUse) {
      setContextResult({ status: 'error', message: 'Switch to Admin mode and add your API key.' });
      return;
    }
    if (!contextRepo) {
      setContextResult({ status: 'error', message: 'Repository is required.' });
      return;
    }
    try {
      setLoading(true);
      const { owner, repoName } = parseRepo(contextRepo);
      const data = await apiCall(`/api/repos/${owner}/${repoName}/context`);
      setContextResult({ status: 'success', data });
    } catch (error) {
      setContextResult({ status: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const listUserRepos = async () => {
    if (!canUse) {
      setListResult({ status: 'error', message: 'Switch to Admin mode and add your API key.' });
      return;
    }
    if (!listUserId) {
      setListResult({ status: 'error', message: 'User ID is required.' });
      return;
    }
    try {
      setLoading(true);
      const data = await apiCall(`/api/users/${encodeURIComponent(listUserId)}/repos`);
      if (data.repos && data.repos.length > 0) {
        setListResult({
          status: 'success',
          data: data.repos
        });
      } else {
        setListResult({ status: 'success', data: { message: 'No repositories found for this user' } });
      }
    } catch (error) {
      setListResult({ status: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  return html`
    <div className="tab-content active">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">📁 Add Repository to User</h2>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">User ID *</label>
            <input
              type="text"
              className="form-input"
              placeholder="User ID"
              value=${repoForm.userId}
              onChange=${(e) => setRepoForm((prev) => ({ ...prev, userId: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Repository (owner/repo) *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., octocat/hello-world"
              value=${repoForm.repoFullName}
              onChange=${(e) => setRepoForm((prev) => ({ ...prev, repoFullName: e.target.value }))}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Webhook Secret (optional)</label>
          <input
            type="text"
            className="form-input"
            placeholder="Per-repo webhook secret"
            value=${repoForm.webhookSecret}
            onChange=${(e) => setRepoForm((prev) => ({ ...prev, webhookSecret: e.target.value }))}
          />
        </div>
        <button className="btn btn-primary" onClick=${addRepo} disabled=${loading}>
          ${loading ? 'Saving...' : 'Add Repository'}
        </button>

        <div className="mt-4">
          <ResultMessage result=${addResult} />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">🔍 Get Repository Context</h2>
        </div>

        <div className="form-group">
          <label className="form-label">Repository (owner/repo)</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g., octocat/hello-world"
            value=${contextRepo}
            onChange=${(e) => setContextRepo(e.target.value)}
          />
        </div>
        <button className="btn btn-secondary" onClick=${getRepoContext} disabled=${loading}>
          ${loading ? 'Loading...' : 'Get Context'}
        </button>

        <div className="mt-4">
          <ResultMessage result=${contextResult} />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">📋 List User Repositories</h2>
        </div>

        <div className="form-group">
          <label className="form-label">User ID</label>
          <input
            type="text"
            className="form-input"
            placeholder="Enter user ID"
            value=${listUserId}
            onChange=${(e) => setListUserId(e.target.value)}
          />
        </div>
        <button className="btn btn-secondary" onClick=${listUserRepos} disabled=${loading}>
          ${loading ? 'Loading...' : 'List Repositories'}
        </button>

        <div className="mt-4">
          ${Array.isArray(listResult?.data)
            ? html`
                <div className="alert alert-success">
                  Found ${listResult.data.length} repository${listResult.data.length === 1 ? '' : 'ies'}
                </div>
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr><th>Repository</th><th>Active</th><th>Created</th></tr>
                    </thead>
                    <tbody>
                      ${listResult.data.map(
                        (repo) => html`
                          <tr key=${repo.repo_full_name}>
                            <td><code>${repo.repo_full_name}</code></td>
                            <td>
                              ${repo.is_active
                                ? html`<span className="badge badge-green">Yes</span>`
                                : html`<span className="badge badge-red">No</span>`}
                            </td>
                            <td>${new Date(repo.created_at).toLocaleDateString()}</td>
                          </tr>
                        `
                      )}
                    </tbody>
                  </table>
                </div>
              `
            : html`<ResultMessage result=${listResult} />`}
        </div>
      </div>
    </div>
  `;
}

function StatsTab({ statsData, healthData, refreshStats, refreshHealth, canUse, statsLoading, healthLoading }) {
  return html`
    <div className="tab-content active">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">📊 System Statistics</h2>
          <button className="btn btn-secondary btn-sm" onClick=${refreshStats} disabled=${!canUse || statsLoading}>
            ${statsLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="json-display">
          ${!canUse
            ? 'Switch to Admin mode and provide your API key to view stats.'
            : statsData
            ? JSON.stringify(statsData, null, 2)
            : 'Loading...'}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">❤️ Health Check</h2>
          <button className="btn btn-secondary btn-sm" onClick=${refreshHealth} disabled=${!canUse || healthLoading}>
            ${healthLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="json-display">
          ${!canUse
            ? 'Switch to Admin mode and provide your API key to view health.'
            : healthData
            ? JSON.stringify(healthData, null, 2)
            : 'Loading...'}
        </div>
      </div>
    </div>
  `;
}

function AdminTabs({ activeTab, onTabChange }) {
  return html`
    <div className="tabs">
      ${tabs.map(
        (tab) => html`
          <div
            key=${tab.id}
            className=${`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick=${() => onTabChange(tab.id)}
          >
            ${tab.label}
          </div>
        `
      )}
    </div>
  `;
}

function UserModeCard({ onSwitch }) {
  return html`
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">👤 User Mode</h2>
      </div>
      <p className="text-muted">
        You're currently browsing in User mode. Admin tools stay hidden until you switch to Admin mode
        and provide an admin API key.
      </p>
      <button className="btn btn-primary" onClick=${onSwitch}>Switch to Admin</button>
    </div>
  `;
}

function AuthLockCard() {
  return html`
    <div className="container">
      <h1 className="section-title">🔒 Admin access locked</h1>
      <div className="card">
        <p className="text-muted" style={{ marginBottom: '12px' }}>
          Sign in from the main site to reach the admin dashboard. Your session token is required to continue.
        </p>
        <div className="quick-actions">
          <a className="btn btn-primary" href="/auth">Go to login</a>
          <a className="btn btn-secondary" href="/">Return home</a>
        </div>
      </div>
    </div>
  `;
}

function App() {
  const [mode, setMode] = useState('user');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [activeTab, setActiveTab] = useState('og-posts');
  const [overview, setOverview] = useState(defaultOverview);
  const [statsData, setStatsData] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [authToken, setAuthToken] = useState(null);

  const canUseAdmin = mode === 'admin' && Boolean(apiKey);

  useEffect(() => {
    const stored = localStorage.getItem('adminApiKey');
    if (stored) {
      setApiKey(stored);
    }
  }, []);

  useEffect(() => {
    const loadToken = () => {
      const token = localStorage.getItem('gitlogsAuthToken');
      setAuthToken(token || null);
    };
    loadToken();
    const handleStorage = (event) => {
      if (event.key === 'gitlogsAuthToken') {
        loadToken();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (mode !== 'admin') {
      setOverview(defaultOverview);
      setStatsData(null);
      setHealthData(null);
    }
  }, [mode]);

  const saveApiKey = () => {
    localStorage.setItem('adminApiKey', apiKey);
    setSaveNotice('API key saved locally.');
    setTimeout(() => setSaveNotice(''), 2500);
  };

  const apiCall = useCallback(
    async (endpoint, options = {}) => {
      if (mode !== 'admin') {
        throw new Error('Switch to Admin mode to use admin APIs.');
      }
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }

      const response = await fetch(endpoint, {
        ...options,
        headers
      });

      let data = {};
      try {
        data = await response.json();
      } catch (error) {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      return data;
    },
    [apiKey, mode]
  );

  const loadOverview = useCallback(async () => {
    if (!canUseAdmin) return;
    try {
      const data = await apiCall('/api/health');
      setHealthData(data);
      setOverview({
        status: data.status === 'healthy' ? '✓ OK' : '✗ Error',
        queue: data.queue?.pending ?? '--',
        processing: data.queue?.processing ?? '--',
        rateLimit: data.queue?.rateLimitRemaining ?? '--'
      });
    } catch (error) {
      setOverview({
        status: '✗ Error',
        queue: '--',
        processing: '--',
        rateLimit: '--'
      });
    }
  }, [apiCall, canUseAdmin]);

  useEffect(() => {
    if (!canUseAdmin) return;

    loadOverview();
    const interval = setInterval(loadOverview, 10000);
    return () => clearInterval(interval);
  }, [canUseAdmin, loadOverview]);

  const refreshStats = useCallback(async () => {
    if (!canUseAdmin) return;
    try {
      setStatsLoading(true);
      const data = await apiCall('/api/stats');
      setStatsData(data);
    } catch (error) {
      setStatsData({ error: error.message });
    } finally {
      setStatsLoading(false);
    }
  }, [apiCall, canUseAdmin]);

  const refreshHealth = useCallback(async () => {
    if (!canUseAdmin) return;
    try {
      setHealthLoading(true);
      const data = await apiCall('/api/health');
      setHealthData(data);
      setOverview({
        status: data.status === 'healthy' ? '✓ OK' : '✗ Error',
        queue: data.queue?.pending ?? '--',
        processing: data.queue?.processing ?? '--',
        rateLimit: data.queue?.rateLimitRemaining ?? '--'
      });
    } catch (error) {
      setHealthData({ error: error.message });
    } finally {
      setHealthLoading(false);
    }
  }, [apiCall, canUseAdmin]);

  useEffect(() => {
    if (canUseAdmin) {
      refreshHealth();
      refreshStats();
    }
  }, [canUseAdmin, refreshHealth, refreshStats]);

  return html`
    <div>
      <header className="header">
        <div className="header-content">
          <a href="/" className="logo">
            <span className="logo-icon">🐙</span>
            <span>GitLogs</span>
          </a>
          <nav className="nav">
            <a href="/" className="nav-link">Home</a>
            <a href="/admin.html" className="nav-link active">Admin</a>
            <a href="/dashboard.html" className="nav-link">Dashboard</a>
          </nav>
        </div>
      </header>

      <div className="container">
        <h1 className="section-title">⚙️ Admin Dashboard</h1>

        ${!authToken
          ? html`<${AuthLockCard} />`
          : html`
              <ModeSwitcher mode=${mode} onChange=${setMode} />

              <ApiKeyBar
                apiKey=${apiKey}
                onApiKeyChange=${setApiKey}
                showKey=${showKey}
                onToggleShow=${() => setShowKey((prev) => !prev)}
                onSave=${saveApiKey}
                notice=${saveNotice}
              />

              ${mode === 'admin'
                ? html`
                    <OverviewCards overview=${overview} />
                    <AdminTabs activeTab=${activeTab} onTabChange=${setActiveTab} />
                    <div style={{ marginTop: '12px' }}>
                      ${activeTab === 'og-posts'
                        ? html`<OgPostsTab apiCall=${apiCall} canUse=${canUseAdmin} />`
                        : null}
                      ${activeTab === 'users'
                        ? html`<UsersTab apiCall=${apiCall} canUse=${canUseAdmin} />`
                        : null}
                      ${activeTab === 'repos'
                        ? html`<ReposTab apiCall=${apiCall} canUse=${canUseAdmin} />`
                        : null}
                      ${activeTab === 'stats'
                        ? html`
                            <StatsTab
                              statsData=${statsData}
                              healthData=${healthData}
                              refreshStats=${refreshStats}
                              refreshHealth=${refreshHealth}
                              canUse=${canUseAdmin}
                              statsLoading=${statsLoading}
                              healthLoading=${healthLoading}
                            />
                          `
                        : null}
                    </div>
                  `
                : html`<UserModeCard onSwitch=${() => setMode('admin')} />`}
            `}
      </div>
    </div>
  `;
}

ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
