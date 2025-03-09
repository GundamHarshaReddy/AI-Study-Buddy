import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const setUser = useAuthStore(state => state.setUser);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        if (session?.user) {
          setUser(session.user);
          navigate('/dashboard');
        } else {
          throw new Error('No session found');
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    handleAuthCallback();
  }, [navigate, setUser]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="flex items-center justify-center space-x-2 text-red-600">
              <XCircle className="h-6 w-6" />
              <h2 className="text-lg font-medium">Authentication Failed</h2>
            </div>
            <p className="mt-2 text-center text-sm text-gray-600">{error}</p>
            <p className="mt-2 text-center text-sm text-gray-600">Redirecting to login...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="flex items-center justify-center space-x-2 text-green-600">
            <CheckCircle2 className="h-6 w-6" />
            <h2 className="text-lg font-medium">Authentication Successful</h2>
          </div>
          <p className="mt-2 text-center text-sm text-gray-600">Redirecting to dashboard...</p>
        </div>
      </div>
    </div>
  );
}

export { AuthCallback };