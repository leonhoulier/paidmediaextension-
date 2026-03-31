# GCP Deployment Guide — Backend

## Overview

The backend deploys to **Google Cloud Run** as a Docker container.
It connects to **Cloud SQL (PostgreSQL)** via Unix socket,
reads secrets from **Secret Manager**, and publishes events to **Cloud Pub/Sub**.

## Environment Variables

| Variable | Description | Source |
|:--|:--|:--|
| `NODE_ENV` | `production` | Set in Cloud Run |
| `PORT` | `3000` (Cloud Run injects `$PORT`) | Cloud Run |
| `DATABASE_URL` | PostgreSQL connection string | Secret Manager |
| `FIREBASE_PROJECT_ID` | GCP project ID for Identity Platform | Secret Manager |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | Cloud Run service account |
| `ALLOW_LOCAL_AUTH` | `false` in production | Set in Cloud Run |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL | Secret Manager |

## Cloud SQL Connection

### Unix Socket (Production)

Cloud Run connects to Cloud SQL via the **Cloud SQL Auth Proxy** sidecar,
which mounts a Unix socket at `/cloudsql/<INSTANCE_CONNECTION_NAME>`.

**DATABASE_URL format for Unix socket:**
```
postgresql://USER:PASSWORD@localhost/DB_NAME?host=/cloudsql/PROJECT:REGION:INSTANCE
```

### Cloud Run Service Configuration

```bash
gcloud run deploy mbg-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --add-cloudsql-instances=PROJECT:REGION:INSTANCE \
  --set-secrets=DATABASE_URL=mbg-database-url:latest,FIREBASE_PROJECT_ID=mbg-firebase-project:latest,SLACK_WEBHOOK_URL=mbg-slack-webhook:latest \
  --set-env-vars=NODE_ENV=production,ALLOW_LOCAL_AUTH=false \
  --min-instances=1 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300
```

## Secret Manager Setup

Create the required secrets:

```bash
# Database URL (Cloud SQL Unix socket)
echo -n "postgresql://mbg_prod:STRONG_PASSWORD@localhost/media_buying_governance?host=/cloudsql/PROJECT:us-central1:mbg-db" | \
  gcloud secrets create mbg-database-url --data-file=-

# Firebase project ID
echo -n "your-gcp-project-id" | \
  gcloud secrets create mbg-firebase-project --data-file=-

# Slack webhook URL
echo -n "https://hooks.slack.com/services/T.../B.../..." | \
  gcloud secrets create mbg-slack-webhook --data-file=-
```

Grant the Cloud Run service account access:

```bash
gcloud secrets add-iam-policy-binding mbg-database-url \
  --member="serviceAccount:SERVICE_ACCOUNT@PROJECT.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Pub/Sub Topics

Create the required topic:

```bash
gcloud pubsub topics create rules-updated
gcloud pubsub subscriptions create rules-updated-sse \
  --topic=rules-updated \
  --ack-deadline=60
```

## Database Migrations

Run Prisma migrations against Cloud SQL before deploying:

```bash
# Connect via Cloud SQL Auth Proxy locally
cloud-sql-proxy PROJECT:us-central1:mbg-db &

# Run migrations
DATABASE_URL="postgresql://mbg_prod:PASSWORD@localhost:5432/media_buying_governance" \
  npx prisma migrate deploy
```

## Docker Build Test

To verify the Docker build locally:

```bash
# From the repository root (not packages/backend)
docker build -f packages/backend/Dockerfile -t mbg-backend .

# Test run
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://mbg_dev:dev_password_changeme@host.docker.internal:5432/media_buying_governance" \
  -e ALLOW_LOCAL_AUTH=true \
  -e PUBSUB_EMULATOR_HOST=host.docker.internal:8085 \
  mbg-backend
```

## Health Check

The application exposes `GET /healthz` which returns:
```json
{ "status": "ok", "timestamp": "2026-02-07T..." }
```

Cloud Run uses this for readiness probes.
