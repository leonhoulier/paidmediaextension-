import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { queryClient } from '@/lib/queryClient';
import { App } from '@/App';
import { initSentry } from '@/instrumentation/sentry';
import { initPostHog } from '@/instrumentation/posthog';
import { initFeatureFlags } from '@/instrumentation/feature-flags';
import '@/index.css';

// Initialize production instrumentation before React renders
initSentry();
initPostHog();
initFeatureFlags();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found. Ensure there is a <div id="root"> in index.html.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
