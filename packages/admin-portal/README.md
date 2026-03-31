# @media-buying-governance/admin-portal

React admin portal for the Media Buying Governance Platform. Provides a comprehensive UI for managing governance rules, naming conventions, ad accounts, teams, and monitoring compliance across the organization.

## Technology Stack

- **React 18** + TypeScript (strict mode)
- **Vite** for bundling and dev server
- **TailwindCSS** + shadcn/ui for styling and components
- **TanStack Query** (React Query) for data fetching and caching
- **React Router DOM** for client-side routing
- **React Hook Form** + Zod for form management and validation
- **Firebase Auth** for authentication (Google sign-in)
- **Recharts** for charts and data visualization
- **@dnd-kit** for drag-and-drop functionality
- **Sonner** for toast notifications
- **Lucide React** for icons

## Prerequisites

- Node.js 20+
- pnpm 8+
- Backend API running at http://localhost:3000 (see `/packages/backend/`)

## Getting Started

### 1. Install Dependencies

From the repository root:

```bash
pnpm install
```

### 2. Build Shared Types

```bash
cd packages/shared
pnpm build
```

### 3. Configure Environment

```bash
cd packages/admin-portal
cp .env.example .env
# Edit .env with your Firebase credentials
```

### 4. Start Development Server

```bash
pnpm dev
```

The app runs at http://localhost:5173. API requests are proxied to http://localhost:3000.

## Environment Variables

| Variable | Description |
|:---------|:------------|
| `VITE_API_BASE_URL` | Backend API base URL (default: `http://localhost:3000/api/v1`) |
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |

## Project Structure

```
src/
├── main.tsx                          # Application entry point
├── App.tsx                           # Root component with routing
├── index.css                         # Global styles + Tailwind config
├── vite-env.d.ts                     # Vite environment type declarations
├── components/
│   ├── ErrorBoundary.tsx             # Error boundary for crash recovery
│   ├── Layout.tsx                    # App layout with sidebar navigation
│   ├── ProtectedRoute.tsx            # Auth-protected route wrapper
│   └── ui/                           # shadcn/ui components
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── checkbox.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── radio-group.tsx
│       ├── select.tsx
│       ├── separator.tsx
│       ├── tabs.tsx
│       └── textarea.tsx
├── contexts/
│   └── AuthContext.tsx                # Firebase Auth context provider
├── hooks/
│   └── useApi.ts                     # TanStack Query hooks for all API endpoints
├── lib/
│   ├── api.ts                        # Axios instance with auth interceptors
│   ├── firebase.ts                   # Firebase app initialization
│   ├── queryClient.ts                # TanStack Query client configuration
│   ├── schemas.ts                    # Zod validation schemas
│   └── utils.ts                      # Utility functions (cn for class merging)
└── pages/
    ├── Accounts.tsx                  # Ad accounts list page
    ├── ComplianceDashboard.tsx       # Compliance dashboard with charts
    ├── Dashboard.tsx                 # Main dashboard with KPIs
    ├── LoginPage.tsx                 # Login page with Google sign-in
    ├── NamingConventionBuilder.tsx   # Drag-and-drop naming template builder
    ├── NamingTemplates.tsx           # Naming templates list page
    ├── RuleBuilder.tsx               # Multi-step rule creation wizard
    ├── Rules.tsx                     # Rules list page
    └── Teams.tsx                     # Teams list page
```

## Routes

| Path | Component | Description |
|:-----|:----------|:------------|
| `/login` | LoginPage | Public login page with Google sign-in |
| `/` | Redirect | Redirects to /dashboard |
| `/dashboard` | Dashboard | Overview with KPIs and quick actions |
| `/accounts` | Accounts | Ad accounts management |
| `/teams` | Teams | Teams management |
| `/rules` | Rules | Rules list with edit/delete |
| `/rules/new` | RuleBuilder | Create new rule (5-step wizard) |
| `/rules/:id/edit` | RuleBuilder | Edit existing rule |
| `/naming-templates` | NamingTemplates | Naming templates list |
| `/naming-templates/new` | NamingConventionBuilder | Create naming template |
| `/compliance` | ComplianceDashboard | Compliance metrics and events |

## Features

### Rule Builder (5-step wizard)
1. **Scope Selection** - Choose accounts, teams, and buyers
2. **Platform & Entity Level** - Select Meta, Google Ads, or both; campaign/ad set/ad
3. **Rule Type & Condition** - Configure rule-specific parameters (naming, budget, targeting, brand safety, custom)
4. **Enforcement Mode** - Warning, blocking, comment required, or second approver
5. **Preview & Save** - JSON preview and visual banner mockup

### Naming Convention Builder
- Drag-and-drop segment reordering
- Segment types: enum, free text, date, auto-generated
- Live preview with color-coded validation badges
- Per-segment configuration (allowed values, patterns, formats)

### Compliance Dashboard
- Circular progress score (overall compliance)
- KPI cards (campaigns created, violations, blocked creations)
- Tabbed breakdowns (by team, market, account, rule category)
- Time-series compliance trend chart
- Recent compliance events table with pagination
- Collapsible guidelines sidebar with pass/fail status

## Scripts

```bash
pnpm dev          # Start development server (port 5173)
pnpm build        # Production build to dist/
pnpm preview      # Preview production build
pnpm typecheck    # TypeScript type checking
pnpm lint         # ESLint
```

## Building for Production

```bash
pnpm build
```

Output is in `dist/`. Deploy to Cloud Storage + CDN:

```bash
gsutil -m rsync -r -d dist/ gs://mbg-admin-portal/
```

## API Integration

All API calls go through the Axios client in `src/lib/api.ts`:
- Automatically attaches Firebase ID token to every request
- Handles 401 responses by redirecting to login
- Shows toast notifications for errors (403, 404, 500, network errors)
- Timeout set to 30 seconds

TanStack Query hooks in `src/hooks/useApi.ts` provide:
- `useAccounts()`, `useCreateAccount()`, `useUpdateAccount()`, `useDeleteAccount()`
- `useTeams()`, `useCreateTeam()`, `useUpdateTeam()`, `useDeleteTeam()`
- `useUsers(role?)`
- `useRules()`, `useRuleById(id)`, `useCreateRule()`, `useUpdateRule()`, `useDeleteRule()`
- `useNamingTemplates()`, `useNamingTemplateById(id)`, `useCreateNamingTemplate()`, `useUpdateNamingTemplate()`, `useDeleteNamingTemplate()`
- `useComplianceDashboard(dateRange?)`, `useComplianceEvents(params?)`
