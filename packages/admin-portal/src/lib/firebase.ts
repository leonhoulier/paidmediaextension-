import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';

/**
 * Whether we're running in local dev mode with fake Firebase credentials.
 * When true, the AuthContext will bypass Firebase and use a mock user.
 *
 * Detection logic:
 *   1. Explicit flag: VITE_USE_MOCK_AUTH=true
 *   2. Fake API key: VITE_FIREBASE_API_KEY starts with 'fake-'
 *   3. Missing API key entirely
 *
 * In production, set real Firebase credentials in the environment:
 *   VITE_FIREBASE_API_KEY=AIza...
 *   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
 *   VITE_FIREBASE_PROJECT_ID=your-project
 */
export const isLocalDev: boolean =
  import.meta.env.VITE_USE_MOCK_AUTH === 'true' ||
  !import.meta.env.VITE_FIREBASE_API_KEY ||
  (typeof import.meta.env.VITE_FIREBASE_API_KEY === 'string' &&
    import.meta.env.VITE_FIREBASE_API_KEY.startsWith('fake-'));

/**
 * Firebase configuration from environment variables.
 * In local dev, uses placeholder values (Firebase SDK is initialized but never called).
 * In production, these must be real Firebase project credentials.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'fake-key-for-local-dev',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'local-dev.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'local-dev',
};

/**
 * Firebase app instance.
 * Initialized in all environments; only used for real auth in production.
 */
export const firebaseApp: FirebaseApp = initializeApp(firebaseConfig);

/**
 * Firebase Auth instance.
 * In local dev with an emulator URL, connects to the Auth Emulator.
 * In production, connects to the live Firebase Auth service.
 */
export const firebaseAuth: Auth = getAuth(firebaseApp);

// Connect to Firebase Auth Emulator if URL is provided
const emulatorUrl = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL;
if (emulatorUrl && typeof emulatorUrl === 'string') {
  connectAuthEmulator(firebaseAuth, emulatorUrl, { disableWarnings: true });
}

if (isLocalDev) {
  console.info(
    '[firebase] Local dev mode detected. Firebase Auth is bypassed; mock user will be used.'
  );
} else {
  console.info(
    '[firebase] Production mode. Firebase Auth is active with project:',
    firebaseConfig.projectId
  );
}
