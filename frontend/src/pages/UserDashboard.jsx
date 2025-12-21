import { useEffect, useState } from 'react';
import { HiRefresh, HiViewList, HiSortAscending } from 'react-icons/hi';
import { PiGithubLogoBold } from 'react-icons/pi';
import { getMyRepos, setMyRepoOgPost, getHealth, getBackendUrl, enableRepo, disableRepo, getCurrentUser } from '../utils/api';
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
  const [repoPage, setRepoPage] = useState(1);
  const [reposPerPage, setReposPerPage] = useState(4);
  const [sortBy, setSortBy] = useState('recent');

  useEffect(() => {
    loadUserAndRepos();
  }, []);

  const handleGitHubLogin = () => {
    // Redirect to backend OAuth endpoint - it handles everything
    window.location.href = `${getBackendUrl()}/auth/github`;
  };


  const loadUserAndRepos = async () => {
    setLoading(true);
    try {
      // Try to get current user (will fail if not authenticated)
      const userData = await getCurrentUser();
      
      if (userData?.user) {
        setUser(userData.user);
        setXConnected(Boolean(userData.xConnected));
        
        // Load repos
        const [reposData, healthData] = await Promise.all([
          getMyRepos().catch(() => ({ repos: [] })),
          getHealth().catch(() => null)
        ]);
        
        setRepos(reposData.repos || []);
        setHealth(healthData);
        setRepoPage(1);
      }
    } catch (e) {
      // Not authenticated - that's fine, show login screen
      console.log('Not authenticated');
      setUser(null);
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
      loadUserAndRepos();
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

  const sortedRepos = [...repos].sort((a, b) => {
    if (sortBy === 'stars') {
      return (b.stargazers_count || 0) - (a.stargazers_count || 0);
    }
    if (sortBy === 'name') {
      return (a.full_name || '').localeCompare(b.full_name || '');
    }
    const aDate = new Date(a.pushed_at || a.updated_at || 0).getTime();
    const bDate = new Date(b.pushed_at || b.updated_at || 0).getTime();
    return bDate - aDate;
  });

  const totalRepoPages = Math.max(1, Math.ceil(sortedRepos.length / reposPerPage));
  const currentRepoPage = Math.min(repoPage, totalRepoPages);
  const pagedRepos = sortedRepos.slice(
    (currentRepoPage - 1) * reposPerPage,
    currentRepoPage * reposPerPage
  );

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
            <button className="btn btn-x btn-x-connected" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '6px' }}>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Connected to X
            </button>
          ) : (
            <a
              href={`${getBackendUrl()}/auth/x`}
              className="btn btn-x"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '6px' }}>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Connect X Account
            </a>
          )}
          <button
            className="btn btn-linkedin btn-linkedin-coming-soon"
            disabled
            title="Coming soon"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '6px' }}>
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            Connect to LinkedIn
          </button>
          <button className="btn btn-refresh" onClick={loadUserAndRepos} style={{ marginLeft: 'auto' }}>
            <HiRefresh size={18} />
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <PiGithubLogoBold size={18} style={{ marginRight: '8px' }} />
            Your Repositories
          </h2>
          <div className="repo-controls">
            <label className="repo-control">
              <HiViewList size={16} className="repo-control-icon" />
              <span className="repo-control-label">Rows</span>
              <select
                className="repo-control-select"
                value={reposPerPage}
                onChange={(event) => {
                  setReposPerPage(Number(event.target.value));
                  setRepoPage(1);
                }}
              >
                <option value={4}>4</option>
                <option value={6}>6</option>
                <option value={8}>8</option>
              </select>
            </label>
            <label className="repo-control">
              <HiSortAscending size={16} className="repo-control-icon" />
              <span className="repo-control-label">Sort</span>
              <select
                className="repo-control-select"
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value);
                  setRepoPage(1);
                }}
              >
                <option value="recent">Most recent</option>
                <option value="stars">Most starred</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </div>
        </div>

        {repos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <p>No repositories found. Make sure you have granted access to your repos.</p>
          </div>
        ) : (
          <div>
            {pagedRepos.map(repo => (
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
        {repos.length > reposPerPage && (
          <div className="repo-pagination">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setRepoPage(Math.max(1, currentRepoPage - 1))}
              disabled={currentRepoPage === 1}
            >
              Prev
            </button>
            <span className="repo-pagination-info">
              Page {currentRepoPage} of {totalRepoPages}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setRepoPage(Math.min(totalRepoPages, currentRepoPage + 1))}
              disabled={currentRepoPage === totalRepoPages}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
