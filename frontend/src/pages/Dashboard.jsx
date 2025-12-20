import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import Admin from './Admin';
import UserDashboard from './UserDashboard';
import { auth, githubProvider, GithubAuthProvider } from '../firebase';
import { registerGithubToken } from '../utils/api';

export default function Dashboard() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [mode, setMode] = useState('user');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthLoading(true);
      setAuthUser(user || null);
      setAuthError('');

      if (user) {
        try {
          const tokenResult = await user.getIdTokenResult();
          const adminClaim = Boolean(tokenResult?.claims?.admin);
          setIsAdmin(adminClaim);
          if (!adminClaim) {
            setMode('user');
          }
        } catch (error) {
          console.error('Failed to load auth claims:', error);
          setAuthError('Unable to load permissions. Try signing in again.');
          setIsAdmin(false);
          setMode('user');
        }
      } else {
        setIsAdmin(false);
        setMode('user');
      }

      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setAuthError('');
    try {
      const result = await signInWithPopup(auth, githubProvider);
      // Get GitHub access token from the credential
      const credential = GithubAuthProvider.credentialFromResult(result);
      const githubToken = credential?.accessToken;
      
      if (githubToken) {
        // Send token to backend to store for repo access
        try {
          await registerGithubToken(githubToken);
        } catch (e) {
          console.warn('Failed to register GitHub token with backend:', e);
        }
      }
    } catch (error) {
      console.error('GitHub sign-in failed:', error);
      setAuthError('Sign-in failed. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Firebase sign-out failed:', error);
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
          <div style={{ fontSize: 64, marginBottom: 16 }}>🐙</div>
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
        <div className="card mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Dashboard</h2>
            <p className="text-muted">{authUser.displayName || authUser.email || authUser.uid}</p>
          </div>
          <div className="quick-actions">
            {isAdmin && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setMode(mode === 'admin' ? 'user' : 'admin')}
              >
                Switch to {mode === 'admin' ? 'User' : 'Admin'} Mode
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={handleLogout}>Sign out</button>
          </div>
        </div>

        {authError && (
          <div className="alert alert-error">❌ {authError}</div>
        )}
      </div>

      {mode === 'admin' && isAdmin ? <Admin /> : <UserDashboard />}
    </>
  );
}
