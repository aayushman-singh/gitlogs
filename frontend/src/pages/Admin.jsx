import { useState, useEffect } from 'react';
import { 
  getAdminApiKey, setAdminApiKey, getStats, getHealth,
  setOgPost, getOgPost, createUser, getUser, addUserRepo, 
  getUserRepos, getRepoContext 
} from '../utils/api';

export default function Admin() {
  const [apiKey, setApiKeyState] = useState(getAdminApiKey());
  const [showKey, setShowKey] = useState(false);
  const [activeTab, setActiveTab] = useState('og-posts');
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [result, setResult] = useState({ type: '', message: '', data: null });
  
  // Form states
  const [ogRepo, setOgRepo] = useState('');
  const [ogTweetId, setOgTweetId] = useState('');
  
  const [userId, setUserId] = useState('');
  const [userGithub, setUserGithub] = useState('');
  const [userDisplay, setUserDisplay] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userTier, setUserTier] = useState('free');
  const [lookupUserId, setLookupUserId] = useState('');
  
  const [repoUserId, setRepoUserId] = useState('');
  const [repoFullName, setRepoFullName] = useState('');
  const [repoWebhookSecret, setRepoWebhookSecret] = useState('');
  const [contextRepo, setContextRepo] = useState('');
  const [listReposUserId, setListReposUserId] = useState('');
  
  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, []);
  
  const loadStats = async () => {
    try {
      const [s, h] = await Promise.all([
        getStats().catch(() => null),
        getHealth().catch(() => null)
      ]);
      setStats(s);
      setHealth(h);
    } catch (e) {}
  };
  
  const saveKey = () => {
    setAdminApiKey(apiKey);
    setResult({ type: 'success', message: 'API key saved!', data: null });
    setTimeout(() => setResult({ type: '', message: '', data: null }), 3000);
  };
  
  const showResult = (type, message, data = null) => {
    setResult({ type, message, data });
  };
  
  // OG Post handlers
  const handleSetOgPost = async () => {
    if (!ogRepo || !ogTweetId) {
      showResult('error', 'Repository and Tweet ID are required');
      return;
    }
    const [owner, repo] = ogRepo.split('/');
    if (!owner || !repo) {
      showResult('error', 'Invalid repository format. Use owner/repo');
      return;
    }
    try {
      const data = await setOgPost(owner, repo, ogTweetId);
      showResult('success', 'OG Post set successfully!', data);
    } catch (e) {
      showResult('error', e.message);
    }
  };
  
  const handleGetOgPost = async () => {
    if (!ogRepo) {
      showResult('error', 'Repository is required');
      return;
    }
    const [owner, repo] = ogRepo.split('/');
    if (!owner || !repo) {
      showResult('error', 'Invalid repository format. Use owner/repo');
      return;
    }
    try {
      const data = await getOgPost(owner, repo);
      showResult('success', data.tweetId ? 'OG Post found' : 'No OG post set', data);
    } catch (e) {
      showResult('error', e.message);
    }
  };
  
  // User handlers
  const handleCreateUser = async () => {
    if (!userId) {
      showResult('error', 'User ID is required');
      return;
    }
    try {
      const data = await createUser({
        userId,
        githubUsername: userGithub || undefined,
        displayName: userDisplay || undefined,
        email: userEmail || undefined,
        tier: userTier
      });
      showResult('success', 'User created/updated!', data);
    } catch (e) {
      showResult('error', e.message);
    }
  };
  
  const handleLookupUser = async () => {
    if (!lookupUserId) {
      showResult('error', 'User ID is required');
      return;
    }
    try {
      const data = await getUser(lookupUserId);
      showResult('success', 'User found', data);
    } catch (e) {
      showResult('error', e.message);
    }
  };
  
  // Repo handlers
  const handleAddRepo = async () => {
    if (!repoUserId || !repoFullName) {
      showResult('error', 'User ID and Repository are required');
      return;
    }
    try {
      const data = await addUserRepo(repoUserId, repoFullName, repoWebhookSecret || undefined);
      showResult('success', 'Repository added!', data);
    } catch (e) {
      showResult('error', e.message);
    }
  };
  
  const handleGetRepoContext = async () => {
    if (!contextRepo) {
      showResult('error', 'Repository is required');
      return;
    }
    const [owner, repo] = contextRepo.split('/');
    if (!owner || !repo) {
      showResult('error', 'Invalid repository format. Use owner/repo');
      return;
    }
    try {
      const data = await getRepoContext(owner, repo);
      showResult('success', 'Context found', data);
    } catch (e) {
      showResult('error', e.message);
    }
  };
  
  const handleListUserRepos = async () => {
    if (!listReposUserId) {
      showResult('error', 'User ID is required');
      return;
    }
    try {
      const data = await getUserRepos(listReposUserId);
      showResult('success', `Found ${data.repos?.length || 0} repositories`, data);
    } catch (e) {
      showResult('error', e.message);
    }
  };
  
  return (
    <div className="container">
      <h1 className="section-title">⚙️ Admin Dashboard</h1>
      
      {/* API Key Bar */}
      <div className="api-key-bar">
        <label>🔑 Admin API Key:</label>
        <input
          type={showKey ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKeyState(e.target.value)}
          placeholder="Enter your ADMIN_API_KEY"
        />
        <button className="btn btn-secondary btn-sm" onClick={() => setShowKey(!showKey)}>
          {showKey ? 'Hide' : 'Show'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={saveKey}>Save</button>
      </div>
      
      {/* Stats Overview */}
      <div className="grid grid-4 mb-4">
        <div className="card stat-card">
          <div className={`stat-value ${health?.status === 'healthy' ? 'green' : 'red'}`}>
            {health?.status === 'healthy' ? '✓ OK' : '✗ Error'}
          </div>
          <div className="stat-label">Status</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{health?.queue?.pending ?? '--'}</div>
          <div className="stat-label">Queue Pending</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value yellow">{health?.queue?.processing ?? '--'}</div>
          <div className="stat-label">Processing</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value purple">{health?.queue?.rateLimitRemaining ?? '--'}</div>
          <div className="stat-label">Rate Limit Left</div>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="tabs">
        {['og-posts', 'users', 'repos', 'stats'].map(tab => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab); setResult({ type: '', message: '', data: null }); }}
          >
            {tab === 'og-posts' && '📌 OG Posts'}
            {tab === 'users' && '👥 Users'}
            {tab === 'repos' && '📁 Repositories'}
            {tab === 'stats' && '📊 Stats'}
          </button>
        ))}
      </div>
      
      {/* Result Display */}
      {result.message && (
        <div className={`alert alert-${result.type === 'error' ? 'error' : 'success'}`}>
          {result.type === 'error' ? '❌' : '✅'} {result.message}
        </div>
      )}
      {result.data && (
        <pre className="json-display mb-4">{JSON.stringify(result.data, null, 2)}</pre>
      )}
      
      {/* OG Posts Tab */}
      {activeTab === 'og-posts' && (
        <>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">📌 Set OG Post for Repository</h2>
            </div>
            <p className="text-muted mb-4">Set the original post that all commit tweets will quote for a repository.</p>
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Repository (owner/repo)</label>
                <input
                  type="text"
                  className="form-input"
                  value={ogRepo}
                  onChange={(e) => setOgRepo(e.target.value)}
                  placeholder="e.g., octocat/hello-world"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Tweet ID</label>
                <input
                  type="text"
                  className="form-input"
                  value={ogTweetId}
                  onChange={(e) => setOgTweetId(e.target.value)}
                  placeholder="e.g., 1234567890123456789"
                />
              </div>
            </div>
            <div className="quick-actions">
              <button className="btn btn-primary" onClick={handleSetOgPost}>Set OG Post</button>
              <button className="btn btn-secondary" onClick={handleGetOgPost}>Get Current OG Post</button>
            </div>
          </div>
          
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">📋 How OG Posts Work</h2>
            </div>
            <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
              <li>Create a tweet manually on X that introduces your project</li>
              <li>Copy the tweet ID from the URL (the number at the end)</li>
              <li>Set it as the OG post for your repository above</li>
              <li>All future commit tweets will <strong>quote</strong> this OG post</li>
            </ul>
          </div>
        </>
      )}
      
      {/* Users Tab */}
      {activeTab === 'users' && (
        <>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">➕ Create/Update User</h2>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">User ID *</label>
                <input type="text" className="form-input" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Unique user identifier" />
              </div>
              <div className="form-group">
                <label className="form-label">GitHub Username</label>
                <input type="text" className="form-input" value={userGithub} onChange={(e) => setUserGithub(e.target.value)} placeholder="GitHub username" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input type="text" className="form-input" value={userDisplay} onChange={(e) => setUserDisplay(e.target.value)} placeholder="Display name" />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="Email address" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tier</label>
              <select className="form-select" value={userTier} onChange={(e) => setUserTier(e.target.value)}>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleCreateUser}>Create/Update User</button>
          </div>
          
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">🔍 Lookup User</h2>
            </div>
            
            <div className="form-group">
              <label className="form-label">User ID</label>
              <input type="text" className="form-input" value={lookupUserId} onChange={(e) => setLookupUserId(e.target.value)} placeholder="Enter user ID to lookup" />
            </div>
            <button className="btn btn-secondary" onClick={handleLookupUser}>Lookup User</button>
          </div>
        </>
      )}
      
      {/* Repos Tab */}
      {activeTab === 'repos' && (
        <>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">📁 Add Repository to User</h2>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">User ID *</label>
                <input type="text" className="form-input" value={repoUserId} onChange={(e) => setRepoUserId(e.target.value)} placeholder="User ID" />
              </div>
              <div className="form-group">
                <label className="form-label">Repository (owner/repo) *</label>
                <input type="text" className="form-input" value={repoFullName} onChange={(e) => setRepoFullName(e.target.value)} placeholder="e.g., octocat/hello-world" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Webhook Secret (optional)</label>
              <input type="text" className="form-input" value={repoWebhookSecret} onChange={(e) => setRepoWebhookSecret(e.target.value)} placeholder="Per-repo webhook secret" />
            </div>
            <button className="btn btn-primary" onClick={handleAddRepo}>Add Repository</button>
          </div>
          
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">🔍 Get Repository Context</h2>
            </div>
            
            <div className="form-group">
              <label className="form-label">Repository (owner/repo)</label>
              <input type="text" className="form-input" value={contextRepo} onChange={(e) => setContextRepo(e.target.value)} placeholder="e.g., octocat/hello-world" />
            </div>
            <button className="btn btn-secondary" onClick={handleGetRepoContext}>Get Context</button>
          </div>
          
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">📋 List User Repositories</h2>
            </div>
            
            <div className="form-group">
              <label className="form-label">User ID</label>
              <input type="text" className="form-input" value={listReposUserId} onChange={(e) => setListReposUserId(e.target.value)} placeholder="Enter user ID" />
            </div>
            <button className="btn btn-secondary" onClick={handleListUserRepos}>List Repositories</button>
          </div>
        </>
      )}
      
      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">📊 System Statistics</h2>
              <button className="btn btn-secondary btn-sm" onClick={loadStats}>Refresh</button>
            </div>
            <pre className="json-display">{stats ? JSON.stringify(stats, null, 2) : 'Loading...'}</pre>
          </div>
          
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">❤️ Health Check</h2>
            </div>
            <pre className="json-display">{health ? JSON.stringify(health, null, 2) : 'Loading...'}</pre>
          </div>
        </>
      )}
    </div>
  );
}
