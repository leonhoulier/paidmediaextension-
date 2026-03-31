# Media Buying Governance Platform

A SaaS platform that prevents media buying errors by injecting real-time validation rules, naming convention enforcement, and compliance checks directly into ad platform UIs (Meta Ads Manager and Google Ads). The system consists of a cloud-based admin portal for configuring rules and a Chrome extension that renders those rules inline during campaign creation.

## Project Structure

This is a monorepo managed with **pnpm workspaces**:

```
media-buying-governance/
├── packages/
│   ├── shared/              # Shared TypeScript types and interfaces
│   ├── backend/             # NestJS API + Prisma ORM + PostgreSQL
│   ├── admin-portal/        # React 18 + Vite + TailwindCSS
│   └── extension/           # Chrome Manifest V3 extension
├── pnpm-workspace.yaml      # Workspace configuration
├── docker-compose.yml       # Local development stack
└── SPEC.md                  # Full product and technical specification
```

### Package Responsibilities

**`@media-buying-governance/shared`**
- TypeScript enums, interfaces, and types
- Shared by all packages
- Platform adapter interface
- API request/response types

**`@media-buying-governance/backend`**
- NestJS REST API
- Prisma ORM with PostgreSQL
- Firebase Auth (Google Cloud Identity Platform) JWT verification
- Rules CRUD, compliance event logging, approval workflows
- Pub/Sub publisher for rule updates
- Deploys to **Google Cloud Run**

**`@media-buying-governance/admin-portal`**
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui components
- Firebase Auth client SDK
- Rule builder, naming convention builder, compliance dashboard
- Deploys to **Cloud Storage + Cloud CDN** (static hosting)

**`@media-buying-governance/extension`**
- Chrome Manifest V3 extension
- Service worker for URL detection and dynamic content script injection
- Platform adapters: Meta Ads Manager, Google Ads
- DOM injection, real-time validation, campaign scoring
- remoteEval bridge pattern for reading framework-internal state

## Infrastructure (Google Cloud Platform)

All services run on GCP:

| Service | GCP Product | Purpose |
|:--|:--|:--|
| Backend API | **Cloud Run** | Serverless container deployment with auto-scaling |
| Database | **Cloud SQL (PostgreSQL)** | Managed PostgreSQL database |
| Authentication | **Google Cloud Identity Platform (Firebase Auth)** | SSO, JWT tokens, user management |
| Event Bus | **Cloud Pub/Sub** | Real-time rule update notifications to extensions |
| Static Hosting | **Cloud Storage + Cloud CDN** | Admin portal static assets |
| Secrets | **Secret Manager** | API keys, database credentials, webhook secrets |

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker + Docker Compose
- Google Cloud CLI (for deployment)

### Initial Setup

```bash
# Install dependencies
pnpm install

# Start local infrastructure (PostgreSQL, Pub/Sub emulator)
docker-compose up -d

# Build shared types
cd packages/shared
pnpm build

# Run database migrations
cd packages/backend
pnpm prisma migrate dev

# Seed test data
pnpm prisma db seed
```

### Running in Development

**Backend:**
```bash
cd packages/backend
pnpm dev
# Runs on http://localhost:3000
# Health check: http://localhost:3000/healthz
```

**Admin Portal:**
```bash
cd packages/admin-portal
pnpm dev
# Runs on http://localhost:5173
```

**Extension:**
```bash
cd packages/extension
pnpm dev
# Builds to packages/extension/dist/
# Load unpacked extension in Chrome from dist/ directory
```

**Run all services in parallel:**
```bash
# From root
pnpm dev
```

## Coding Conventions

1. **TypeScript Strict Mode**: All packages use `strict: true`. No `any` types allowed.
2. **No any**: Use `unknown` for truly unknown types, then narrow with type guards.
3. **JSDoc Comments**: All exported functions, classes, and interfaces must have JSDoc.
4. **API Response Types**: Every API endpoint returns a typed response from `@media-buying-governance/shared`.
5. **Prettier + ESLint**: Code is formatted with Prettier and linted with ESLint.
6. **Git Commits**: Follow Conventional Commits (e.g., `feat:`, `fix:`, `docs:`).

