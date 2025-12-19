import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  useEffect(() => {
    const error = searchParams.get('error');
    
    if (error) {
      console.error('Auth error:', error);
    }
    
    // Redirect to dashboard after a short delay
    setTimeout(() => {
      navigate('/dashboard');
    }, 1000);
  }, [navigate, searchParams]);
  
  return (
    <div className="container">
      <div className="text-center" style={{ padding: '60px 20px' }}>
        <div className="loading loading-lg"></div>
        <p className="text-muted mt-4">Completing authentication...</p>
      </div>
    </div>
  );
}
