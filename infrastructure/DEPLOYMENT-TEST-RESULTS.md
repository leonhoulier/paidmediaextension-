# MBG Platform — Deployment Test Results

**Date:** __________ (YYYY-MM-DD)
**Deployed by:** __________
**GCP Project ID:** __________

---

## Environment Details

| Resource | Value |
|:--|:--|
| Backend URL | `https://mbg-backend-________-uc.a.run.app` |
| Admin Portal (Bucket) | `https://storage.googleapis.com/__________/index.html` |
| Admin Portal (CDN) | `http://__________` |
| Cloud SQL Instance | `__________:us-central1:mbg-postgres` |
| Backend Image Tag | `__________` |
| Terraform State | Applied / Not Applied |

---

## Infrastructure Verification

| Check | Status | Notes |
|:--|:--|:--|
| Cloud SQL instance state = RUNNABLE | [ ] Pass / [ ] Fail | |
| Cloud SQL private IP assigned | [ ] Pass / [ ] Fail | |
| VPC connector created | [ ] Pass / [ ] Fail | |
| Secret Manager: DATABASE_URL exists | [ ] Pass / [ ] Fail | |
| Secret Manager: FIREBASE_SERVICE_ACCOUNT exists | [ ] Pass / [ ] Fail | |
| Secret Manager: WEBHOOK_SIGNING_SECRET exists | [ ] Pass / [ ] Fail | |
| Pub/Sub topic: rules-updated exists | [ ] Pass / [ ] Fail | |
| Pub/Sub topic: compliance-events exists | [ ] Pass / [ ] Fail | |
| Artifact Registry repository created | [ ] Pass / [ ] Fail | |
| Cloud Storage bucket created | [ ] Pass / [ ] Fail | |
| CDN backend bucket + URL map created | [ ] Pass / [ ] Fail | |

---

## Backend API Tests

| Test | Status | Response | Notes |
|:--|:--|:--|:--|
| `GET /healthz` returns 200 | [ ] Pass / [ ] Fail | | |
| Health response has `status: "ok"` | [ ] Pass / [ ] Fail | | |
| `GET /api/v1/admin/accounts` with valid JWT returns 200 | [ ] Pass / [ ] Fail | | |
| `GET /api/v1/admin/accounts` without JWT returns 401 | [ ] Pass / [ ] Fail | | |
| `GET /api/v1/extension/rules` with extension token returns 200 | [ ] Pass / [ ] Fail | | |
| `GET /api/v1/extension/rules` without token returns 401 | [ ] Pass / [ ] Fail | | |
| Cloud Run logs are flowing to Cloud Logging | [ ] Pass / [ ] Fail | | |

---

## Admin Portal Tests

| Test | Status | Notes |
|:--|:--|:--|
| CDN URL loads index.html | [ ] Pass / [ ] Fail | |
| Static assets (JS/CSS) load with 200 | [ ] Pass / [ ] Fail | |
| No console errors on page load | [ ] Pass / [ ] Fail | |
| Firebase Auth sign-in button visible | [ ] Pass / [ ] Fail | |
| Google SSO sign-in succeeds | [ ] Pass / [ ] Fail | |
| `isLocalDev` is FALSE in production | [ ] Pass / [ ] Fail | |
| Redirect after sign-in works | [ ] Pass / [ ] Fail | |
| Cache-Control: index.html = no-cache | [ ] Pass / [ ] Fail | |
| Cache-Control: assets/ = immutable, 1yr | [ ] Pass / [ ] Fail | |

---

## Dashboard Tests

| Test | Status | Notes |
|:--|:--|:--|
| Dashboard page loads | [ ] Pass / [ ] Fail | |
| Stat cards display (0s for fresh DB) | [ ] Pass / [ ] Fail | |
| No API errors in Network tab | [ ] Pass / [ ] Fail | |

---

## Rules CRUD Tests

| Test | Status | Notes |
|:--|:--|:--|
| Rules list page loads | [ ] Pass / [ ] Fail | |
| Create new rule succeeds | [ ] Pass / [ ] Fail | |
| New rule appears in list | [ ] Pass / [ ] Fail | |
| Edit rule succeeds | [ ] Pass / [ ] Fail | |
| Delete rule succeeds | [ ] Pass / [ ] Fail | |
| Rule version history recorded | [ ] Pass / [ ] Fail | |

---

## Compliance Dashboard Tests

| Test | Status | Notes |
|:--|:--|:--|
| Compliance page loads at `/compliance` | [ ] Pass / [ ] Fail | |
| Charts render (show "No data" for fresh DB) | [ ] Pass / [ ] Fail | |
| Date range filter works | [ ] Pass / [ ] Fail | |

---

## Webhook Tests

| Test | Status | Notes |
|:--|:--|:--|
| Create webhook to webhook.site | [ ] Pass / [ ] Fail | |
| Trigger compliance event via API | [ ] Pass / [ ] Fail | |
| Webhook payload received at target | [ ] Pass / [ ] Fail | |
| Payload signature is valid (HMAC-SHA256) | [ ] Pass / [ ] Fail | |

---

## SSE Rules Stream Tests

| Test | Status | Notes |
|:--|:--|:--|
| Extension paired with production backend | [ ] Pass / [ ] Fail | |
| SSE connection established (Network tab) | [ ] Pass / [ ] Fail | |
| Update rule in admin portal | [ ] Pass / [ ] Fail | |
| Extension receives `rules_updated` event | [ ] Pass / [ ] Fail | |
| Extension cache invalidated | [ ] Pass / [ ] Fail | |

---

## Monitoring Tests

| Test | Status | Notes |
|:--|:--|:--|
| Uptime check is active | [ ] Pass / [ ] Fail | |
| Cloud Run logs visible in Cloud Logging | [ ] Pass / [ ] Fail | |
| Log-based metric for 5xx is created | [ ] Pass / [ ] Fail | |
| Alert policy for uptime is active | [ ] Pass / [ ] Fail | |
| Alert policy for 5xx errors is active | [ ] Pass / [ ] Fail | |
| Alert policy for Cloud SQL connections is active | [ ] Pass / [ ] Fail | |

---

## Performance Baseline

| Metric | Value | Notes |
|:--|:--|:--|
| `GET /healthz` latency (cold start) | _____ ms | First request after scale-to-zero |
| `GET /healthz` latency (warm) | _____ ms | Subsequent requests |
| `GET /api/v1/admin/rules` latency | _____ ms | With empty database |
| Admin portal initial load time | _____ s | Time to interactive (Lighthouse) |
| Admin portal bundle size (gzipped) | _____ KB | Total JS + CSS |

---

## Issues Found

| # | Severity | Description | Resolution |
|:--|:--|:--|:--|
| 1 | | | |
| 2 | | | |
| 3 | | | |

---

## Sign-off

| Role | Name | Date | Approved |
|:--|:--|:--|:--|
| Deployer | | | [ ] |
| QA | | | [ ] |
| Tech Lead | | | [ ] |

---

## Notes

_Add any additional notes, observations, or follow-up items here._
