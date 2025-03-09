import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

const AuthForm = lazy(() => import('./components/AuthForm').then(m => ({ default: m.AuthForm })));
const AuthCallback = lazy(() => import('./components/AuthCallback').then(m => ({ default: m.AuthCallback })));
const ChatInterface = lazy(() => import('./components/ChatInterface').then(m => ({ default: m.ChatInterface })));

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }
  
  return user ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  const { user } = useAuthStore();

  return (
    <Router>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* Handle both /login and / for authentication */}
          <Route 
            path="/login" 
            element={!user ? <AuthForm /> : <Navigate to="/dashboard" />} 
          />
          <Route 
            path="/" 
            element={!user ? <AuthForm /> : <Navigate to="/dashboard" />} 
          />
          <Route 
            path="/auth/callback" 
            element={<AuthCallback />} 
          />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <div className="min-h-screen bg-gray-100">
                  <div className="max-w-3xl mx-auto px-4 py-6">
                    <h1 className="text-2xl font-bold mb-6">Welcome to AI Study Buddy</h1>
                    <div className="h-[calc(100vh-8rem)]">
                      <ChatInterface />
                    </div>
                  </div>
                </div>
              </PrivateRoute>
            }
          />
          {/* Add a catch-all route that redirects to appropriate page */}
          <Route 
            path="*" 
            element={<Navigate to={user ? "/dashboard" : "/login"} />} 
          />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;