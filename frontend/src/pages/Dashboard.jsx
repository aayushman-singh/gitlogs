import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import Admin from './Admin';
import UserDashboard from './UserDashboard';
import { auth, googleProvider } from '../firebase';

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
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Firebase sign-in failed:', error);
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
          <div style={{ fontSize: 64, marginBottom: 16 }}>🔒</div>
          <h1>Sign in to GitLogs</h1>
          <p>Use your Firebase account to access the dashboard.</p>

          {authError && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              ❌ {authError}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleLogin} style={{ width: '100%', marginBottom: 16 }}>
            Continue with Google
          </button>
          <p className="text-small text-muted">Admins can switch between user and admin modes.</p>
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
