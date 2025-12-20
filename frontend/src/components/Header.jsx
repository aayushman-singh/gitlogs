import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, githubProvider, GithubAuthProvider } from '../firebase';
import { registerGithubToken } from '../utils/api';
import logo from '../../gitlogs.png';
import logoIcon from '../../gitlogs-icon-whitebg.png';

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);
  
  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, githubProvider);
      const credential = GithubAuthProvider.credentialFromResult(result);
      const githubToken = credential?.accessToken;
      
      if (githubToken) {
        try {
          await registerGithubToken(githubToken);
        } catch (e) {
          console.warn('Failed to register GitHub token:', e);
        }
      }
      navigate('/dashboard');
    } catch (error) {
      console.error('GitHub sign-in failed:', error);
    }
  };
  
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      navigate('/');
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };
  
  const isActive = (path) => location.pathname === path ? 'nav-link active' : 'nav-link';
  
  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo">
          <img src={logo} alt="GitLogs logo" className="logo-mark" />
          <img src={logoIcon} alt="GitLogs icon" className="logo-mark logo-mark-compact" />
        </Link>
        <nav className="nav">
          <Link to="/" className={isActive('/')}>Home</Link>
          <Link to="/dashboard" className={isActive('/dashboard')}>Dashboard</Link>
          
          {user ? (
            <div className="user-menu">
              <img src={user.photoURL} alt={user.displayName} className="user-avatar" />
              <span className="user-name">{user.displayName}</span>
              <button className="btn btn-secondary btn-sm" onClick={handleLogout}>Logout</button>
            </div>
          ) : (
            <button onClick={handleLogin} className="btn btn-github btn-sm">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              Login with GitHub
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
