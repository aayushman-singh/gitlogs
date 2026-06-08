import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getCurrentUser, getBackendUrl } from './api';

/**
 * Custom hook to check user authentication status
 * Checks the /api/me endpoint to determine if user is logged in
 *
 * @returns {string} - 'loading' | 'authenticated' | 'unauthenticated'
 */
export function useAuth() {
  const [authState, setAuthState] = useState('loading');
  const location = useLocation();

  useEffect(() => {
    // The /demo route is keyless/offline — never call the backend there.
    if (location.pathname === '/demo') {
      setAuthState('unauthenticated');
      return;
    }

    const checkAuth = async () => {
      try {
        await getCurrentUser();
        setAuthState('authenticated');
      } catch (error) {
        console.error('Auth check failed:', error);
        setAuthState('unauthenticated');
      }
    };

    checkAuth();
  }, [location.pathname]);

  return authState;
}

/**
 * Helper function to get the GitHub OAuth URL
 * @returns {string} - GitHub OAuth URL
 */
export function getGitHubAuthUrl() {
  return `${getBackendUrl()}/auth/github`;
}

