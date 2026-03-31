import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Layout } from '@/components/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoginPage } from '@/pages/LoginPage';

/* Lazy-loaded pages for code splitting */
const Dashboard = lazy(() =>
  import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard }))
);
const Accounts = lazy(() =>
  import('@/pages/Accounts').then((m) => ({ default: m.Accounts }))
);
const Teams = lazy(() =>
  import('@/pages/Teams').then((m) => ({ default: m.Teams }))
);
const Organizations = lazy(() =>
  import('@/pages/Organizations').then((m) => ({ default: m.Organizations }))
);
const Users = lazy(() =>
  import('@/pages/Users').then((m) => ({ default: m.Users }))
);
const Rules = lazy(() =>
  import('@/pages/Rules').then((m) => ({ default: m.Rules }))
);
const RuleBuilder = lazy(() =>
  import('@/pages/RuleBuilder').then((m) => ({ default: m.RuleBuilder }))
);
const RuleSets = lazy(() =>
  import('@/pages/RuleSets').then((m) => ({ default: m.RuleSets }))
);
const NamingTemplates = lazy(() =>
  import('@/pages/NamingTemplates').then((m) => ({ default: m.NamingTemplates }))
);
const NamingConventionBuilder = lazy(() =>
  import('@/pages/NamingConventionBuilder').then((m) => ({
    default: m.NamingConventionBuilder,
  }))
);
const ComplianceDashboard = lazy(() =>
  import('@/pages/ComplianceDashboard').then((m) => ({
    default: m.ComplianceDashboard,
  }))
);
const ApprovalRequests = lazy(() =>
  import('@/pages/ApprovalRequests').then((m) => ({ default: m.ApprovalRequests }))
);
const ExtensionPairing = lazy(() =>
  import('@/pages/ExtensionPairing').then((m) => ({
    default: m.ExtensionPairing,
  }))
);
const WebhookSettings = lazy(() =>
  import('@/pages/WebhookSettings').then((m) => ({
    default: m.WebhookSettings,
  }))
);

/**
 * Full-screen loading spinner shown while lazy-loaded pages are being fetched.
 */
function PageLoader(): React.ReactElement {
  return (
    <div className="flex h-64 items-center justify-center" role="status">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="sr-only">Loading page...</span>
    </div>
  );
}

/**
 * Root application component with routing configuration.
 * Pages are lazy-loaded for optimal bundle splitting.
 */
export function App(): React.ReactElement {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes wrapped in layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route
              path="dashboard"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Dashboard />
                </Suspense>
              }
            />
            <Route
              path="accounts"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Accounts />
                </Suspense>
              }
            />
            <Route
              path="teams"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Teams />
                </Suspense>
              }
            />
            <Route
              path="organizations"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Organizations />
                </Suspense>
              }
            />
            <Route
              path="users"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Users />
                </Suspense>
              }
            />
            <Route
              path="rules"
              element={
                <Suspense fallback={<PageLoader />}>
                  <Rules />
                </Suspense>
              }
            />
            <Route
              path="rules/new"
              element={
                <Suspense fallback={<PageLoader />}>
                  <RuleBuilder />
                </Suspense>
              }
            />
            <Route
              path="rules/:id/edit"
              element={
                <Suspense fallback={<PageLoader />}>
                  <RuleBuilder />
                </Suspense>
              }
            />
            <Route
              path="rule-sets"
              element={
                <Suspense fallback={<PageLoader />}>
                  <RuleSets />
                </Suspense>
              }
            />
            <Route
              path="naming-templates"
              element={
                <Suspense fallback={<PageLoader />}>
                  <NamingTemplates />
                </Suspense>
              }
            />
            <Route
              path="naming-templates/new"
              element={
                <Suspense fallback={<PageLoader />}>
                  <NamingConventionBuilder />
                </Suspense>
              }
            />
            <Route
              path="compliance"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ComplianceDashboard />
                </Suspense>
              }
            />
            <Route
              path="approvals"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ApprovalRequests />
                </Suspense>
              }
            />
            <Route
              path="settings/extension"
              element={
                <Suspense fallback={<PageLoader />}>
                  <ExtensionPairing />
                </Suspense>
              }
            />
            <Route
              path="settings/webhooks"
              element={
                <Suspense fallback={<PageLoader />}>
                  <WebhookSettings />
                </Suspense>
              }
            />
          </Route>

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        <Toaster position="top-right" richColors closeButton />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
