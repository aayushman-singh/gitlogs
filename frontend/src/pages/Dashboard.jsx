import { useEffect, useState } from 'react';
import Admin from './Admin';
import UserDashboard from './UserDashboard';
import { getCurrentUser, getBackendUrl, logout } from '../utils/api';
import logo from '../../gitlogs.png';

export default function Dashboard() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [mode, setMode] = useState('user');

  useEffect(() => {
    checkAuth();
    
    // Check for auth callback messages in URL
    const params = new URLSearchParams(window.location.search);
    const authSuccess = params.get('auth');
    const error = params.get('error');
    
    if (authSuccess === 'success') {
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (error) {
      setAuthError(decodeURIComponent(error));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const checkAuth = async () => {
    setAuthLoading(true);
    try {
      const userData = await getCurrentUser();
      if (userData?.user) {
        setAuthUser(userData.user);
        // Check for admin (you can add admin flag to user data if needed)
        setIsAdmin(false); // TODO: implement admin check if needed
      } else {
        setAuthUser(null);
      }
    } catch (error) {
      // Not authenticated
      setAuthUser(null);
    }
    setAuthLoading(false);
  };

  const handleLogin = () => {
    // Redirect to backend OAuth endpoint
    window.location.href = `${getBackendUrl()}/auth/github`;
  };

  const handleLogout = async () => {
    try {
      await logout();
      setAuthUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (authLoading) {
    return (
      <div className="container">
        <div className="text-center" style={{ padding: '60px 20px' }}>
          <div className="loading loading-lg"></div>
          <p className="text-muted mt-4">Checking session...</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="container">
        <div className="card login-card">
          <img src={logo} alt="GitLogs logo" className="logo-mark logo-mark-lg" />
          <h1>Sign in to GitLogs</h1>
          <p>Connect your GitHub account to get started.</p>

          {authError && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              ❌ {authError}
            </div>
          )}

          <button className="btn btn-github" onClick={handleLogin} style={{ width: '100%', marginBottom: 16 }}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: 8 }}>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            Continue with GitHub
          </button>
          <p className="text-small text-muted">We'll request access to your repositories.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="container">
        {authError && (
          <div className="alert alert-error">❌ {authError}</div>
        )}
      </div>

      {mode === 'admin' && isAdmin ? <Admin /> : <UserDashboard />}
    </>
  );
}