### Type-First Development

All interfaces are defined in `@media-buying-governance/shared` first:

```typescript
// Good: Import from shared package
import { Rule, RuleScope, EnforcementMode } from '@media-buying-governance/shared';

// Bad: Redefining types locally
interface Rule { ... } // Don't do this
```

### API Contract

Backend publishes endpoints that conform to the API types in `packages/shared/src/api.ts`:

```typescript
// Backend controller
@Get('/rules')
async getRules(@Query() query: GetRulesRequest): Promise<GetRulesResponse> {
  // ...
}

// Frontend consumer
const { data } = await api.get<GetRulesResponse>('/api/v1/rules', { params: query });
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests for a specific package
cd packages/backend
pnpm test

# Run tests with coverage
pnpm test -- --coverage
```

## Build & Deploy

```bash
# Build all packages
pnpm build

# Type-check all packages
pnpm typecheck

# Lint all packages
pnpm lint
```

### Deployment to GCP

**Backend (Cloud Run):**
```bash
cd packages/backend
gcloud run deploy mbg-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL=\$DATABASE_URL
```

**Admin Portal (Cloud Storage + CDN):**
```bash
cd packages/admin-portal
pnpm build
gsutil -m rsync -r -d dist/ gs://mbg-admin-portal/
```

**Extension (Chrome Web Store):**
```bash
cd packages/extension
pnpm build
# Creates packages/extension/dist.zip
# Upload to Chrome Web Store Developer Dashboard
```

## Key Architecture Patterns

### 1. remoteEval Bridge (Extension)

The extension uses a postMessage bridge to read framework-internal state (React Fiber, Angular component state) from the MAIN world execution context. See `packages/extension/src/content-scripts/remote-eval.ts`.

### 2. Dynamic Content Script Injection

**Critical:** The extension manifest has an **empty `content_scripts` array**. Content scripts are injected dynamically from the service worker using `chrome.scripting.executeScript()` based on URL pattern detection.

### 3. Platform Adapter Interface

All platform-specific code (Meta, Google Ads) implements the `PlatformAdapter` interface from `@media-buying-governance/shared`. This abstraction enables adding new platforms without changing core extension logic.

### 4. Pub/Sub for Rule Updates

When a rule is created/updated/deleted via the Admin API, a message is published to the `rules-updated` Pub/Sub topic. Extensions subscribe via WebSocket/SSE to receive immediate cache invalidation signals.

## Troubleshooting

**Prisma migration fails:**
```bash
cd packages/backend
pnpm prisma migrate reset
```

**Extension not loading:**
- Check that you built with `pnpm build` first
- Verify manifest.json is in dist/
- Check Chrome extension console for errors

**Firebase Auth errors:**
```bash
# Use local emulator
docker-compose up firebase-emulator
# Set FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
```

## Team Coordination

This project is developed using **Claude Code Agent Teams**:

- **Teammate 1 (Backend)**: Owns `/packages/backend/`
- **Teammate 2 (Admin Portal)**: Owns `/packages/admin-portal/`
- **Teammate 3 (Extension Core)**: Owns `/packages/extension/core/`
- **Teammate 4 (Meta Adapter)**: Owns `/packages/extension/src/adapters/meta/`
- **Teammate 5 (Google Adapter)**: Owns `/packages/extension/src/adapters/google/`

### Coordination Points

1. **Shared Types**: All teammates use types from `@media-buying-governance/shared`
2. **API Contracts**: Backend publishes API endpoints conforming to `packages/shared/src/api.ts`
3. **PlatformAdapter Interface**: Extension Core defines the interface; adapters implement it

## Resources

- **Full Specification**: [SPEC.md](./SPEC.md)
- **GCP Documentation**: https://cloud.google.com/docs
- **Chrome Extension API**: https://developer.chrome.com/docs/extensions/
- **NestJS**: https://docs.nestjs.com/
- **Prisma**: https://www.prisma.io/docs/
- **React**: https://react.dev/
- **Vite**: https://vitejs.dev/

---

For questions or issues, refer to the full specification in `SPEC.md` or consult the team lead.
