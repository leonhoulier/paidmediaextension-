import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { firebaseAuth, isLocalDev } from '@/lib/firebase';
import { identifyUser as identifyPostHogUser, resetPostHog } from '@/instrumentation/posthog';
import { setSentryUser, clearSentryUser } from '@/instrumentation/sentry';

/**
 * Auth context value shape
 */
interface AuthContextValue {
  /** Current authenticated user, or null if not signed in */
  user: User | null;
  /** Whether auth state is still being determined */
  loading: boolean;
  /** Auth error message, if any */
  error: string | null;
  /** Whether we're in local dev mock-auth mode */
  isLocalDev: boolean;
  /** Sign in with Google popup */
  signInWithGoogle: () => Promise<void>;
  /** Sign out the current user */
  signOut: () => Promise<void>;
  /** Get the current ID token for API calls */
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const googleProvider = new GoogleAuthProvider();

/** Token refresh interval: 50 minutes (tokens expire at 60 min) */
const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000;

/**
 * Mock user object for local development.
 * Satisfies the parts of the Firebase User interface that the app actually uses.
 * Uses admin1@dlg.com which exists in the database seed.
 */
const MOCK_USER = {
  uid: 'local-dev-user',
  email: 'admin1@dlg.com',
  displayName: 'Alice Admin (Local Dev)',
  photoURL: null,
  emailVerified: true,
  getIdToken: async () => 'local-dev-token',
} as unknown as User;

/**
 * AuthProvider wraps the app and provides authentication state and methods.
 *
 * In local dev mode (fake Firebase credentials), it bypasses Firebase entirely
 * and immediately provides a mock user — no network calls, no white screen.
 */
export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<User | null>(isLocalDev ? MOCK_USER : null);
  const [loading, setLoading] = useState(!isLocalDev);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // In local dev mode, skip Firebase auth listener entirely
    if (isLocalDev) {
      console.info('[Auth] Running in local dev mode — using mock user, Firebase auth bypassed');
      return;
    }

    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (firebaseUser) => {
        setUser(firebaseUser);
        setLoading(false);
        setError(null);

        // Identify user in PostHog and Sentry after successful auth
        if (firebaseUser) {
          identifyPostHogUser(firebaseUser.uid, {
            email: firebaseUser.email ?? '',
            name: firebaseUser.displayName ?? '',
          });
          setSentryUser({
            id: firebaseUser.uid,
            email: firebaseUser.email ?? undefined,
            username: firebaseUser.displayName ?? undefined,
          });
        } else {
          resetPostHog();
          clearSentryUser();
        }
      },
      (authError) => {
        setError(authError.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  // Proactively refresh the ID token before it expires (skip in local dev)
  useEffect(() => {
    if (!user || isLocalDev) return;

    const interval = setInterval(async () => {
      try {
        await user.getIdToken(true);
      } catch {
        // Token refresh failed; user will be prompted to re-authenticate on next API call
      }
    }, TOKEN_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [user]);

  const signInWithGoogle = useCallback(async () => {
    if (isLocalDev) {
      setUser(MOCK_USER);
      return;
    }
    try {
      setError(null);
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign in with Google';
      setError(message);
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (isLocalDev) {
      setUser(null);
      return;
    }
    try {
      await firebaseSignOut(firebaseAuth);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign out';
      setError(message);
      throw err;
    }
  }, []);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (isLocalDev) return 'local-dev-token';
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      isLocalDev,
      signInWithGoogle,
      signOut,
      getIdToken,
    }),
    [user, loading, error, signInWithGoogle, signOut, getIdToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
