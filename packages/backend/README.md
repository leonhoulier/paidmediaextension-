# @media-buying-governance/backend

NestJS backend API for the Media Buying Governance Platform. Provides REST API endpoints for the Chrome extension and admin portal, with PostgreSQL database via Prisma ORM, Firebase Auth, and Google Cloud Pub/Sub integration.

## Prerequisites

- Node.js 20+
- pnpm 8+
- Docker + Docker Compose (for PostgreSQL and Pub/Sub emulator)

## Local Development

### 1. Start Infrastructure

From the repository root:

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Pub/Sub emulator on port 8085
- Firebase Auth emulator on port 9099

### 2. Install Dependencies

```bash
cd packages/backend
pnpm install
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env if needed (defaults work with docker-compose)
```

### 4. Run Migrations

```bash
pnpm prisma:migrate
```

### 5. Generate Prisma Client

```bash
pnpm prisma:generate
```

### 6. Seed Database

```bash
pnpm prisma:seed
```

This creates:
- 2 organizations (DLG, GlobalMedia Inc)
- 3 teams per org (US Social, EMEA Search, APAC Programmatic)
- 5 users per org (2 admins, 3 buyers with extension tokens)
- 4 ad accounts per org (2 Meta, 2 Google Ads)
- 10 rules covering naming conventions, budget, targeting, brand safety

Extension tokens for buyer users are printed to the console.

### 7. Start Development Server

```bash
pnpm dev
```

Server runs at http://localhost:3000. Health check at http://localhost:3000/healthz.

## Database Management

```bash
# Run migrations
pnpm prisma:migrate

# Deploy migrations (production)
pnpm prisma:migrate:deploy

# Reset database
npx prisma migrate reset

# Open Prisma Studio (database GUI)
pnpm prisma:studio

# Generate Prisma client after schema changes
pnpm prisma:generate
```

## Running Tests

```bash
# Unit tests
pnpm test

# Integration (e2e) tests (requires running PostgreSQL)
pnpm test:e2e

# Tests with coverage
pnpm test:cov
```

## Building

```bash
pnpm build
```

## API Endpoints

### Health Check

| Method | Path | Auth | Description |
|:-------|:-----|:-----|:------------|
| GET | `/healthz` | None | Health check endpoint |

### Extension API

All extension endpoints require the `X-Extension-Token` header.

| Method | Path | Description |
|:-------|:-----|:------------|
| GET | `/api/v1/rules` | Fetch rules for the current buyer. Query params: `platform`, `account_id`, `entity_level` |
| GET | `/api/v1/rules/version` | Lightweight version check for cache invalidation |
| POST | `/api/v1/compliance/events` | Batch submit compliance events (max 100) |
| POST | `/api/v1/compliance/comment` | Submit a buyer comment for a comment-required rule |

### Admin API

All admin endpoints require Firebase Auth (`Authorization: Bearer <token>`) with `admin` or `super_admin` role.

| Method | Path | Description |
|:-------|:-----|:------------|
| GET | `/api/v1/admin/organizations` | List organizations (super_admin only) |
| GET | `/api/v1/admin/organizations/:id` | Get organization |
| POST | `/api/v1/admin/organizations` | Create organization |
| PUT | `/api/v1/admin/organizations/:id` | Update organization |
| DELETE | `/api/v1/admin/organizations/:id` | Delete organization |
| GET | `/api/v1/admin/accounts` | List ad accounts |
| GET | `/api/v1/admin/accounts/:id` | Get ad account |
| POST | `/api/v1/admin/accounts` | Create ad account |
| PUT | `/api/v1/admin/accounts/:id` | Update ad account |
| DELETE | `/api/v1/admin/accounts/:id` | Delete ad account |
| GET | `/api/v1/admin/teams` | List teams |
| GET | `/api/v1/admin/teams/:id` | Get team |
| POST | `/api/v1/admin/teams` | Create team |
| PUT | `/api/v1/admin/teams/:id` | Update team |
| DELETE | `/api/v1/admin/teams/:id` | Delete team |
| GET | `/api/v1/admin/users` | List users |
| GET | `/api/v1/admin/users/:id` | Get user |
| POST | `/api/v1/admin/users` | Create user |
| PUT | `/api/v1/admin/users/:id` | Update user |
| DELETE | `/api/v1/admin/users/:id` | Delete user |
| GET | `/api/v1/admin/rule-sets` | List rule sets |
| GET | `/api/v1/admin/rule-sets/:id` | Get rule set |
| POST | `/api/v1/admin/rule-sets` | Create rule set |
| PUT | `/api/v1/admin/rule-sets/:id` | Update rule set |
| DELETE | `/api/v1/admin/rule-sets/:id` | Delete rule set |
| GET | `/api/v1/admin/rules` | List rules |
| GET | `/api/v1/admin/rules/:id` | Get rule |
| POST | `/api/v1/admin/rules` | Create rule (publishes Pub/Sub notification) |
| PUT | `/api/v1/admin/rules/:id` | Update rule (publishes Pub/Sub notification) |
| DELETE | `/api/v1/admin/rules/:id` | Delete rule (publishes Pub/Sub notification) |
| GET | `/api/v1/admin/naming-templates` | List naming templates |
| GET | `/api/v1/admin/naming-templates/:id` | Get naming template |
| POST | `/api/v1/admin/naming-templates` | Create naming template |
| PUT | `/api/v1/admin/naming-templates/:id` | Update naming template |
| DELETE | `/api/v1/admin/naming-templates/:id` | Delete naming template |

### Local Auth Bypass

When `ALLOW_LOCAL_AUTH=true`, the Firebase Auth guard accepts base64-encoded JSON tokens:

```bash
# Create a local admin token
TOKEN=$(echo '{"uid":"local-admin","email":"admin1@dlg.com"}' | base64)

# Use it
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/admin/accounts
```

## Environment Variables

| Variable | Default | Description |
|:---------|:--------|:------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | Server port |
| `DATABASE_URL` | (see .env.example) | PostgreSQL connection string |
| `FIREBASE_PROJECT_ID` | `your-project-id` | Firebase project ID |
| `GOOGLE_CLOUD_PROJECT` | `your-project-id` | GCP project ID |
| `PUBSUB_EMULATOR_HOST` | `localhost:8085` | Pub/Sub emulator host (unset for production) |
| `ALLOW_LOCAL_AUTH` | `true` | Enable local auth bypass for development |

## Architecture

```
src/
├── main.ts                    # Application bootstrap
├── app.module.ts              # Root module
├── app.controller.ts          # Health check
├── config/                    # Configuration
├── prisma/                    # Database service
├── auth/                      # Firebase Auth + Extension Token guards
├── extension/                 # Chrome extension API endpoints
│   ├── rules.controller.ts    # GET /api/v1/rules, GET /api/v1/rules/version
│   └── compliance.controller.ts # POST /api/v1/compliance/events, POST /api/v1/compliance/comment
├── admin/                     # Admin portal CRUD endpoints
│   ├── organizations/
│   ├── accounts/
│   ├── teams/
│   ├── users/
│   ├── rule-sets/
│   ├── rules/
│   └── naming-templates/
├── pubsub/                    # Google Cloud Pub/Sub publisher
└── common/                    # Filters, interceptors
```

## Deployment

The Dockerfile uses a multi-stage build targeting Google Cloud Run:

```bash
# Build and deploy to Cloud Run
gcloud run deploy mbg-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL=$DATABASE_URL,FIREBASE_PROJECT_ID=$PROJECT_ID
```
