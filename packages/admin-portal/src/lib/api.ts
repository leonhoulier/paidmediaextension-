import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosError } from 'axios';
import { toast } from 'sonner';
import { firebaseAuth, isLocalDev } from '@/lib/firebase';

/**
 * Axios instance configured with base URL and auth interceptors
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/**
 * Request interceptor: attach auth token to every request.
 * In local dev mode, uses a static mock token since firebaseAuth.currentUser
 * is always null (the mock user only lives in React state, not Firebase).
 *
 * The backend expects local dev tokens to be base64-encoded JSON with { uid, email }.
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (isLocalDev) {
      // Backend expects base64({ uid, email }) for local dev
      // Use a real seeded user: admin1@dlg.com from the database seed
      const localDevPayload = JSON.stringify({
        uid: 'local-dev-user',
        email: 'admin1@dlg.com',
      });
      const localDevToken = btoa(localDevPayload);
      config.headers.Authorization = `Bearer ${localDevToken}`;
      return config;
    }
    const user = firebaseAuth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor: handle errors and show toasts.
 * In local dev mode, 401s are logged but do NOT trigger a hard redirect,
 * preventing the infinite reload loop when the backend isn't running.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        if (isLocalDev) {
          // In local dev, the backend may not be running or may not accept mock tokens.
          // Log the error but do NOT redirect — avoids infinite page reload loop.
          console.warn('[api] 401 in local dev mode — backend may not be running. Skipping redirect.');
        } else {
          // Production: clear auth state and redirect to login
          firebaseAuth.signOut().catch(() => {
            // Ignore sign-out errors during redirect
          });
          window.location.href = '/login';
        }
      } else if (error.response?.status === 403) {
        toast.error('You do not have permission to perform this action.');
      } else if (error.response?.status === 404) {
        toast.error('The requested resource was not found.');
      } else if (error.response && error.response.status >= 500) {
        toast.error('A server error occurred. Please try again later.');
      } else if (error.code === 'ECONNABORTED') {
        toast.error('Request timed out. Please check your connection.');
      } else if (!error.response) {
        if (isLocalDev) {
          console.warn('[api] Network error in local dev mode — backend likely not running.');
        } else {
          toast.error('Network error. Please check your connection.');
        }
      }
    }
    return Promise.reject(error);
  }
);
