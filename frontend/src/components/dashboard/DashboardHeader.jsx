import logo from '../../../gitlogs.png';

export default function DashboardHeader({
  user,
  theme,
  onToggleTheme,
  onShowCustomisation,
  onShowOverview,
  activeView,
  onLogout,
}) {
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
          className={`dashboard-nav-button${activeView === 'overview' ? ' is-active' : ''}`}
          onClick={onShowOverview}
        >
          Overview
        </button>
        <button
          type="button"
          className={`dashboard-nav-button${activeView === 'customisation' ? ' is-active' : ''}`}
          onClick={onShowCustomisation}
        >
          Customisation
        </button>
        <button
          type="button"
          className="dashboard-icon-button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {isDark ? 'Light' : 'Dark'}
        </button>
        <div className="dashboard-user">
          <img src={user.avatar_url} alt={user.login} className="dashboard-user-avatar" />
          <div className="dashboard-user-meta">
            <span>{user.name || user.login}</span>
            <small>@{user.login}</small>
          </div>
        </div>
        <button type="button" className="dashboard-nav-button" onClick={onLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}
