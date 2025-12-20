import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, githubProvider } from '../firebase';
import { getMyRepos, setMyRepoOgPost, getHealth, getBackendUrl, enableRepo, disableRepo, registerGithubToken, getCurrentUser } from '../utils/api';
import logo from '../../gitlogs.png';

export default function UserDashboard() {
  const [user, setUser] = useState(null);
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState(null);
  const [xConnected, setXConnected] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [ogTweetId, setOgTweetId] = useState('');
  const [result, setResult] = useState({ type: '', message: '' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        loadReposAndHealth();
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleGitHubLogin = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, githubProvider);
      // Get the GitHub access token from the credential
      const credential = result._tokenResponse;
      if (credential?.oauthAccessToken) {
        // Register the GitHub token with our backend
        await registerGithubToken(credential.oauthAccessToken);
      }
    } catch (error) {
      console.error('GitHub login error:', error);
      setResult({ type: 'error', message: error.message || 'Failed to login with GitHub' });
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setRepos([]);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const loadReposAndHealth = async () => {
    setLoading(true);
    try {
      const [reposData, healthData, userData] = await Promise.all([
        getMyRepos().catch(() => ({ repos: [] })),
        getHealth().catch(() => null),
        getCurrentUser().catch(() => null)
      ]);

      setRepos(reposData.repos || []);
      setHealth(healthData);
      setXConnected(Boolean(userData?.xConnected));
    } catch (e) {
      console.error('Failed to load data:', e);
    }
    setLoading(false);
  };

  const handleSetOgPost = async (repoFullName) => {
    if (!ogTweetId.trim()) {
      setResult({ type: 'error', message: 'Tweet ID is required' });
      return;
    }

    try {
      await setMyRepoOgPost(repoFullName, ogTweetId);
      setResult({ type: 'success', message: `OG post set for ${repoFullName}!` });
      setSelectedRepo(null);
      setOgTweetId('');
      loadReposAndHealth();
    } catch (e) {
      setResult({ type: 'error', message: e.message });
    }
  };

  const handleToggleRepo = async (repoFullName, currentlyEnabled) => {
    try {
      if (currentlyEnabled) {
        await disableRepo(repoFullName);
        setResult({ type: 'success', message: `Disabled auto-posting for ${repoFullName}` });
      } else {
        await enableRepo(repoFullName);
        setResult({ type: 'success', message: `Enabled auto-posting for ${repoFullName}` });
      }
      // Update local state immediately for better UX
      setRepos(repos.map(r => 
        r.full_name === repoFullName ? { ...r, enabled: !currentlyEnabled } : r
      ));
    } catch (e) {
      setResult({ type: 'error', message: e.message });
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="text-center" style={{ padding: '60px 20px' }}>
          <div className="loading loading-lg"></div>
          <p className="text-muted mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container">
        <div className="card login-card">
          <img src={logo} alt="GitLogs logo" className="logo-mark logo-mark-lg" />
          <h1>Connect your GitHub</h1>
          <p>Login with GitHub to manage your repositories and set OG posts for tweet quoting.</p>

          <button onClick={handleGitHubLogin} className="btn btn-github" style={{ width: '100%', marginBottom: 16 }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            Continue with GitHub
          </button>

          <p className="text-small text-muted">
            We'll request access to your public repositories to set up webhooks.
          </p>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">❤️ System Status</h2>
          </div>
          <div className="grid grid-3">
            <div className="stat-card">
              <div className={`stat-value ${health?.status === 'healthy' ? 'green' : 'red'}`}>
                {health?.status === 'healthy' ? '✓ OK' : '--'}
              </div>
              <div className="stat-label">Status</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{health?.queue?.pending ?? '--'}</div>
              <div className="stat-label">Queue</div>
            </div>
            <div className="stat-card">
              <div className="stat-value purple">{health?.version ?? '--'}</div>
              <div className="stat-label">Version</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1 className="section-title">📊 Dashboard</h1>

      <div className="card mb-4">
        <div className="flex gap-4" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="flex gap-4" style={{ alignItems: 'center' }}>
            <img src={user.photoURL} alt={user.displayName} style={{ width: 64, height: 64, borderRadius: '50%' }} />
            <div>
              <h2 style={{ marginBottom: 4 }}>{user.displayName}</h2>
              <p className="text-muted">{user.email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary btn-sm">Logout</button>
        </div>
      </div>

      {result.message && (
        <div className={`alert alert-${result.type === 'error' ? 'error' : 'success'}`}>
          {result.type === 'error' ? '❌' : '✅'} {result.message}
        </div>
      )}

      <div className="card mb-4">
        <div className="card-header">
          <h2 className="card-title">⚡ Quick Actions</h2>
        </div>
        <div className="quick-actions">
          {xConnected ? (
            <button className="btn btn-secondary" disabled>✅ Connected to X</button>
          ) : (
            <a
              href={`${getBackendUrl()}/auth/x`}
              className="btn btn-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              🔐 Connect X Account
            </a>
          )}
          <button className="btn btn-secondary" onClick={loadReposAndHealth}>🔄 Refresh</button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">📁 Your Repositories</h2>
        </div>

        {repos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <p>No repositories found. Make sure you have granted access to your repos.</p>
          </div>
        ) : (
          <div>
            {repos.map(repo => (
              <div key={repo.id || repo.full_name} className="repo-card" style={{ opacity: repo.enabled ? 1 : 0.7 }}>
                <div className="repo-card-header">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <a href={repo.html_url} target="_blank" rel="noopener noreferrer" className="repo-name">
                        {repo.full_name}
                      </a>
                      {repo.private && <span className="badge" style={{ fontSize: 10 }}>Private</span>}
                    </div>
                    <p className="text-small text-muted">{repo.description || 'No description'}</p>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {repo.og_post_id && (
                      <span className="badge badge-green" style={{ fontSize: 10 }}>OG Set</span>
                    )}
                    
                    {/* Toggle Switch */}
                    <label className="toggle-switch" title={repo.enabled ? 'Disable auto-posting' : 'Enable auto-posting'}>
                      <input
                        type="checkbox"
                        checked={repo.enabled}
                        onChange={() => handleToggleRepo(repo.full_name, repo.enabled)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                {repo.enabled && (
                  <>
                    {selectedRepo === repo.full_name ? (
                      <div className="mt-2">
                        <div className="form-group">
                          <label className="form-label">Tweet ID to Quote</label>
                          <input
                            type="text"
                            className="form-input"
                            value={ogTweetId}
                            onChange={(e) => setOgTweetId(e.target.value)}
                            placeholder="e.g., 1234567890123456789"
                          />
                          <p className="text-small text-muted mt-2">
                            Paste the tweet ID from the URL of the tweet you want all commits to quote.
                          </p>
                        </div>
                        <div className="quick-actions">
                          <button className="btn btn-primary btn-sm" onClick={() => handleSetOgPost(repo.full_name)}>
                            Save OG Post
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedRepo(null); setOgTweetId(''); }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="quick-actions mt-2">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setSelectedRepo(repo.full_name); setOgTweetId(repo.og_post_id || ''); }}
                        >
                          {repo.og_post_id ? 'Change OG Post' : 'Set OG Post'}
                        </button>
                        {repo.og_post_id && (
                          <a
                            href={`https://x.com/i/status/${repo.og_post_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-sm"
                          >
                            View Tweet
                          </a>
                        )}
                      </div>
                    )}
                  </>
                )}
                
                {!repo.enabled && (
                  <p className="text-small text-muted mt-2" style={{ fontStyle: 'italic' }}>
                    Auto-posting disabled. Toggle to enable.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">🔗 Webhook Setup</h2>
        </div>
        <p className="text-muted mb-4">
          Configure your GitHub repository webhook to start auto-tweeting commits.
        </p>

        <div className="form-group">
          <label className="form-label">Webhook URL</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="form-input"
              value={`${getBackendUrl()}/webhook/github`}
              readOnly
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                navigator.clipboard.writeText(`${getBackendUrl()}/webhook/github`);
                setResult({ type: 'success', message: 'Webhook URL copied!' });
              }}
            >
              Copy
            </button>
          </div>
        </div>

        <div className="mt-4">
          <h4 style={{ fontSize: 14, marginBottom: 12 }}>Setup Steps:</h4>
          <ol style={{ paddingLeft: 20, lineHeight: 2, color: 'var(--text-secondary)' }}>
            <li>Go to your GitHub repository → Settings → Webhooks</li>
            <li>Click "Add webhook"</li>
            <li>Paste the webhook URL above</li>
            <li>Set Content type to <code>application/json</code></li>
            <li>Select "Just the push event"</li>
            <li>Click "Add webhook"</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
