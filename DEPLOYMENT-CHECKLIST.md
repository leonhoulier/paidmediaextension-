# Deployment Checklist

Use this checklist for every production deployment of the Media Buying Governance Platform.
Print or copy this checklist and check off each item as you complete it.

For full documentation, see [PRODUCTION.md](./PRODUCTION.md).

---

## Pre-Deployment Verification

### Code Quality

- [ ] All backend tests passing: `cd packages/backend && pnpm test` (318 tests)
- [ ] All extension tests passing: `cd packages/extension && pnpm test` (253 tests)
- [ ] All packages typecheck: `pnpm typecheck` (zero errors)
- [ ] All packages lint clean: `pnpm lint` (zero warnings)
- [ ] Shared package builds: `cd packages/shared && pnpm build`
- [ ] Backend builds: `cd packages/backend && pnpm build`
- [ ] Admin portal builds: `cd packages/admin-portal && pnpm build --mode production`
- [ ] Extension builds: `cd packages/extension && pnpm build`

### Configuration Files

- [ ] `infrastructure/terraform/terraform.tfvars` exists and has real values (not gitignored placeholders)
- [ ] `packages/admin-portal/.env.production` has real values (no `REPLACE_WITH_` prefixes)
- [ ] `packages/extension/.env.production` has real values (no `REPLACE_WITH_` prefixes)
- [ ] `VITE_FIREBASE_API_KEY` does NOT start with `fake-`
- [ ] `VITE_API_BASE_URL` uses `https://` and ends with `/api/v1` (admin portal)

---

## Credentials Needed

Gather all credentials before starting deployment. Document where each was obtained for team records.

### Terraform Variables (`terraform.tfvars`)

| Variable | Obtained? | Source |
|----------|-----------|--------|
| `project_id` | [ ] | GCP Console > Project picker |
| `db_password` | [ ] | Generate: `openssl rand -base64 32` |
| `alert_email` | [ ] | Team distribution list |
| `sentry_dsn` | [ ] | Sentry > Project Settings > Client Keys (DSN) |
| `posthog_api_key` | [ ] | PostHog > Settings > Project API Key |
| `splitio_api_key` | [ ] | Split.io > Admin Settings > API Keys (server-side) |

### Firebase Credentials

| Credential | Obtained? | Source |
|-----------|-----------|--------|
| Firebase Service Account JSON | [ ] | Firebase Console > Project Settings > Service Accounts > Generate new private key |
| Firebase API Key (frontend) | [ ] | Firebase Console > Project Settings > General > Web app config |
| Firebase Auth Domain | [ ] | Firebase Console > Project Settings > General > Web app config |
| Firebase Project ID | [ ] | Firebase Console > Project Settings > General |

### Frontend Instrumentation Keys

| Key | Obtained? | Source |
|-----|-----------|--------|
| Sentry DSN (frontend) | [ ] | Sentry > Project Settings > Client Keys (Browser JS project) |
| PostHog API Key (frontend) | [ ] | PostHog > Settings > Project API Key |
| PostHog Host | [ ] | Usually `https://us.i.posthog.com` |
| Split.io Client SDK Key | [ ] | Split.io > Admin Settings > API Keys (client-side) |

### Optional

| Credential | Obtained? | Source |
|-----------|-----------|--------|
| Slack Webhook URL | [ ] | Slack App > Incoming Webhooks |
| Custom domain SSL cert | [ ] | Certificate manager or Let's Encrypt |

---

## Deployment Sequence

Execute these steps in order. Do not proceed to the next step until the current one is verified.

### Phase 1: Infrastructure (Terraform)

- [ ] `cd infrastructure/terraform`
- [ ] `terraform init` completed successfully
- [ ] `terraform plan -out=tfplan` reviewed (expected ~25-30 resources)
- [ ] `terraform apply tfplan` completed successfully
- [ ] `terraform output` captured and recorded
- [ ] Backend URL recorded: `__________________________________`
- [ ] Admin portal bucket recorded: `__________________________________`
- [ ] Admin portal CDN IP recorded: `__________________________________`
- [ ] Cloud SQL connection name recorded: `__________________________________`

### Phase 2: Firebase Service Account

- [ ] Firebase service account JSON downloaded
- [ ] Secret added: `gcloud secrets versions add FIREBASE_SERVICE_ACCOUNT --data-file=...`
- [ ] Local copy of service account JSON deleted

### Phase 3: Backend Deployment

