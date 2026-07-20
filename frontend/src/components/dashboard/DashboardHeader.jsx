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
          className="dashboard-icon-button dashboard-theme-toggle"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {isDark ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
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
