# Production Deployment Guide

Complete deployment documentation for the Media Buying Governance Platform on Google Cloud Platform.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Step 1: Obtain Credentials](#step-1-obtain-credentials)
4. [Step 2: Terraform Provisioning](#step-2-terraform-provisioning)
5. [Step 3: Backend Deployment](#step-3-backend-deployment)
6. [Step 4: Admin Portal Deployment](#step-4-admin-portal-deployment)
7. [Step 5: Extension Preparation](#step-5-extension-preparation)
8. [Step 6: Firebase Auth Setup](#step-6-firebase-auth-setup)
9. [Step 7: Alerting Configuration](#step-7-alerting-configuration)
10. [Step 8: End-to-End Testing](#step-8-end-to-end-testing)
11. [Production URLs](#production-urls)
12. [Monitoring Dashboards](#monitoring-dashboards)
13. [Rollback Procedures](#rollback-procedures)
14. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Tools Required

| Tool | Version | Installation |
|------|---------|-------------|
| Node.js | 20+ | https://nodejs.org |
| pnpm | 8+ | `corepack enable && corepack prepare pnpm@8 --activate` |
| Docker | 24+ | https://docs.docker.com/get-docker/ |
| Google Cloud CLI | Latest | https://cloud.google.com/sdk/docs/install |
| Terraform | 1.5+ | https://developer.hashicorp.com/terraform/install |
| Cloud SQL Proxy | Latest | https://cloud.google.com/sql/docs/postgres/sql-proxy |

### GCP Project Setup

1. Create a GCP project (or use an existing one)
2. Enable billing on the project
3. Authenticate the gcloud CLI:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   gcloud auth application-default login
   ```

---

## Architecture Overview

```
                    Internet
                       |
            +----------+----------+
            |                     |
    Cloud Run (API)      Cloud CDN + Storage
    mbg-backend          (Admin Portal SPA)
            |
     Cloud SQL Proxy
            |
    Cloud SQL (PostgreSQL 15)
            |
     Secret Manager
     (DATABASE_URL, FIREBASE_SERVICE_ACCOUNT,
      WEBHOOK_SIGNING_SECRET, SENTRY_DSN,
      POSTHOG_API_KEY, SPLITIO_API_KEY)

    Cloud Pub/Sub
    ├── rules-updated (SSE + push subscription)
    └── compliance-events (push subscription)

    Firebase Auth (Identity Platform)
    └── JWT verification for all API requests
```

### Key Design Decisions

- **ALLOW_LOCAL_AUTH=false** in production (Firebase JWT is the only auth path)
- **Backend expects organizationId from @CurrentUser() decorator**, NOT from request body
- **Approval system is pre-built** (do not recreate)
- **Organizations page is restricted to super_admin role only**
- **Extension stores requestId in chrome.storage.local** for cross-tab tracking
- **Firebase API key must NOT start with "fake-"** (build validation rejects it)

---

## Step 1: Obtain Credentials

Before deploying, gather these credentials. All values go into `infrastructure/terraform/terraform.tfvars`.

### Required Credentials

| Credential | Where to Get It | Terraform Variable |
|-----------|----------------|-------------------|
| GCP Project ID | GCP Console > Project picker (top-left) | `project_id` |
| Database Password | Generate: `openssl rand -base64 32` | `db_password` |

### Required Service Credentials

| Credential | Where to Get It | Terraform Variable |
|-----------|----------------|-------------------|
| Firebase Service Account JSON | Firebase Console > Project Settings > Service Accounts > Generate new private key | Added via `gcloud` CLI (see Step 6) |
| Sentry DSN | Sentry > Settings > Projects > Client Keys (DSN) | `sentry_dsn` |
| PostHog API Key | PostHog > Settings > Project API Key | `posthog_api_key` |
| Split.io SDK Key | Split.io > Admin Settings > API Keys > Server-side SDK key | `splitio_api_key` |

### Required for Frontend Builds

| Credential | Where to Get It | Config File |
|-----------|----------------|------------|
| Firebase API Key | Firebase Console > Project Settings > General > Web app > apiKey | `packages/admin-portal/.env.production` |
| Firebase Auth Domain | Firebase Console > Project Settings > General > Web app > authDomain | `packages/admin-portal/.env.production` |
| Firebase Project ID | Firebase Console > Project Settings > General > Project ID | `packages/admin-portal/.env.production` |
| Sentry DSN (frontend) | Sentry > Settings > Projects > Client Keys (browser JS platform) | `.env.production` in admin-portal and extension |
| PostHog API Key (frontend) | PostHog > Settings > Project API Key | `.env.production` in admin-portal and extension |
| Split.io Client-side Key | Split.io > Admin Settings > API Keys > Client-side SDK key | `.env.production` in admin-portal and extension |

### Optional Credentials

| Credential | Where to Get It | Terraform Variable |
|-----------|----------------|-------------------|
| Alert Email | Your team's alert distribution list | `alert_email` |
| Slack Webhook URL | Slack App > Incoming Webhooks | `slack_webhook_url` |

---

## Step 2: Terraform Provisioning

Terraform provisions all GCP infrastructure: Cloud SQL, Cloud Run, Pub/Sub, Secret Manager, Cloud Storage + CDN, VPC, monitoring alerts.

### 2.1 Configure Variables

```bash
cd infrastructure/terraform

# Copy example and fill in values
cp terraform.tfvars.example terraform.tfvars

# Edit with your credentials (see Step 1 for where to get each value)
# IMPORTANT: terraform.tfvars is gitignored — never commit it
```

Key settings to review in `terraform.tfvars`:

```hcl
# Production-recommended settings (already set in the template):
db_tier               = "db-g1-small"   # NOT db-f1-micro
backend_min_instances = 1               # Avoid cold starts
backend_max_instances = 5               # Scale for traffic
backend_memory        = "1Gi"           # Adequate for NestJS + Prisma
backend_cpu           = "2"
```

### 2.2 Initialize and Plan

```bash
cd infrastructure/terraform

# Initialize Terraform (downloads providers)
terraform init

# Preview what will be created
terraform plan -out=tfplan

# Review the plan carefully — you should see ~25-30 resources:
#   - Cloud SQL instance + database + user
#   - VPC + subnet + VPC connector
#   - Cloud Run service + service account + IAM
#   - Secret Manager secrets (DATABASE_URL, FIREBASE_SERVICE_ACCOUNT,
#     WEBHOOK_SIGNING_SECRET, SENTRY_DSN, POSTHOG_API_KEY, SPLITIO_API_KEY)
#   - Cloud Storage bucket + CDN load balancer
#   - Pub/Sub topics + subscriptions
#   - Monitoring uptime checks + alert policies
#   - Artifact Registry repository
```

### 2.3 Apply

```bash
# Apply the plan
terraform apply tfplan

# This takes 10-15 minutes (Cloud SQL instance creation is the bottleneck).
# Save the outputs — you will need them for subsequent steps.
terraform output
```

### 2.4 Record Outputs

After apply, capture these outputs for use in deployment scripts:

```bash
# Backend Cloud Run URL
terraform output -raw backend_url
# Example: https://mbg-backend-abc123xyz-uc.a.run.app

# Admin portal bucket name
terraform output -raw admin_portal_bucket
# Example: mbg-admin-portal-a1b2c3d4

# Admin portal CDN IP
terraform output -raw admin_portal_cdn_ip
# Example: 34.120.5.10

# Cloud SQL connection name (for migrations)
terraform output -raw cloudsql_instance_connection_name
# Example: your-project:us-central1:mbg-postgres

# Artifact Registry URL
terraform output -raw artifact_registry_url
# Example: us-central1-docker.pkg.dev/your-project/mbg-images
```

### 2.5 Enable Remote State (Recommended)

For team deployments, enable GCS remote state to avoid state file conflicts:

```bash
# Create the state bucket
gsutil mb -l us-central1 gs://YOUR_PROJECT-mbg-terraform-state

# Enable versioning (protects against accidental state loss)
gsutil versioning set on gs://YOUR_PROJECT-mbg-terraform-state
```

Then uncomment the `backend "gcs"` block in `main.tf`:

```hcl
backend "gcs" {
  bucket = "YOUR_PROJECT-mbg-terraform-state"
  prefix = "terraform/state"
}
```

Re-initialize to migrate state:

```bash
terraform init -migrate-state
```

---

## Step 3: Backend Deployment

### 3.1 Add Firebase Service Account Secret

Before deploying the backend, the Firebase service account must be in Secret Manager:

```bash
# Download the service account key from Firebase Console
# Firebase Console > Project Settings > Service Accounts > Generate new private key

# Add to Secret Manager
gcloud secrets versions add FIREBASE_SERVICE_ACCOUNT \
  --data-file=firebase-service-account.json \
  --project=YOUR_PROJECT_ID

# IMPORTANT: Delete the local copy after uploading
rm firebase-service-account.json
```

### 3.2 Build and Deploy

Use the provided deployment script:

```bash
# From the repository root
./infrastructure/deploy-backend.sh YOUR_PROJECT_ID

# This script will:
#   1. Configure Docker authentication for Artifact Registry
#   2. Build the Docker image from packages/backend/Dockerfile
#   3. Push to Artifact Registry (tagged with timestamp + latest)
#   4. Update Cloud Run service with the new image
#   5. Run Prisma database migrations via Cloud SQL Proxy
#   6. Verify the health check endpoint
```

### 3.3 Manual Deployment (Alternative)

If you prefer to run steps manually:

```bash
# Set variables
PROJECT_ID="your-project-id"
REGION="us-central1"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/mbg-images"
TAG=$(date +%Y%m%d-%H%M%S)

# Authenticate Docker
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

# Build from repo root (Dockerfile references pnpm-workspace.yaml)
docker build \
  -f packages/backend/Dockerfile \
  -t ${REGISTRY}/mbg-backend:${TAG} \
  -t ${REGISTRY}/mbg-backend:latest \
  .

# Push
docker push ${REGISTRY}/mbg-backend:${TAG}
docker push ${REGISTRY}/mbg-backend:latest

# Deploy to Cloud Run
gcloud run services update mbg-backend \
  --project=${PROJECT_ID} \
  --region=${REGION} \
  --image=${REGISTRY}/mbg-backend:${TAG} \
  --quiet

# Run database migrations
cloud-sql-proxy ${PROJECT_ID}:${REGION}:mbg-postgres --port=5433 &
PROXY_PID=$!
sleep 3

DB_PASSWORD=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=${PROJECT_ID} | \
  sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')

cd packages/backend
DATABASE_URL="postgresql://mbg_app:${DB_PASSWORD}@localhost:5433/media_buying_governance" \
  npx prisma migrate deploy

kill ${PROXY_PID}
```

### 3.4 Seed Initial Data (First Deploy Only)

On the very first deployment, seed the database with the initial super_admin user and default rules:

```bash
# Start Cloud SQL Proxy (if not already running)
cloud-sql-proxy ${PROJECT_ID}:${REGION}:mbg-postgres --port=5433 &
PROXY_PID=$!
sleep 3

cd packages/backend
DATABASE_URL="postgresql://mbg_app:${DB_PASSWORD}@localhost:5433/media_buying_governance" \
  npx prisma db seed

kill ${PROXY_PID}
```

### 3.5 Verify Backend Health

```bash
BACKEND_URL=$(cd infrastructure/terraform && terraform output -raw backend_url)

# Health check
curl -s ${BACKEND_URL}/healthz | jq .

# Expected response:
# { "status": "ok", "timestamp": "...", "version": "1.0.0" }
```

---

## Step 4: Admin Portal Deployment

### 4.1 Configure Environment

Update `packages/admin-portal/.env.production` with real values:

```bash
# Get the backend URL from Terraform
BACKEND_URL=$(cd infrastructure/terraform && terraform output -raw backend_url)

# Update .env.production
# Replace REPLACE_WITH_CLOUD_RUN_URL with the actual Cloud Run hostname
# Replace REPLACE_WITH_FIREBASE_API_KEY with your real Firebase API key
# Replace REPLACE_WITH_PROJECT_ID with your Firebase project ID
# Add Sentry, PostHog, and Split.io keys
```

**Validation checklist for .env.production:**
- [ ] `VITE_FIREBASE_API_KEY` does NOT start with `fake-`
- [ ] `VITE_API_BASE_URL` ends with `/api/v1`
- [ ] `VITE_FIREBASE_PROJECT_ID` matches your GCP project

### 4.2 Build and Deploy

Use the provided deployment script:

```bash
# From the repository root
./infrastructure/deploy-admin-portal.sh YOUR_PROJECT_ID

# This script will:
#   1. Validate .env.production (rejects fake keys)
#   2. Build the Vite production bundle
#   3. Upload to Cloud Storage (rsync with delete)
#   4. Set Cache-Control headers (index.html: no-cache, assets: immutable)
#   5. Configure CORS for the backend URL
#   6. Invalidate CDN cache for index.html
```

### 4.3 Verify Admin Portal

```bash
CDN_IP=$(cd infrastructure/terraform && terraform output -raw admin_portal_cdn_ip)

# Check the page loads
curl -s -o /dev/null -w "%{http_code}" http://${CDN_IP}/

# Check cache headers on assets
curl -I http://${CDN_IP}/index.html
# Should show: Cache-Control: no-cache, no-store, must-revalidate

curl -I http://${CDN_IP}/assets/index-abc123.js
# Should show: Cache-Control: public, max-age=31536000, immutable
```

---

## Step 5: Extension Preparation

The Chrome extension is distributed through the Chrome Web Store, not through Terraform.

### 5.1 Configure Environment

Update `packages/extension/.env.production` with real values:

```bash
# Get URLs from Terraform
BACKEND_URL=$(cd infrastructure/terraform && terraform output -raw backend_url)
CDN_URL=$(cd infrastructure/terraform && terraform output -raw admin_portal_cdn_url)

# Replace placeholders in packages/extension/.env.production
```

### 5.2 Production Build

```bash
cd packages/extension

# Build the production extension bundle with zip for Chrome Web Store
pnpm build:prod

# This creates:
#   packages/extension/dist/      — unpacked extension for testing
#   packages/extension/dist.zip   — zip file for Chrome Web Store upload
```

### 5.3 Chrome Web Store Submission

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Create a new item (or update existing)
3. Upload `packages/extension/dist.zip`
4. Fill in listing details:
   - Name: Media Buying Governance
   - Category: Productivity
   - Description: Real-time validation rules and compliance checks for ad platform UIs
5. Set permissions justification for:
   - `activeTab` — needed to inject validation UI into ad platform tabs
   - `storage` — stores requestId in chrome.storage.local for cross-tab tracking
   - `scripting` — dynamically injects content scripts based on URL patterns
6. Submit for review

### 5.4 Internal Testing (Before Publishing)

For testing before Chrome Web Store approval:

```bash
# Build without zip
pnpm build

# Load as unpacked extension:
# Chrome > Extensions > Enable Developer Mode > Load Unpacked > select dist/
```

---

## Step 6: Firebase Auth Setup

### 6.1 Enable Identity Platform

```bash
# Enable Identity Platform (Firebase Auth) API
gcloud services enable identitytoolkit.googleapis.com --project=YOUR_PROJECT_ID
```

### 6.2 Configure Sign-In Methods

In the [Firebase Console](https://console.firebase.google.com):

1. Go to Authentication > Sign-in method
2. Enable **Email/Password** provider
3. Enable **Google** provider (recommended for SSO)
4. Configure authorized domains:
   - Add your admin portal domain (CDN IP or custom domain)
   - Add `localhost` for development

### 6.3 Create Initial Super Admin

After the backend is deployed and seeded:

1. Create a Firebase user (via Firebase Console > Authentication > Users > Add user)
2. Note the user's UID
3. Use the backend seed script or direct database access to assign `super_admin` role:

```sql
-- Connect via Cloud SQL Proxy
UPDATE "User"
SET role = 'super_admin'
WHERE "firebaseUid" = 'THE_FIREBASE_UID';
```

### 6.4 Verify Authentication Flow

1. Open the admin portal in a browser
2. Sign in with the super_admin user
3. Verify you can access the Organizations page (super_admin only)
4. Create a test organization
5. Verify the extension can authenticate and fetch rules

---

## Step 7: Alerting Configuration

### 7.1 Terraform-Managed Alerts

If you set `alert_email` in `terraform.tfvars`, Terraform creates these alerts automatically:

| Alert | Condition | Action |
|-------|-----------|--------|
| Uptime Failure | /healthz fails 3 consecutive checks (3 min) | Email notification |
| 5xx Error Rate | > 5 server errors per minute | Email notification |
| Cloud SQL Connections | > 80 connections (limit is 100) | Email notification |

### 7.2 Sentry Alert Rules

Configure in [Sentry](https://sentry.io):

1. Create alert rules for the backend project:
   - High error rate (> 10 events/hour)
   - New issue notifications
   - Performance regression (P95 response time > 2s)

2. Create alert rules for the admin portal project:
   - Unhandled JavaScript exceptions
   - Network request failures

### 7.3 PostHog Alerts (Optional)

Configure in [PostHog](https://posthog.com):

1. Set up action tracking for key user flows
2. Create alerts for significant drops in daily active users

---

## Step 8: End-to-End Testing

### Pre-Launch Verification Checklist

**Infrastructure:**
- [ ] `terraform output` shows all expected resources
- [ ] Cloud SQL instance is running and accessible
- [ ] All Secret Manager secrets have versions

**Backend:**
- [ ] `curl $BACKEND_URL/healthz` returns `200 OK`
- [ ] Database migrations applied successfully
- [ ] Seed data present (default rules, initial organization)
- [ ] ALLOW_LOCAL_AUTH is `false` (verify in Cloud Run env vars)
- [ ] Sentry receives test error: `curl -X POST $BACKEND_URL/api/v1/debug/sentry-test` (if debug endpoint exists)

**Admin Portal:**
- [ ] Portal loads at CDN URL
- [ ] Firebase login works (email/password and Google)
- [ ] Rules list page loads (fetches from backend API)
- [ ] Create a new rule and verify it saves
- [ ] Approval workflow works (submit, approve, reject)
- [ ] Organizations page accessible only for super_admin
- [ ] Naming convention builder functional
- [ ] Compliance dashboard shows data

**Extension:**
- [ ] Extension installs from unpacked build
- [ ] Extension detects Meta Ads Manager URL
- [ ] Extension detects Google Ads URL
- [ ] Extension fetches rules from backend API
- [ ] Validation UI injects correctly into ad platform forms
- [ ] Campaign scoring displays
- [ ] requestId persists in chrome.storage.local across tab reloads

**Integration:**
- [ ] Rule created in admin portal appears in extension within 30 seconds (Pub/Sub SSE)
- [ ] Compliance event from extension appears in admin dashboard
- [ ] Webhook fires on rule update (if Slack webhook configured)

---

## Production URLs

After deployment, your production URLs will be:

| Service | URL Template | How to Find |
|---------|-------------|-------------|
| Backend API | `https://mbg-backend-HASH-uc.a.run.app` | `terraform output backend_url` |
| Backend Health | `https://mbg-backend-HASH-uc.a.run.app/healthz` | Append `/healthz` to backend URL |
| Admin Portal (CDN) | `http://CDN_IP` | `terraform output admin_portal_cdn_url` |
| Admin Portal (direct) | `https://storage.googleapis.com/BUCKET/index.html` | `terraform output admin_portal_bucket_url` |
| Cloud SQL | `PROJECT:REGION:mbg-postgres` | `terraform output cloudsql_instance_connection_name` |
| Artifact Registry | `REGION-docker.pkg.dev/PROJECT/mbg-images` | `terraform output artifact_registry_url` |

---

## Monitoring Dashboards

### GCP Console Links

| Dashboard | URL |
|-----------|-----|
| Cloud Run Overview | `https://console.cloud.google.com/run?project=YOUR_PROJECT_ID` |
| Cloud Run Logs | `https://console.cloud.google.com/run/detail/us-central1/mbg-backend/logs?project=YOUR_PROJECT_ID` |
| Cloud SQL Overview | `https://console.cloud.google.com/sql/instances/mbg-postgres/overview?project=YOUR_PROJECT_ID` |
| Secret Manager | `https://console.cloud.google.com/security/secret-manager?project=YOUR_PROJECT_ID` |
| Monitoring Uptime | `https://console.cloud.google.com/monitoring/uptime?project=YOUR_PROJECT_ID` |
| Alert Policies | `https://console.cloud.google.com/monitoring/alerting?project=YOUR_PROJECT_ID` |
| Pub/Sub Topics | `https://console.cloud.google.com/cloudpubsub/topic/list?project=YOUR_PROJECT_ID` |
| Cloud CDN | `https://console.cloud.google.com/net-services/cdn/list?project=YOUR_PROJECT_ID` |
| Error Reporting | `https://console.cloud.google.com/errors?project=YOUR_PROJECT_ID` |

### External Dashboards

| Dashboard | URL |
|-----------|-----|
| Sentry Issues | `https://YOUR_ORG.sentry.io/issues/` |
| PostHog Dashboard | `https://us.posthog.com/project/YOUR_PROJECT_ID` |
| Split.io Feature Flags | `https://app.split.io/` |

---

## Rollback Procedures

### Backend Rollback

Roll back to a previous Docker image:

```bash
# List recent images
gcloud artifacts docker images list \
  us-central1-docker.pkg.dev/YOUR_PROJECT/mbg-images/mbg-backend \
  --sort-by=~CREATE_TIME \
  --limit=10

# Rollback to a specific tag
gcloud run services update mbg-backend \
  --project=YOUR_PROJECT_ID \
  --region=us-central1 \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT/mbg-images/mbg-backend:PREVIOUS_TAG
```

### Database Rollback

Prisma migrations are forward-only. For critical database issues:

```bash
# Option 1: Restore from Cloud SQL backup
gcloud sql backups list --instance=mbg-postgres --project=YOUR_PROJECT_ID
gcloud sql backups restore BACKUP_ID --restore-instance=mbg-postgres

# Option 2: Point-in-time recovery (within 7-day window)
gcloud sql instances clone mbg-postgres mbg-postgres-recovered \
  --point-in-time="2024-01-15T10:00:00Z"
```

### Admin Portal Rollback

Previous versions are in Cloud Storage versioning:

```bash
# List object versions
gsutil ls -la gs://BUCKET_NAME/index.html

# Restore a specific version
gsutil cp gs://BUCKET_NAME/index.html#VERSION gs://BUCKET_NAME/index.html

# Invalidate CDN
gcloud compute url-maps invalidate-cdn-cache mbg-admin-portal-urlmap \
  --path="/index.html" \
  --project=YOUR_PROJECT_ID
```

### Terraform Rollback

```bash
# View state history (if using GCS backend with versioning)
gsutil ls -la gs://YOUR_PROJECT-mbg-terraform-state/terraform/state/

# Restore previous state file
gsutil cp gs://BUCKET/terraform/state/default.tfstate#VERSION \
  gs://BUCKET/terraform/state/default.tfstate

# Apply the restored state
terraform apply
```

---

## Troubleshooting

### Backend Won't Start

```bash
# Check Cloud Run logs
gcloud run services logs read mbg-backend \
  --project=YOUR_PROJECT_ID \
  --region=us-central1 \
  --limit=100

# Common issues:
# - "FIREBASE_SERVICE_ACCOUNT secret not found" → Add the secret (Step 3.1)
# - "Connection refused on Cloud SQL" → Check VPC connector status
# - "ALLOW_LOCAL_AUTH is true" → Should be false in production (set in cloudrun.tf)
```

### Database Connection Issues

```bash
# Test Cloud SQL Proxy locally
cloud-sql-proxy YOUR_PROJECT:us-central1:mbg-postgres --port=5433

# Check Cloud SQL instance status
gcloud sql instances describe mbg-postgres --project=YOUR_PROJECT_ID

# Check connection count
gcloud monitoring time-series list \
  --project=YOUR_PROJECT_ID \
  --filter="metric.type=\"cloudsql.googleapis.com/database/network/connections\""
```

### Admin Portal Not Loading

```bash
# Check if bucket has files
gsutil ls gs://BUCKET_NAME/

# Check CDN backend health
gcloud compute backend-buckets describe mbg-admin-portal-backend --project=YOUR_PROJECT_ID

# Check load balancer forwarding rule
gcloud compute forwarding-rules describe mbg-admin-portal-http --global --project=YOUR_PROJECT_ID
```

### Extension Issues

- **Not detecting ad platforms:** Check that content scripts are being injected via service worker logs
- **Auth failures:** Verify the backend URL in `.env.production` matches the deployed Cloud Run URL
- **Stale rules:** Check Pub/Sub subscription backlog; extension should receive SSE updates within 30 seconds
- **requestId missing:** Look in `chrome.storage.local` via Chrome DevTools > Application > Storage

### Sentry Not Receiving Events

```bash
# Verify DSN is set
gcloud run services describe mbg-backend \
  --project=YOUR_PROJECT_ID \
  --region=us-central1 \
  --format="yaml(spec.template.spec.containers[0].env)"

# Test Sentry connectivity from the backend container
gcloud run services logs read mbg-backend \
  --project=YOUR_PROJECT_ID \
  --region=us-central1 \
  --limit=20 | grep -i sentry
```