- [ ] `./infrastructure/deploy-backend.sh YOUR_PROJECT_ID` executed
- [ ] Docker image built successfully
- [ ] Image pushed to Artifact Registry
- [ ] Cloud Run service updated
- [ ] Database migrations applied
- [ ] Health check passed: `curl BACKEND_URL/healthz` returns 200

### Phase 4: Database Seed (First Deploy Only)

- [ ] Cloud SQL Proxy started
- [ ] `npx prisma db seed` completed
- [ ] Super admin user created
- [ ] Cloud SQL Proxy stopped

### Phase 5: Admin Portal Deployment

- [ ] `.env.production` updated with real values (backend URL from Phase 1)
- [ ] `./infrastructure/deploy-admin-portal.sh YOUR_PROJECT_ID` executed
- [ ] Build completed successfully
- [ ] Files uploaded to Cloud Storage
- [ ] Cache headers configured
- [ ] CDN cache invalidated

### Phase 6: Extension Build

- [ ] `.env.production` updated with real values (backend URL from Phase 1)
- [ ] `cd packages/extension && pnpm build:prod` completed
- [ ] `dist.zip` created for Chrome Web Store submission
- [ ] Extension tested locally as unpacked extension

### Phase 7: Firebase Auth Configuration

- [ ] Identity Platform API enabled
- [ ] Email/Password sign-in enabled
- [ ] Google sign-in enabled (if applicable)
- [ ] Authorized domains configured (admin portal CDN IP/domain)
- [ ] Initial super_admin user created in Firebase
- [ ] Super admin role assigned in database

---

## Post-Deployment Verification

### Backend Health

- [ ] `curl BACKEND_URL/healthz` returns `{"status":"ok",...}`
- [ ] `ALLOW_LOCAL_AUTH` is `false` in Cloud Run env vars
- [ ] Cloud Run logs show no errors: `gcloud run services logs read mbg-backend --limit=50`
- [ ] Sentry receives events (check Sentry dashboard)
- [ ] PostHog tracking active (check PostHog dashboard)

### Admin Portal

- [ ] Admin portal loads in browser at CDN URL
- [ ] Firebase login works (sign in as super_admin)
- [ ] Rules list page loads and shows seeded rules
- [ ] Create a test rule and verify it saves
- [ ] Organizations page accessible (super_admin only)
- [ ] Naming convention builder works
- [ ] Compliance dashboard renders

### Extension

- [ ] Extension installs as unpacked extension
- [ ] Extension icon appears in Chrome toolbar
- [ ] Navigate to Meta Ads Manager -- extension activates
- [ ] Navigate to Google Ads -- extension activates
- [ ] Extension fetches rules from production API
- [ ] Validation UI renders in ad platform forms

### Integration

- [ ] Create a rule in admin portal -- extension receives it within 30 seconds (SSE)
- [ ] Trigger a compliance event in extension -- appears in admin dashboard
- [ ] Approval workflow: submit rule -> approve -> verify status change

### Monitoring

- [ ] Uptime check active in GCP Monitoring
- [ ] Alert policies configured (email notifications)
- [ ] Cloud SQL connection count within limits
- [ ] No 5xx errors in Cloud Run logs

---

## Rollback Procedures

If issues are found after deployment:

### Quick Backend Rollback

```bash
# List recent images
gcloud artifacts docker images list \
  us-central1-docker.pkg.dev/PROJECT/mbg-images/mbg-backend \
  --sort-by=~CREATE_TIME --limit=5

# Roll back to previous image
gcloud run services update mbg-backend \
  --project=PROJECT_ID \
  --region=us-central1 \
  --image=us-central1-docker.pkg.dev/PROJECT/mbg-images/mbg-backend:PREVIOUS_TAG
```

### Quick Admin Portal Rollback

```bash
# Restore previous index.html from bucket versioning
gsutil ls -la gs://BUCKET/index.html
gsutil cp gs://BUCKET/index.html#PREVIOUS_VERSION gs://BUCKET/index.html

# Invalidate CDN
gcloud compute url-maps invalidate-cdn-cache mbg-admin-portal-urlmap \
  --path="/index.html" --project=PROJECT_ID
```

### Database Rollback

```bash
# Restore from automatic backup
gcloud sql backups list --instance=mbg-postgres --project=PROJECT_ID
gcloud sql backups restore BACKUP_ID --restore-instance=mbg-postgres
```

### Full Terraform Rollback

```bash
# If Terraform state is in GCS with versioning:
gsutil ls -la gs://STATE_BUCKET/terraform/state/
# Restore previous version and re-apply
```

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Deployer | | | |
| Reviewer | | | |
| Product Owner | | | |
