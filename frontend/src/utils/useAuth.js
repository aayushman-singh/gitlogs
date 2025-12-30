import { useEffect, useState } from 'react';
import { getCurrentUser, getBackendUrl } from './api';

/**
 * Custom hook to check user authentication status
 * Checks the /api/me endpoint to determine if user is logged in
 * 
 * @returns {string} - 'loading' | 'authenticated' | 'unauthenticated'
 */
export function useAuth() {
  const [authState, setAuthState] = useState('loading');

  useEffect(() => {
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
  }, []);

  return authState;
}

/**
 * Helper function to get the GitHub OAuth URL
 * @returns {string} - GitHub OAuth URL
 */
export function getGitHubAuthUrl() {
  return `${getBackendUrl()}/auth/github`;
}

