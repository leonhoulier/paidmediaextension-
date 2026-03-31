import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Upload source maps to Sentry in production builds
    mode === 'production' && process.env.SENTRY_AUTH_TOKEN
      ? sentryVitePlugin({
          org: process.env.SENTRY_ORG ?? 'media-buying-governance',
          project: process.env.SENTRY_PROJECT ?? 'admin-portal',
          authToken: process.env.SENTRY_AUTH_TOKEN,
          sourcemaps: {
            filesToDeleteAfterUpload: ['**/*.js.map'],
          },
        })
      : null,
  ].filter(Boolean),
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}));
