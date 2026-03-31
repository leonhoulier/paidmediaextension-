# Comprehensive Testing Guide: Phases 1-6

**Document Version:** 1.0
**Last Updated:** 2026-02-14
**Purpose:** Complete testing protocol for validating telemetry, testing infrastructure, bridge hardening, and production readiness

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Phase 1: Telemetry Infrastructure Testing](#phase-1-telemetry-infrastructure-testing)
3. [Phase 2: Field Validation Testing](#phase-2-field-validation-testing)
4. [Phase 3: Bridge Hardening Testing](#phase-3-bridge-hardening-testing)
5. [Phase 4: Real-Time Update End-to-End Testing](#phase-4-real-time-update-end-to-end-testing)
6. [Phase 5: Load & Stress Testing](#phase-5-load--stress-testing)
7. [Phase 6: Production Readiness Checklist](#phase-6-production-readiness-checklist)
8. [Troubleshooting](#troubleshooting)
9. [Appendix: Quick Reference](#appendix-quick-reference)

---

## Prerequisites

### Required Software

- [ ] **Node.js 20+** - `node --version`
- [ ] **pnpm 8+** - `pnpm --version`
- [ ] **Docker Desktop** - `docker --version`
- [ ] **Chrome Browser** - Version 120+
- [ ] **Google Cloud CLI** (optional for production deploy)

### Build All Packages

```bash
cd /Users/leonhoulier/media-buying-governance

# Install dependencies
pnpm install

# Build shared package
cd packages/shared && pnpm build

# Build backend
cd ../backend && pnpm build

# Build extension
cd ../extension && pnpm build
```

### Start Services

```bash
# Terminal 1: Start Docker services (PostgreSQL, Pub/Sub emulator, Firebase emulator)
docker-compose up -d

# Verify containers running
docker ps

# Terminal 2: Start backend API
cd packages/backend
pnpm dev
# Backend should start on http://localhost:3000

# Terminal 3: Start admin portal
cd packages/admin-portal
pnpm dev
# Admin portal should start on http://localhost:5173
```

### Verify Services

```bash
# Check backend health
curl http://localhost:3000/healthz
# Expected: {"status":"ok","timestamp":"..."}

# Check admin portal
open http://localhost:5173
# Should show login page
```

### Load Extension in Chrome

1. Open Chrome → `chrome://extensions/`
2. Enable **"Developer mode"** (toggle in top-right)
3. Click **"Load unpacked"**
4. Navigate to: `/Users/leonhoulier/media-buying-governance/packages/extension/dist`
5. Click **"Select"**
6. Verify extension appears with:
   - Name: "DLG Governance"
   - Version: "1.0.0"
   - Status: Enabled ✅

---

## Phase 1: Telemetry Infrastructure Testing

**Goal:** Validate telemetry collection, storage, and display in popup dashboard.

### Test 1.1: Verify Telemetry Module Loads

**Location:** Extension popup console
**Method:** Manual

1. Click extension icon to open popup
2. Right-click popup → **"Inspect"**
3. Go to **Console** tab
4. Run:

```javascript
import('/utils/telemetry.js').then(m => {
  console.log('Telemetry module loaded:', Object.keys(m));
});
```

**Expected Output:**

```javascript
Telemetry module loaded: [
  'logFieldExtraction',
  'getFieldExtractionTelemetry',
  'getFieldExtractionStats',
  'initSSEHealthMetrics',
  'updateSSEHealthMetrics',
  'getSSEHealthMetrics',
  'recordSSEMessage',
  'logComplianceEvent',
  'getComplianceEventTelemetry',
  'getComplianceEventStats',
  'exportAllTelemetry',
  'clearAllTelemetry'
]
```

✅ **PASS:** All telemetry functions exported
❌ **FAIL:** Module not found or functions missing

---

### Test 1.2: Initialize SSE Health Metrics

**Location:** Extension popup console

```javascript
import('/utils/telemetry.js').then(async (m) => {
  await m.initSSEHealthMetrics();
  const health = await m.getSSEHealthMetrics();
  console.log('SSE Health Metrics:', health);
});
```

**Expected Output:**

```javascript
SSE Health Metrics: {
  state: 'disconnected',
  lastConnected: null,
  lastMessageReceived: null,
  reconnectAttempts: 0,
  messagesReceived: 0,
  averageLatencyMs: 0,
  cumulativeLatencyMs: 0
}
```

✅ **PASS:** Metrics initialized with default values
❌ **FAIL:** Error thrown or metrics null

---

### Test 1.3: Log Sample Field Extraction Telemetry

**Location:** Extension popup console

```javascript
import('/utils/telemetry.js').then(async (m) => {
  // Log require() extraction
  await m.logFieldExtraction({
    timestamp: Date.now(),
    field: 'campaign.name',
    strategyUsed: 'require',
    durationMs: 45.3,
  });

  // Log DOM extraction
  await m.logFieldExtraction({
    timestamp: Date.now(),
    field: 'campaign.objective',
    strategyUsed: 'dom',
    durationMs: 120.5,
  });

  // Get stats
  const stats = await m.getFieldExtractionStats();
  console.log('Field Extraction Stats:', stats);
});
```

**Expected Output:**

```javascript
Field Extraction Stats: {
  total: 2,
  byStrategy: {
    require: { count: 1, percentage: 50 },
    dom: { count: 1, percentage: 50 }
  },
  avgDurationMs: 82.9,
  failureRate: 0
}
```

✅ **PASS:** Stats calculated correctly
❌ **FAIL:** Incorrect counts or percentages

---

### Test 1.4: Log Sample Compliance Event Telemetry

**Location:** Extension popup console

```javascript
import('/utils/telemetry.js').then(async (m) => {
  // Log successful compliance event
  await m.logComplianceEvent({
    timestamp: Date.now(),
    success: true,
    eventCount: 5,
    statusCode: 200,
    retryAttempt: 0,
  });

  // Log failed compliance event
  await m.logComplianceEvent({
    timestamp: Date.now(),
    success: false,
    eventCount: 3,
    statusCode: 500,
    error: 'Internal Server Error',
    retryAttempt: 1,
  });

  // Get stats
  const stats = await m.getComplianceEventStats();
  console.log('Compliance Event Stats:', stats);
});
```

**Expected Output:**

```javascript
Compliance Event Stats: {
  total: 2,
  successCount: 1,
  failureCount: 1,
  successRate: 50,
  avgRetryAttempts: 0.5
}
```

✅ **PASS:** Stats show 50% success rate
❌ **FAIL:** Incorrect calculations

---

### Test 1.5: Popup Telemetry Dashboard Display

**Location:** Extension popup UI

1. Close and reopen the extension popup
2. Scroll down to **"Selector Health"** section
3. Click **"Show"** to expand

**Expected Display:**

```
Selector Health
  ├─ Success Rate: 100%
  ├─ Total: 2
  └─ Failures: 0

Field Extraction Strategy
  ├─ require: 1 (50.0%)
  └─ dom: 1 (50.0%)

SSE Connection
  ├─ Status: Disconnected
  ├─ Messages Received: 0
  └─ Avg Latency: 0ms

Compliance Events
  ├─ Success Rate: 50.0%
  └─ Total / Success / Failure: 2 / 1 / 1

Last 24 hours • Avg extraction: 83ms
```

✅ **PASS:** Dashboard displays telemetry data
❌ **FAIL:** Section not visible or data incorrect

---

### Test 1.6: Clear Telemetry Data

**Location:** Extension popup UI

1. In "Selector Health" section, click **"Clear telemetry data"** button
2. Verify message: "Telemetry data cleared."
3. Refresh popup and expand "Selector Health"

**Expected Display:**

```
Success Rate: --
Total: 0
Failures: 0
```

✅ **PASS:** All telemetry cleared
❌ **FAIL:** Data still present after clear

---

### Test 1.7: Backend Pub/Sub Telemetry

**Location:** Backend terminal logs
**Method:** Trigger rule update

```bash
# In a new terminal, create a test rule
curl -X POST http://localhost:3000/api/v1/admin/rules \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "test-org-123",
    "name": "Test Telemetry Rule",
    "description": "Testing Pub/Sub telemetry",
    "scope": "CAMPAIGN",
    "enforcementMode": "COMMENT_REQUIRED",
    "fieldPath": "campaign.name",
    "operator": "CONTAINS",
    "value": "test"
  }'
```

**Expected Backend Logs:**

```
Published rule update message abc123 (version: def456, accounts: 1, latency: 45ms, attempt: 1)
{
  event: 'pubsub_publish_success',
  messageId: 'abc123',
  version: 'def456',
  accountCount: 1,
  latencyMs: 45,
  attempt: 1
}
```

✅ **PASS:** Telemetry logs appear with metrics
❌ **FAIL:** No logs or missing fields

---

### Test 1.8: SSE Controller Initialization

**Location:** Backend terminal logs

**Expected Logs on Startup:**

```
SSE rules-stream subscription initialized
```

✅ **PASS:** SSE controller initialized
❌ **FAIL:** No SSE initialization log

---

## Phase 2: Field Validation Testing

**Goal:** Validate 18 core Meta Ads Manager field definitions and testing infrastructure.

### Test 2.1: Verify Test Script Exists

```bash
cd /Users/leonhoulier/media-buying-governance/packages/extension

# Check test script exists
ls -la tests/automated-field-validation.ts

# Check it compiles
npx tsc --noEmit tests/automated-field-validation.ts
```

**Expected Output:**

```
tests/automated-field-validation.ts (file exists)
(no TypeScript errors)
```

✅ **PASS:** Script exists and compiles
❌ **FAIL:** File not found or TypeScript errors

---

### Test 2.2: Count Field Definitions

```bash
# Count field definitions (should be 18)
grep -c "fieldPath:" tests/automated-field-validation.ts
```

**Expected Output:**

```
18
```

✅ **PASS:** 18 fields defined
❌ **FAIL:** Different count

---

### Test 2.3: Verify High-Risk Fields

```bash
# Count high-risk fields (should be 4)
grep -c "highRisk: true" tests/automated-field-validation.ts
```

**Expected Output:**

```
4
```

**High-Risk Fields:**

1. `campaign.budget_type` - Custom dropdown vs `<select>`
2. `campaign.budget_value` - type="text" vs type="number"
3. `ad_set.targeting.age_range` - Custom dropdown vs `<input type="number">`
4. `ad_set.targeting.custom_audiences` - No selector registry entry

✅ **PASS:** 4 high-risk fields flagged
❌ **FAIL:** Different count

---

### Test 2.4: Verify NPM Scripts

```bash
cd /Users/leonhoulier/media-buying-governance/packages/extension

# Check if scripts are defined
grep "test:meta-fields" package.json
grep "test:chrome-mcp" package.json
```

**Expected Output:**

```json
"test:meta-fields": "ts-node tests/automated-field-validation.ts",
"test:chrome-mcp": "echo 'Chrome MCP automated testing...'"
```

✅ **PASS:** Scripts exist
❌ **FAIL:** Scripts missing

---

### Test 2.5: Verify TEST-RESULTS.md Template

```bash
cd /Users/leonhoulier/media-buying-governance

# Check TEST-RESULTS.md exists
cat TEST-RESULTS.md | head -20
```

**Expected Output:**

```
# Meta Ads Manager Field Extraction Test Results

**Test Run Date:** Pending
**Total Fields Tested:** 18
...
```

✅ **PASS:** Template exists with 18-field checklist
❌ **FAIL:** File not found or incomplete

---

### Test 2.6: Verify Chrome MCP Setup Guide

```bash
cd /Users/leonhoulier/media-buying-governance/packages/extension

# Check if setup guide exists
ls -la CHROME-MCP-SETUP.md

# Check line count (should be 500+)
wc -l CHROME-MCP-SETUP.md
```

**Expected Output:**

```
CHROME-MCP-SETUP.md (file exists)
500+ lines
```

✅ **PASS:** Setup guide exists with comprehensive instructions
❌ **FAIL:** File missing or too short

---

## Phase 3: Bridge Hardening Testing

**Goal:** Validate token rotation, Pub/Sub retry, SSE reliability, and compliance event retry.

### Test 3.1: Database Schema Migration

**Location:** Backend terminal

```bash
cd /Users/leonhoulier/media-buying-governance/packages/backend

# Create migration
pnpm prisma migrate dev --name add-token-expiry-and-pubsub-failures

# Verify migration applied
pnpm prisma migrate status
```

**Expected Output:**

```
Migration '20260214_add-token-expiry-and-pubsub-failures' applied successfully
Database schema is up to date
```

✅ **PASS:** Migration created and applied
❌ **FAIL:** Migration failed or pending

---

### Test 3.2: Token Expiry Logic

**Location:** Backend (manual testing via console or unit test)

```typescript
// Example test in backend/src/extension/extension-token.service.spec.ts
describe('ExtensionTokenService', () => {
  it('should generate token with 90-day expiry', async () => {
    const { token, expiresAt } = await service.generateToken(userId);

    const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysUntilExpiry).toBeCloseTo(90, 0);
  });

  it('should reject expired tokens', async () => {
    // Create token with past expiry
    await prisma.user.update({
      where: { id: userId },
      data: {
        extensionToken: 'expired-token',
        tokenExpiresAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      },
    });

    await expect(service.validateToken('expired-token')).rejects.toThrow('Token has expired');
  });
});
```

✅ **PASS:** Token expiry validated correctly
❌ **FAIL:** Tokens accepted after expiry

---

### Test 3.3: Pub/Sub Retry Logic

**Location:** Backend terminal

**Test Scenario:** Simulate Pub/Sub emulator offline

```bash
# Stop Pub/Sub emulator
docker stop <pubsub-container-id>

# Trigger rule update (should fail and be stored)
curl -X POST http://localhost:3000/api/v1/admin/rules \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "test-org-123",
    "name": "Test Retry Rule",
    ...
  }'

# Check database for stored failure
docker exec -it <postgres-container-id> psql -U postgres -d media_buying_governance
SELECT * FROM pubsub_failures WHERE resolved_at IS NULL;
```

**Expected Database Row:**

```
id | topic          | message | attempts | last_error | created_at | resolved_at
---+----------------+---------+----------+------------+------------+------------
1  | rules-updated  | {...}   | 3        | ECONNREF... | 2026-02-14 | NULL
```

**Restart emulator and trigger background retry:**

```bash
# Restart Pub/Sub emulator
docker start <pubsub-container-id>

# Trigger retry job (manually or via scheduler)
curl -X POST http://localhost:3000/api/v1/admin/retry-pubsub-failures
```

**Expected Backend Logs:**

```
Successfully published previously failed message xyz789 (failure ID: 1, attempts: 3)
```

**Verify database:**

```sql
SELECT * FROM pubsub_failures WHERE id = 1;
```

**Expected:**

```
resolved_at: 2026-02-14 16:30:00
```

✅ **PASS:** Failed publish stored and retried successfully
❌ **FAIL:** Failure not stored or retry failed

---

### Test 3.4: SSE Sequence Tracking

**Location:** Extension service worker console

**Test Scenario:** Disconnect SSE, send message, reconnect, verify catch-up

1. Open extension service worker console:
   - `chrome://extensions/` → "DLG Governance" → "service worker" link
2. Monitor connection:

```javascript
// In service worker console
chrome.storage.local.get('sseHealthMetrics', (data) => {
  console.log('SSE Health:', data.sseHealthMetrics);
});
```

3. Simulate network drop:
   - Chrome DevTools → Network tab → Offline
   - Wait 5 seconds
   - Network tab → Online

**Expected Logs:**

```
SSE connection error: ...
Scheduling SSE reconnect in 1000ms (attempt 1/20)
Reconnecting with sequence catch-up from 42
SSE connection established
```

✅ **PASS:** SSE reconnects with sequence catch-up
❌ **FAIL:** No sequence tracking or missed messages

---

### Test 3.5: Heartbeat Timeout Detection

**Location:** Extension service worker console

**Test Scenario:** No heartbeat received for 45 seconds

1. Monitor SSE connection state
2. Simulate backend heartbeat failure:
   - Backend should send heartbeat every 30s
   - If no heartbeat for 45s, extension should force reconnect

**Expected Logs (after 45s of no heartbeat):**

```
SSE connection stale (no heartbeat received). Forcing reconnect.
```

✅ **PASS:** Stale connection detected and reconnected
❌ **FAIL:** No timeout detection

---

### Test 3.6: Reduced Reconnect Delay

**Location:** Extension service worker console

**Test:** Verify MAX_RECONNECT_DELAY_MS = 10,000 (10 seconds)

1. Trigger SSE error (disconnect network)
2. Monitor reconnection attempts
3. Verify delay caps at 10s (not 30s)

**Expected Logs:**

```
Scheduling SSE reconnect in 1000ms (attempt 1/20)
Scheduling SSE reconnect in 2000ms (attempt 2/20)
Scheduling SSE reconnect in 4000ms (attempt 3/20)
Scheduling SSE reconnect in 8000ms (attempt 4/20)
Scheduling SSE reconnect in 10000ms (attempt 5/20)  ← Capped at 10s
Scheduling SSE reconnect in 10000ms (attempt 6/20)  ← Stays at 10s
```

✅ **PASS:** Delay caps at 10 seconds
❌ **FAIL:** Delay exceeds 10 seconds

---

## Phase 4: Real-Time Update End-to-End Testing

**Goal:** Validate end-to-end rule update flow from admin portal to extension UI.

### Test 4.1: Happy Path - Rule Update Propagation

**Prerequisites:** Extension paired with backend

**Steps:**

1. **Admin Portal:** Create a new rule
   - Navigate to http://localhost:5173
   - Create a naming convention rule
   - Click "Save"

2. **Backend Logs:** Verify Pub/Sub publish

```
Published rule update message abc123 (version: def456, accounts: 1, latency: 35ms)
```

3. **Extension Console:** Verify SSE message receipt

```
SSE message received: rules_updated
Rules updated to version def456. Affected accounts: account-123
```

4. **Extension Popup:** Verify telemetry update
   - Open popup → Expand "Selector Health"
   - Check "SSE Connection" section:

```
Status: Connected ✅
Messages Received: 1
Avg Latency: 120ms
```

5. **Meta Ads Manager:** Verify validation update
   - Navigate to Meta Ads Manager
   - Change campaign name (should trigger validation with new rule)
   - Verify validation banner appears with new rule

**Success Criteria:**

- ✅ Rule update reaches extension in < 2 seconds
- ✅ Extension invalidates cache and re-fetches rules
- ✅ Validation loop runs with new rules
- ✅ No console errors

---

### Test 4.2: Failure Mode - SSE Disconnected

**Steps:**

1. Disconnect SSE:
   - Chrome DevTools → Network → Offline
2. Update rule in admin portal (while offline)
3. Reconnect:
   - Network → Online
4. Wait for SSE reconnection (should happen within 10s)
5. Verify rules updated

**Expected Behavior:**

- Extension reconnects within 10s
- Catches up on missed message (sequence tracking)
- Rules updated successfully

✅ **PASS:** Rules eventually delivered
❌ **FAIL:** Update lost or delayed > 60s

---

### Test 4.3: Failure Mode - Pub/Sub Offline

**Steps:**

1. Stop Pub/Sub emulator: `docker stop <pubsub-container-id>`
2. Update rule in admin portal
3. Verify failure stored in `pubsub_failures` table
4. Restart emulator: `docker start <pubsub-container-id>`
5. Trigger retry: `curl -X POST http://localhost:3000/api/v1/admin/retry-pubsub-failures`
6. Verify message delivered to extension

**Expected Behavior:**

- Failed publish stored in database
- Retry job succeeds after emulator restart
- Extension receives update

✅ **PASS:** Retry mechanism works
❌ **FAIL:** Update lost permanently

---

### Test 4.4: Latency Measurement

**Goal:** Measure time from "Save" click to UI update

**Steps:**

1. Open browser DevTools → Performance tab
2. Start recording
3. Click "Save" on rule in admin portal
4. Stop recording when validation banner updates
5. Measure time

**Success Criteria:**

- **p90:** < 2 seconds
- **p99:** < 5 seconds

✅ **PASS:** Latency within targets
❌ **FAIL:** Latency exceeds 5 seconds consistently

---

## Phase 5: Load & Stress Testing

**Goal:** Validate performance under realistic and extreme loads.

### Test 5.1: Field Extraction Performance

**Location:** Meta Ads Manager page + Extension console

**Test:** Measure `extractAllFieldValues()` execution time

1. Navigate to Meta Ads Manager campaign creation page
2. Open Chrome DevTools → Console
3. Run:

```javascript
// Trigger field extraction
const startTime = performance.now();
chrome.runtime.sendMessage({ type: 'extractAllFields' }, (response) => {
  const duration = performance.now() - startTime;
  console.log(`Extraction completed in ${duration}ms`);
  console.log(`Fields extracted: ${response.fields.length}`);
});
```

**Success Criteria:**

- **18 core DOM fields:** < 200ms
- **88 require() fields:** < 500ms
- **Slow machine (2x CPU slowdown):** < 1000ms

✅ **PASS:** Within performance targets
❌ **FAIL:** Extraction exceeds 1000ms

---

### Test 5.2: Validation Loop Performance

**Location:** Meta Ads Manager page

**Test:** Measure validation loop execution time

1. Load 50 rules in extension
2. Change campaign name field
3. Measure time from field change to UI update

**Success Criteria:**

- **Target:** < 300ms from field change to validation banner update

✅ **PASS:** Validation loop under 300ms
❌ **FAIL:** Latency exceeds 500ms

---

### Test 5.3: Memory Leak Test

**Location:** Chrome Task Manager

**Test:** Navigate through campaign creation flow 20 times

1. Open Chrome Task Manager (Shift + Esc)
2. Find "DLG Governance" extension process
3. Note initial memory usage
4. Navigate through campaign creation flow:
   - Create campaign → Delete → Create → Delete (repeat 20x)
5. Note final memory usage

**Success Criteria:**

- **Memory growth:** < 20% increase after 20 cycles
- **No unbounded growth:** Memory stabilizes

✅ **PASS:** Memory stable, no leaks
❌ **FAIL:** Memory grows unbounded

---

### Test 5.4: Backend SSE Concurrent Connections

**Location:** Load testing tool (k6 or similar)

**Test:** Simulate 100 concurrent SSE connections

```javascript
// k6 script: test-sse-connections.js
import { check } from 'k6';
import http from 'k6/http';

export const options = {
  vus: 100, // 100 virtual users
  duration: '30s',
};

export default function () {
  const res = http.get('http://localhost:3000/api/v1/extension/rules-stream?token=test-token', {
    headers: { Accept: 'text/event-stream' },
  });

  check(res, {
    'SSE connection opened': (r) => r.status === 200,
  });
}
```

**Run:**

```bash
k6 run test-sse-connections.js
```

**Success Criteria:**

- ✅ All 100 connections established
- ✅ Backend CPU < 50%
- ✅ Backend memory stable
- ✅ No connection drops

❌ **FAIL:** Connections fail or backend crashes

---

### Test 5.5: Rule Fetch Performance (Large Rule Sets)

**Location:** Backend API

**Test:** Create 200 rules, measure fetch latency

```bash
# Create 200 rules (script or manual)
for i in {1..200}; do
  curl -X POST http://localhost:3000/api/v1/admin/rules \
    -H "Content-Type: application/json" \
    -d '{ "name": "Rule '$i'", ... }'
done

# Measure fetch latency
time curl http://localhost:3000/api/v1/extension/rules?accountId=test-account
```

**Success Criteria:**

- **p50 latency:** < 50ms
- **p99 latency:** < 200ms
- **IndexedDB storage:** < 5MB

✅ **PASS:** Latency within targets
❌ **FAIL:** p99 exceeds 200ms

---

## Phase 6: Production Readiness Checklist

**Goal:** Final audits before production deployment.

### 6.1 Security Audit

- [ ] ✅ Extension tokens stored in `chrome.storage.local` (not `localStorage`)
- [ ] ✅ No tokens logged to console (audit all `logger` calls)
- [ ] ✅ CSP headers configured in `manifest.json`
- [ ] ✅ No `eval()` usage in ISOLATED world (only MAIN world via eval-bridge)
- [ ] ✅ Shadow DOM isolation prevents CSS injection
- [ ] ✅ Token expiry enforced (90 days)
- [ ] ✅ Token revocation endpoint functional
- [ ] ✅ Backend validates `tokenRevokedAt` and `tokenExpiresAt`

---

### 6.2 Performance Audit

- [ ] ✅ Field extraction < 500ms (measured in Test 5.1)
- [ ] ✅ Validation loop < 300ms (measured in Test 5.2)
- [ ] ✅ No memory leaks (measured in Test 5.3)
- [ ] ✅ IndexedDB usage < 5MB (typical org with 50 rules)
- [ ] ✅ Service worker size < 5MB (avoid Chrome limits)

---

### 6.3 Reliability Audit

- [ ] ✅ Token rotation implemented (Test 3.2)
- [ ] ✅ SSE reconnection works (Test 3.4)
- [ ] ✅ SSE heartbeat timeout detection (Test 3.5)
- [ ] ✅ Pub/Sub retries work (Test 3.3)
- [ ] ✅ Compliance events eventually deliver
- [ ] ✅ Polling fallback active (60s interval)
- [ ] ✅ Sequence tracking prevents missed messages

---

### 6.4 Observability Audit

- [ ] ✅ Telemetry captures field extraction failures (Test 1.3)
- [ ] ✅ SSE connection health visible in popup (Test 1.5)
- [ ] ✅ Backend logs include Pub/Sub message IDs (Test 1.7)
- [ ] ✅ Sentry error tracking active (production only)
- [ ] ✅ PostHog analytics tracks feature usage

---

### 6.5 Documentation Audit

- [ ] ✅ README.md includes setup instructions
- [ ] ✅ MANUAL-TEST-GUIDE.md matches testing protocols
- [ ] ✅ TEST-RESULTS.md includes validation results
- [ ] ✅ API documentation (OpenAPI/Swagger) up-to-date
- [ ] ✅ CHROME-MCP-SETUP.md comprehensive

---

### 6.6 Deployment Checklist

**Backend (Cloud Run):**

```bash
cd packages/backend

# Build Docker image
docker build -t gcr.io/PROJECT_ID/mbg-backend:latest .

# Push to GCR
docker push gcr.io/PROJECT_ID/mbg-backend:latest

# Deploy to Cloud Run
gcloud run deploy mbg-backend \
  --image gcr.io/PROJECT_ID/mbg-backend:latest \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL=$DATABASE_URL
```

**Admin Portal (Cloud Storage + CDN):**

```bash
cd packages/admin-portal

# Build production bundle
pnpm build

# Upload to Cloud Storage
gsutil -m rsync -r -d dist/ gs://mbg-admin-portal/
```

**Extension (Chrome Web Store):**

```bash
cd packages/extension

# Build production zip
pnpm build:prod

# Upload dist.zip to Chrome Web Store Developer Dashboard
```

---

## Troubleshooting

### Issue: Extension popup blank or not showing pairing form

**Cause:** CSS `display: none` not overridden properly

**Solution:**

```bash
cd packages/extension
pnpm build
# Reload extension in chrome://extensions/
```

**Verify fix:** Popup should show pairing form with input field and button.

---

### Issue: Telemetry module not found (Failed to fetch)

**Cause:** `dist/utils/telemetry.js` not built

**Solution:**

```bash
# Verify esbuild config includes utils entry point
grep -A5 "utilsConfig" esbuild.config.mjs

# Rebuild
pnpm build

# Verify file exists
ls -la dist/utils/telemetry.js
```

---

### Issue: SSE connection stuck in "connecting" state

**Cause:** Backend not running or token invalid

**Solution:**

1. Check backend running: `curl http://localhost:3000/healthz`
2. Check extension token: `chrome.storage.local.get('extensionToken', console.log)`
3. Check backend logs for SSE connection attempts
4. Verify token not expired/revoked in database

---

### Issue: Pub/Sub publish fails with ECONNREFUSED

**Cause:** Pub/Sub emulator not running

**Solution:**

```bash
# Check emulator running
docker ps | grep pubsub-emulator

# Restart if stopped
docker-compose up -d

# Verify PUBSUB_EMULATOR_HOST set
echo $PUBSUB_EMULATOR_HOST
# Expected: localhost:8085
```

---

### Issue: Rules not updating in extension after admin portal change

**Cause:** SSE disconnected or Pub/Sub publish failed

**Debug:**

1. Check backend logs for Pub/Sub publish success
2. Check extension console for SSE message receipt
3. Check "Selector Health" → SSE Connection status
4. Trigger manual refresh: Click "Force Refresh" in popup

---

## Appendix: Quick Reference

### Key File Locations

| Component | Path |
|-----------|------|
| Extension Telemetry | `packages/extension/src/utils/telemetry.ts` |
| SSE Sync | `packages/extension/src/sync/sse-sync.ts` |
| Pub/Sub Service | `packages/backend/src/pubsub/pubsub.service.ts` |
| Extension Token Service | `packages/backend/src/extension/extension-token.service.ts` |
| Database Schema | `packages/backend/prisma/schema.prisma` |
| Test Script | `packages/extension/tests/automated-field-validation.ts` |

### Important Constants

| Constant | Value | Location |
|----------|-------|----------|
| Token Validity | 90 days | `extension-token.service.ts` |
| Token Refresh Threshold | 7 days | `extension-token.service.ts` |
| SSE Reconnect Delay (max) | 10 seconds | `sse-sync.ts` |
| Heartbeat Timeout | 45 seconds | `sse-sync.ts` |
| Pub/Sub Max Retries | 3 | `pubsub.service.ts` |
| Polling Fallback Interval | 60 seconds | `sse-sync.ts` |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/extension/rules` | GET | Fetch rules for account |
| `/api/v1/extension/rules-stream` | GET | SSE stream for real-time updates |
| `/api/v1/extension/refresh-token` | POST | Refresh extension token |
| `/api/v1/admin/users/:userId/revoke-token` | POST | Revoke extension token |
| `/api/v1/admin/retry-pubsub-failures` | POST | Retry failed Pub/Sub publishes |
| `/healthz` | GET | Backend health check |

---

**End of Comprehensive Testing Guide**

*Generated on 2026-02-14 by Claude Code*
*Covers Phases 1-6 of Media Buying Governance Platform validation and hardening*
