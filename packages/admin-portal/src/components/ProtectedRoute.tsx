import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

/**
 * ProtectedRoute wraps a route that requires authentication.
 * Redirects to /login if the user is not signed in.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }): React.ReactElement {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        className="flex h-screen w-full items-center justify-center"
        role="status"
        aria-label="Loading authentication state"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="sr-only">Verifying authentication...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
