import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Loader2, Monitor } from 'lucide-react';

/**
 * Login page - works in both local dev and production mode.
 *
 * Local dev: Clicking "Sign in with Google" immediately sets the mock user
 *            (no network call, no Firebase popup). A "Local Dev" badge is shown.
 *
 * Production: Clicking "Sign in with Google" opens the Firebase Auth popup
 *             for real Google SSO. Requires valid Firebase config env vars.
 */
export function LoginPage(): React.ReactElement {
  const { user, loading, error, isLocalDev, signInWithGoogle } = useAuth();
  const location = useLocation();
  const [signingIn, setSigningIn] = React.useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/dashboard';

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  if (user) {
    return <Navigate to={from} replace />;
  }

  const handleSignIn = async (): Promise<void> => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      // Error is handled by AuthContext
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">DLG Admin</CardTitle>
          <CardDescription>
            Sign in to access the admin portal and manage your media buying rules.
          </CardDescription>
          {isLocalDev && (
            <div className="mt-2 flex items-center justify-center gap-1">
              <Badge variant="secondary" className="gap-1">
                <Monitor className="h-3 w-3" />
                Local Development Mode
              </Badge>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}

          {isLocalDev && (
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Running with mock authentication. Click below to sign in as the
              local dev admin user (admin1@dlg.com).
            </div>
          )}

          <Button
            className="w-full gap-2"
            size="lg"
            onClick={handleSignIn}
            disabled={signingIn}
            aria-label="Sign in with Google"
          >
            {signingIn ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            {signingIn
              ? 'Signing in...'
              : isLocalDev
                ? 'Sign in (Mock User)'
                : 'Sign in with Google'}
          </Button>

          {!isLocalDev && (
            <p className="text-center text-xs text-muted-foreground">
              You will be redirected to Google for secure authentication.
              Only authorized organization members can access this portal.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
