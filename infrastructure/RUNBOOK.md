# MBG Platform — Production Deployment Runbook

This runbook covers the complete deployment of the Media Buying Governance platform to Google Cloud Platform. Follow the steps in order. Each step includes verification commands to confirm success before moving on.

---

## Table of Contents

1. [Pre-deployment Checklist](#1-pre-deployment-checklist)
2. [Infrastructure Provisioning (Terraform)](#2-infrastructure-provisioning-terraform)
3. [Firebase Auth Configuration](#3-firebase-auth-configuration)
4. [Backend Deployment (Cloud Run)](#4-backend-deployment-cloud-run)
5. [Database Migration](#5-database-migration)
6. [Production Seed](#6-production-seed)
7. [Admin Portal Deployment (Cloud Storage + CDN)](#7-admin-portal-deployment-cloud-storage--cdn)
8. [Post-deployment Verification](#8-post-deployment-verification)
9. [Rollback Procedures](#9-rollback-procedures)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Pre-deployment Checklist

Before starting, verify all prerequisites are in place.

### GCP Project

- [ ] GCP project created
- [ ] Billing account linked
- [ ] You have `roles/owner` or `roles/editor` on the project
- [ ] Note your **Project ID**: `________________`

### Tools Installed

- [ ] `gcloud` CLI installed and authenticated (`gcloud auth login`)
- [ ] `terraform` >= 1.5.0 installed
- [ ] `docker` installed and running
- [ ] `node` >= 20 installed
- [ ] `pnpm` >= 8 installed
- [ ] `cloud-sql-proxy` installed (https://cloud.google.com/sql/docs/postgres/sql-proxy)

### Firebase

- [ ] Firebase project created (or linked to GCP project)
- [ ] Google sign-in provider enabled in Firebase Console
- [ ] Firebase Admin SDK service account JSON downloaded
- [ ] Firebase web app created — note the config values:
  - API Key: `________________`
  - Auth Domain: `________________`
  - Project ID: `________________`

### Enable GCP APIs

Run this to enable all required APIs (Terraform also does this, but pre-enabling speeds up `terraform apply`):

```bash
export PROJECT_ID="your-project-id"

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  pubsub.googleapis.com \
  vpcaccess.googleapis.com \
  compute.googleapis.com \
  servicenetworking.googleapis.com \
  cloudresourcemanager.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project="${PROJECT_ID}"
```

---

## 2. Infrastructure Provisioning (Terraform)

### 2.1 Configure Variables

```bash
cd infrastructure/terraform

# Copy example and edit
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values:

```hcl
project_id  = "your-actual-project-id"
db_password = "a-strong-random-password-here"    # Min 16 chars, mixed case + numbers
alert_email = "alerts@yourcompany.com"           # Optional
```

Generate a strong database password:

```bash
openssl rand -base64 24
```

### 2.2 Initialize and Plan

```bash
terraform init
terraform plan -out=tfplan
```

Review the plan carefully. You should see approximately 25-30 resources to create:
- 1 VPC network + 1 subnet
- 1 Cloud SQL instance + 1 database + 1 user
- 1 VPC connector
- 3 Secret Manager secrets
- 2 Pub/Sub topics + 4 subscriptions
- 1 Cloud Run service + 1 service account
- 1 Artifact Registry repository
- 1 Cloud Storage bucket
- 1 Backend bucket + URL map + proxy + forwarding rule (CDN)
- Monitoring resources (uptime check, alerts)
- Multiple IAM bindings

### 2.3 Apply

```bash
terraform apply tfplan
```

This takes approximately 10-15 minutes (Cloud SQL instance creation is the slowest).

### 2.4 Record Outputs

After apply completes, record the key outputs:

```bash
terraform output backend_url
terraform output admin_portal_bucket
terraform output admin_portal_cdn_ip
terraform output cloudsql_instance_connection_name
terraform output artifact_registry_url
terraform output cloudrun_service_account
```

Save these values — you will need them for subsequent steps.

### 2.5 Verify Infrastructure

```bash
# Verify Cloud SQL is running
gcloud sql instances describe mbg-postgres --project="${PROJECT_ID}" --format="value(state)"
# Expected: RUNNABLE

# Verify Pub/Sub topics
gcloud pubsub topics list --project="${PROJECT_ID}"
# Expected: rules-updated, compliance-events

# Verify Secret Manager
gcloud secrets list --project="${PROJECT_ID}"
# Expected: DATABASE_URL, FIREBASE_SERVICE_ACCOUNT, WEBHOOK_SIGNING_SECRET
```

---

## 3. Firebase Auth Configuration

### 3.1 Enable Google Sign-in

1. Go to **Firebase Console** > **Authentication** > **Sign-in method**
2. Enable **Google** provider
3. Set the support email address

### 3.2 Add Authorized Domains

In Firebase Console > Authentication > Settings > Authorized domains, add:

- Your Cloud Run URL (e.g., `mbg-backend-abc123-uc.a.run.app`)
- Your CDN IP or custom domain (e.g., `34.120.xxx.xxx` or `admin.yourdomain.com`)

### 3.3 Upload Service Account to Secret Manager

```bash
# Upload the Firebase Admin SDK service account JSON
gcloud secrets versions add FIREBASE_SERVICE_ACCOUNT \
  --data-file=path/to/firebase-service-account.json \
  --project="${PROJECT_ID}"
```

### 3.4 Verify

```bash
# Confirm the secret has a version
gcloud secrets versions list FIREBASE_SERVICE_ACCOUNT --project="${PROJECT_ID}"
# Expected: 1 version with state ENABLED
```

---

## 4. Backend Deployment (Cloud Run)

### 4.1 Authenticate Docker

```bash
REGION="us-central1"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
```

### 4.2 Build Docker Image

```bash
# From the repository root (NOT packages/backend)
cd /path/to/media-buying-governance

REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/mbg-images"
TAG="$(date +%Y%m%d-%H%M%S)"

docker build \
  -f packages/backend/Dockerfile \
  -t "${REGISTRY}/mbg-backend:${TAG}" \
  -t "${REGISTRY}/mbg-backend:latest" \
  .
```

### 4.3 Push to Artifact Registry

```bash
docker push "${REGISTRY}/mbg-backend:${TAG}"
docker push "${REGISTRY}/mbg-backend:latest"
```

### 4.4 Update Cloud Run

If this is the first deployment after Terraform, the service already references the image. Update it:

```bash
gcloud run services update mbg-backend \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${REGISTRY}/mbg-backend:${TAG}" \
  --quiet
```

### 4.5 Verify

```bash
BACKEND_URL=$(gcloud run services describe mbg-backend \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format="value(status.url)")

curl -s "${BACKEND_URL}/healthz"
# Expected: {"status":"ok","timestamp":"2026-02-07T..."}
```

**Or use the convenience script:**

```bash
./infrastructure/deploy-backend.sh "${PROJECT_ID}"
```

---

## 5. Database Migration

### 5.1 Start Cloud SQL Proxy

```bash
cloud-sql-proxy "${PROJECT_ID}:us-central1:mbg-postgres" --port=5433 &
```

### 5.2 Run Prisma Migrations

```bash
cd packages/backend

# Use the password from terraform.tfvars
export DATABASE_URL="postgresql://mbg_app:YOUR_DB_PASSWORD@localhost:5433/media_buying_governance"

npx prisma migrate deploy
```

### 5.3 Verify

```bash
npx prisma migrate status
# Expected: All migrations applied, database is up to date

# Optionally, connect with psql to inspect
psql "${DATABASE_URL}" -c "\dt"
# Expected: Tables matching the Prisma schema
```

### 5.4 Stop Proxy

```bash
kill %1  # or: kill $(jobs -p)
```

---

## 6. Production Seed

### 6.1 Run Production Seeder

```bash
# Start Cloud SQL Proxy again
cloud-sql-proxy "${PROJECT_ID}:us-central1:mbg-postgres" --port=5433 &

export DATABASE_URL="postgresql://mbg_app:YOUR_DB_PASSWORD@localhost:5433/media_buying_governance"

# Interactive mode
npx ts-node infrastructure/seed-production.ts

# Or non-interactive (CI mode)
ORG_NAME="Your Company" \
ADMIN_EMAIL="admin@yourcompany.com" \
ADMIN_NAME="Admin User" \
ORG_PLAN="pro" \
  npx ts-node infrastructure/seed-production.ts
```

### 6.2 Record Output

Save the following from the seed output:
- Organization ID: `________________`
- Admin User ID: `________________`
- Extension Pairing Token: `________________`

### 6.3 Stop Proxy

```bash
kill %1
```

---

## 7. Admin Portal Deployment (Cloud Storage + CDN)

### 7.1 Configure Production Environment

Edit `packages/admin-portal/.env.production`:

```bash
VITE_API_BASE_URL=https://mbg-backend-XXXXX-uc.a.run.app/api/v1
VITE_FIREBASE_API_KEY=AIzaSy...your-real-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
```

Verify no fake keys:

```bash
grep "fake-key" packages/admin-portal/.env.production
# Expected: no output (no matches)
```

### 7.2 Deploy

```bash
# Use the convenience script
export GOOGLE_CLOUD_PROJECT="${PROJECT_ID}"
./infrastructure/deploy-admin-portal.sh "${PROJECT_ID}"
```

Or manually:

```bash
cd packages/admin-portal
NODE_ENV=production pnpm build --mode production

BUCKET_NAME=$(cd ../../infrastructure/terraform && terraform output -raw admin_portal_bucket)

gsutil -m rsync -r -d dist/ "gs://${BUCKET_NAME}/"

# Set cache headers
gsutil setmeta -h "Cache-Control:no-cache, no-store, must-revalidate" "gs://${BUCKET_NAME}/index.html"
gsutil -m setmeta -r -h "Cache-Control:public, max-age=31536000, immutable" "gs://${BUCKET_NAME}/assets/"
```

### 7.3 Verify

```bash
# Direct bucket URL
curl -s -o /dev/null -w "%{http_code}" "https://storage.googleapis.com/${BUCKET_NAME}/index.html"
# Expected: 200

# CDN URL (may take a few minutes to propagate)
CDN_IP=$(cd infrastructure/terraform && terraform output -raw admin_portal_cdn_ip)
curl -s -o /dev/null -w "%{http_code}" "http://${CDN_IP}/"
# Expected: 200

# Verify cache headers
curl -I "https://storage.googleapis.com/${BUCKET_NAME}/index.html" 2>/dev/null | grep -i cache-control
# Expected: Cache-Control: no-cache, no-store, must-revalidate
```

---

## 8. Post-deployment Verification

Run through this checklist to verify the full deployment.

### 8.1 Backend API

```bash
BACKEND_URL=$(gcloud run services describe mbg-backend \
  --project="${PROJECT_ID}" --region=us-central1 --format="value(status.url)")

# Health check
curl -s "${BACKEND_URL}/healthz" | jq .
# Expected: {"status":"ok","timestamp":"..."}
```

### 8.2 Admin Portal

- [ ] Open CDN URL or bucket URL in browser
- [ ] Page loads without console errors
- [ ] Firebase sign-in button appears
- [ ] Static assets load (check Network tab for 200s on JS/CSS files)
- [ ] Sign in with Google SSO using the admin email from the seed
- [ ] Dashboard loads with stat cards (should show 0s for fresh database)

### 8.3 Rules CRUD

- [ ] Navigate to Rules page
- [ ] Create a new rule
- [ ] Rule appears in the list
- [ ] Edit the rule
- [ ] Delete the rule

### 8.4 Compliance Dashboard

- [ ] Navigate to `/compliance`
- [ ] Charts load (should show "No data" for fresh database)

### 8.5 Webhooks

- [ ] Create a webhook pointing to https://webhook.site (get a unique URL)
- [ ] Trigger a compliance event via the extension API
- [ ] Verify the webhook payload is received on webhook.site

### 8.6 SSE Rules Stream

- [ ] Open the Chrome extension popup (paired with production backend)
- [ ] Open browser DevTools > Network > filter by "EventSource"
- [ ] Verify SSE connection is established
- [ ] Update a rule in the admin portal
- [ ] Verify the extension receives a `rules_updated` event

### 8.7 Monitoring

```bash
# Verify uptime check is working
gcloud monitoring uptime list-configs --project="${PROJECT_ID}"

# Check Cloud Run logs are flowing
gcloud run services logs read mbg-backend --project="${PROJECT_ID}" --region=us-central1 --limit=10
```

---

## 9. Rollback Procedures

### 9.1 Roll Back Backend to Previous Version

```bash
# List recent revisions
gcloud run revisions list --service=mbg-backend \
  --project="${PROJECT_ID}" --region=us-central1 \
  --sort-by="~creationTimestamp" --limit=5

# Route 100% traffic to a previous revision
gcloud run services update-traffic mbg-backend \
  --project="${PROJECT_ID}" \
  --region=us-central1 \
  --to-revisions=REVISION_NAME=100
```

### 9.2 Restore Database from Backup

```bash
# List available backups
gcloud sql backups list --instance=mbg-postgres --project="${PROJECT_ID}"

# Restore from a specific backup (creates a new instance)
gcloud sql backups restore BACKUP_ID \
  --restore-instance=mbg-postgres \
  --project="${PROJECT_ID}" \
  --async

# WARNING: This replaces the current database. All data since the backup
# will be lost. Consider using point-in-time recovery instead:
gcloud sql instances clone mbg-postgres mbg-postgres-recovery \
  --point-in-time="2026-02-07T12:00:00Z" \
  --project="${PROJECT_ID}"
```

### 9.3 Revert Admin Portal to Previous Version

The admin portal is static files in Cloud Storage. To revert:

1. **If you have the previous build locally:**
   ```bash
   gsutil -m rsync -r -d path/to/previous/dist/ gs://${BUCKET_NAME}/
   ```

2. **If you need to rebuild from a previous commit:**
   ```bash
   git checkout <previous-commit-hash> -- packages/admin-portal/
   cd packages/admin-portal
   pnpm build --mode production
   gsutil -m rsync -r -d dist/ gs://${BUCKET_NAME}/
   ```

3. **Invalidate CDN cache after reverting:**
   ```bash
   gcloud compute url-maps invalidate-cdn-cache mbg-admin-portal-urlmap \
     --path="/*" --project="${PROJECT_ID}"
   ```

### 9.4 Full Rollback Sequence

If you need to roll everything back:

1. Roll back Cloud Run to previous revision (immediate)
2. Roll back admin portal static assets (takes effect after CDN cache invalidation)
3. If database migration needs reverting, restore from backup
4. Verify health check passes
5. Verify admin portal loads

---

## 10. Troubleshooting

### Common Issues

#### "Container failed to start" (Cloud Run)

**Symptom:** Cloud Run logs show the container crashing on startup.

**Causes and fixes:**
1. **Missing DATABASE_URL secret**: Verify secret exists and has a version:
   ```bash
   gcloud secrets versions access latest --secret=DATABASE_URL --project="${PROJECT_ID}" | head -c 20
   ```

2. **Wrong DATABASE_URL format**: Must use Unix socket format for Cloud Run:
   ```
   postgresql://mbg_app:PASSWORD@localhost/media_buying_governance?host=/cloudsql/PROJECT:us-central1:mbg-postgres
   ```

3. **Missing FIREBASE_SERVICE_ACCOUNT**: Upload the JSON to Secret Manager.

4. **Cloud SQL not ready**: Wait for instance state to be `RUNNABLE`:
   ```bash
   gcloud sql instances describe mbg-postgres --format="value(state)"
   ```

#### "Connection refused" to Cloud SQL

**Symptom:** Backend logs show `ECONNREFUSED` when connecting to database.

**Fixes:**
1. Verify Cloud SQL Auth Proxy is configured (check Cloud Run service for `--add-cloudsql-instances`)
2. Verify the VPC connector is attached to the Cloud Run service
3. Check Cloud SQL instance has private IP enabled:
   ```bash
   gcloud sql instances describe mbg-postgres --format="value(ipAddresses)"
   ```

#### Admin portal shows blank page

**Symptom:** White screen when visiting the CDN URL.

**Fixes:**
1. Check browser console for errors
2. Verify `index.html` exists in the bucket:
   ```bash
   gsutil cat "gs://${BUCKET_NAME}/index.html" | head -5
   ```
3. Verify the bucket has public read access:
   ```bash
   gsutil iam get "gs://${BUCKET_NAME}" | grep allUsers
   ```
4. If CORS errors: check that `VITE_API_BASE_URL` matches the actual Cloud Run URL

#### Firebase Auth "auth/unauthorized-domain"

**Symptom:** Firebase sign-in fails with unauthorized domain error.

**Fix:** Add the domain to Firebase authorized domains:
1. Firebase Console > Authentication > Settings > Authorized domains
2. Add the CDN IP or custom domain

#### Pub/Sub messages not received

**Symptom:** Rules updated in admin portal but extension does not receive updates.

**Fixes:**
1. Verify the `rules-updated` topic exists:
   ```bash
   gcloud pubsub topics list --project="${PROJECT_ID}"
   ```
2. Verify the subscription exists and has no backlog:
   ```bash
   gcloud pubsub subscriptions pull rules-updated-sse --project="${PROJECT_ID}" --auto-ack --limit=1
   ```
3. Check Cloud Run service account has `pubsub.publisher` role
4. Check backend logs for Pub/Sub publish errors

### Viewing Logs

```bash
# Cloud Run logs (last 50 entries)
gcloud run services logs read mbg-backend \
  --project="${PROJECT_ID}" \
  --region=us-central1 \
  --limit=50

# Cloud Run logs — errors only
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="mbg-backend" AND severity>=ERROR' \
  --project="${PROJECT_ID}" \
  --limit=20 \
  --format="table(timestamp, textPayload)"

# Cloud SQL logs
gcloud logging read \
  'resource.type="cloudsql_database"' \
  --project="${PROJECT_ID}" \
  --limit=20

# All logs for the project (last hour)
gcloud logging read \
  'timestamp>="2026-02-07T00:00:00Z"' \
  --project="${PROJECT_ID}" \
  --limit=50
```

### Connecting to Cloud SQL for Debugging

```bash
# Start Cloud SQL Proxy
cloud-sql-proxy "${PROJECT_ID}:us-central1:mbg-postgres" --port=5433 &

# Connect with psql
psql "postgresql://mbg_app:PASSWORD@localhost:5433/media_buying_governance"

# Useful queries
SELECT COUNT(*) FROM organizations;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM rules;
SELECT COUNT(*) FROM compliance_events;

# Check recent compliance events
SELECT ce.created_at, ce.status, u.email, r.name as rule_name
FROM compliance_events ce
JOIN users u ON ce.buyer_id = u.id
JOIN rules r ON ce.rule_id = r.id
ORDER BY ce.created_at DESC
LIMIT 20;
```

### Useful gcloud Commands

```bash
# Cloud Run service details
gcloud run services describe mbg-backend --project="${PROJECT_ID}" --region=us-central1

# List all Cloud Run revisions
gcloud run revisions list --service=mbg-backend --project="${PROJECT_ID}" --region=us-central1

# Cloud SQL instance details
gcloud sql instances describe mbg-postgres --project="${PROJECT_ID}"

# Secret Manager — list all secrets
gcloud secrets list --project="${PROJECT_ID}"

# Pub/Sub — list subscriptions with pending message counts
gcloud pubsub subscriptions list --project="${PROJECT_ID}" --format="table(name, topic, ackDeadlineSeconds)"
```

---

## Production URLs

After deployment, your production URLs will be:

| Service | URL |
|:--|:--|
| Backend API | `https://mbg-backend-[HASH]-uc.a.run.app` |
| Backend Health | `https://mbg-backend-[HASH]-uc.a.run.app/healthz` |
| Admin Portal (Bucket) | `https://storage.googleapis.com/[BUCKET_NAME]/index.html` |
| Admin Portal (CDN) | `http://[CDN_IP]` (or `https://admin.yourdomain.com` with custom domain) |

These URLs are needed by:
- The **Extension Release** agent (backend API URL + admin portal URL)
- The **admin portal** build (`.env.production` references the backend URL)
- **Firebase Auth** configuration (authorized domains list)
