import { useEffect, useState } from 'react';
import {
  disconnectX,
  disableRepo,
  enableRepo,
  getBackendUrl,
  getMyDashboard,
  logout,
  setMyRepoOgPost,
} from '../utils/api';
import Customisation from '../components/Customisation';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import DashboardStats from '../components/dashboard/DashboardStats';
import RepositoryPanel from '../components/dashboard/RepositoryPanel';
import ConnectionsPanel from '../components/dashboard/ConnectionsPanel';
import RecentPostsPanel from '../components/dashboard/RecentPostsPanel';
import logo from '../../gitlogs.png';

function UnauthenticatedDashboardChrome({ theme, onToggleTheme, onLogin }) {
  const isDark = theme === 'dark';

  return (
    <header className="dashboard-shell-header">
      <div className="dashboard-brand">
        <img src={logo} alt="GitLogs logo" className="dashboard-logo" />
        <span className="dashboard-badge">dashboard</span>
      </div>
      <div className="dashboard-header-actions">
        <button
          type="button"
          className="dashboard-icon-button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {isDark ? 'Light' : 'Dark'}
        </button>
        <button type="button" className="dashboard-nav-button" onClick={onLogin}>
          Sign in
        </button>
      </div>
    </header>
  );
}

export default function UserDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [activeView, setActiveView] = useState('overview');
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getMyDashboard();
      setDashboard(data);
    } catch (error) {
      if (error.message.includes('Not authenticated') || error.message.includes('not_authenticated') || error.message.includes('Please sign in')) {
        setDashboard(null);
      } else {
        setLoadError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('gl-theme', next);
    setTheme(next);
  };

  const handleGitHubLogin = () => {
    window.location.href = `${getBackendUrl()}/auth/github`;
  };

  const runAction = async (operation, successMessage) => {
    setActionError('');
    setActionMessage('');
    try {
      await operation();
      setActionMessage(successMessage);
      await loadDashboard();
      return true;
    } catch (error) {
      setActionError(error.message);
      return false;
    }
  };

  const handleToggleRepo = (repoFullName, enabled) => runAction(
    () => (enabled ? disableRepo(repoFullName) : enableRepo(repoFullName)),
    enabled ? `Disabled ${repoFullName}` : `Enabled ${repoFullName}`
  );

  const handleSetOgPost = (repoFullName, tweetId) => runAction(
    async () => {
      if (!tweetId) {
        throw new Error('Paste a valid X/Twitter status URL or numeric tweet id.');
      }
      await setMyRepoOgPost(repoFullName, tweetId);
    },
    `Updated OG post for ${repoFullName}`
  );

  const handleDisconnectX = () => runAction(
    () => disconnectX(),
    'Disconnected X account'
  );

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-loading">Loading dashboard...</div>
      </div>
    );
  }

  if (!dashboard && !loadError) {
    return (
      <div className="dashboard-page">
        <UnauthenticatedDashboardChrome
          theme={theme}
          onToggleTheme={toggleTheme}
          onLogin={handleGitHubLogin}
        />
        <div className="container">
          <div className="card login-card">
            <img src={logo} alt="GitLogs logo" className="logo-mark logo-mark-lg" />
            <h1>Connect your GitHub</h1>
            <p>Login with GitHub to manage repositories, posting, and customisation.</p>
            <button onClick={handleGitHubLogin} className="btn btn-github" style={{ width: '100%', marginBottom: 16 }}>
              Continue with GitHub
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-error">
          <h1>Dashboard unavailable</h1>
          <p>{loadError}</p>
          <button type="button" onClick={loadDashboard}>Retry</button>
        </div>
      </div>
    );
  }

  const sectionErrors = Array.isArray(dashboard.errors) ? dashboard.errors : [];

  return (
    <div className="dashboard-page">
      <DashboardHeader
        user={dashboard.user}
        theme={theme}
        onToggleTheme={toggleTheme}
        onShowCustomisation={() => setActiveView('customisation')}
        onShowOverview={() => setActiveView('overview')}
        activeView={activeView}
        onLogout={handleLogout}
      />

      {actionError && <div className="dashboard-alert is-error">{actionError}</div>}
      {actionMessage && <div className="dashboard-alert is-success">{actionMessage}</div>}

      {activeView === 'customisation' ? (
        <main className="dashboard-content">
          <Customisation user={dashboard.user} xConnected={dashboard.connections.x.connected} />
        </main>
      ) : (
        <main className="dashboard-content">
          <DashboardStats stats={dashboard.stats} errors={sectionErrors} />
          <div className="dashboard-grid">
            <RepositoryPanel
              repositories={dashboard.repositories}
              onToggleRepo={handleToggleRepo}
              onSetOgPost={handleSetOgPost}
            />
            <aside className="dashboard-rail">
              <ConnectionsPanel
                connections={dashboard.connections}
                errors={sectionErrors}
                onDisconnectX={handleDisconnectX}
              />
              <RecentPostsPanel posts={dashboard.recentPosts} errors={sectionErrors} />
            </aside>
          </div>
        </main>
      )}
    </div>
  );
}
