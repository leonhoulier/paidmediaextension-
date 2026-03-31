# Testing Guide: Phase 1 & 2 Validation

This guide walks through testing the telemetry infrastructure (Phase 1) and field validation infrastructure (Phase 2).

---

## Prerequisites

Before starting, ensure you have:
- [ ] Node.js 20+ installed
- [ ] Docker + Docker Compose installed
- [ ] Chrome browser installed
- [ ] All dependencies installed (`pnpm install` from root)

---

## Part 1: Build & Start Services

### Step 1.1: Build All Packages

```bash
# From project root
cd /Users/leonhoulier/media-buying-governance

# Build shared package first
cd packages/shared
pnpm build

# Build backend
cd ../backend
pnpm build

# Build extension (this includes our new telemetry code)
cd ../extension
pnpm build

# Verify extension dist exists
ls -la dist/
```

**Expected Output:**
```
dist/
├── manifest.json
├── service-worker.js
├── popup/
│   ├── popup.html
│   └── popup.js
├── content-scripts/
└── utils/
    └── telemetry.js  ← Our new file
```

### Step 1.2: Start Backend Services

```bash
# From project root
cd /Users/leonhoulier/media-buying-governance

# Start PostgreSQL + Pub/Sub emulator
docker-compose up -d

# Verify containers are running
docker ps

# Start backend API
cd packages/backend
pnpm dev

# Backend should start on http://localhost:3000
```

**Verify Backend:**
```bash
# In a new terminal, test health endpoint
curl http://localhost:3000/healthz
# Expected: {"status":"ok","timestamp":"..."}
```

### Step 1.3: Start Admin Portal (Optional)

```bash
# In a new terminal
cd /Users/leonhoulier/media-buying-governance/packages/admin-portal
pnpm dev

# Admin portal should start on http://localhost:5173
```

---

## Part 2: Load Extension in Chrome

### Step 2.1: Load Unpacked Extension

1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable **"Developer mode"** (toggle in top-right)
4. Click **"Load unpacked"**
5. Navigate to: `/Users/leonhoulier/media-buying-governance/packages/extension/dist`
6. Click **"Select"**

**Expected Result:**
- Extension appears in the list
- Name: "DLG Governance"
- Version: "1.0.0"
- Status: Enabled ✅

### Step 2.2: Verify Extension Loaded

1. Click the **Extensions icon** (puzzle piece) in Chrome toolbar
2. Find "DLG Governance" in the list
3. Pin it to toolbar (optional)
4. Click the extension icon

**Expected Result:**
- Popup opens
- Shows "Pairing View" (since not yet paired)

---

## Part 3: Test Phase 1 - Telemetry Infrastructure

### Test 3.1: Verify Telemetry Module Loaded

Open Chrome DevTools Console and check:

```bash
# 1. Open extension popup
# 2. Right-click popup → "Inspect"
# 3. Go to Console tab
# 4. Run:

// Check if telemetry module is available
import('/utils/telemetry.js').then(m => {
  console.log('Telemetry module loaded:', Object.keys(m));
});
```

**Expected Output:**
```
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

### Test 3.2: Initialize Telemetry Storage

In the same console:

```javascript
// Initialize SSE health metrics
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

### Test 3.3: Log Sample Field Extraction Telemetry

```javascript
import('/utils/telemetry.js').then(async (m) => {
  // Log a sample field extraction
  await m.logFieldExtraction({
    timestamp: Date.now(),
    field: 'campaign.name',
    strategyUsed: 'require',
    durationMs: 45.3,
  });

  // Log another one with DOM strategy
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

### Test 3.4: Log Sample Compliance Event Telemetry

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

### Test 3.5: Verify Popup Telemetry Dashboard

1. Close and reopen the extension popup
2. Look for the **"Selector Health"** section
3. Click **"Show"** to expand it

**Expected Result:**
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

✅ **Phase 1 Test 3.5 PASSED** if dashboard displays telemetry data!

### Test 3.6: Clear Telemetry

1. In the popup "Selector Health" section
2. Click **"Clear telemetry data"** button
3. Popup should show "Telemetry data cleared." message
4. Stats should reset to 0

**Expected Result:**
```
Success Rate: --
Total: 0
Failures: 0
```

✅ **Phase 1 Test 3.6 PASSED** if telemetry clears successfully!

---

## Part 4: Test Phase 1 - Backend Telemetry

### Test 4.1: Verify Pub/Sub Publish Telemetry

With backend running, trigger a rule update:

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

**Check Backend Logs:**

Look for telemetry logs in the backend terminal:
```
Published rule update message abc123 (version: def456, accounts: 1, latency: 45ms)
{
  event: 'pubsub_publish_success',
  messageId: 'abc123',
  version: 'def456',
  accountCount: 1,
  latencyMs: 45
}
```

✅ **Phase 1 Test 4.1 PASSED** if Pub/Sub telemetry logs appear!

### Test 4.2: Verify SSE Stream Health Monitoring

The backend should log SSE connection attempts. Since we haven't paired the extension yet, we won't see connections, but we can verify the controller is initialized.

**Check Backend Logs:**
```
SSE rules-stream subscription initialized
```

✅ **Phase 1 Test 4.2 PASSED** if SSE controller initialized!

---

## Part 5: Test Phase 1 - Real Field Extraction

Now let's test field extraction telemetry with a real Meta Ads Manager page (or mock fixture).

### Test 5.1: Navigate to Meta Ads Manager Mock Fixture

If you have a local test fixture:

```bash
# Create a simple HTML test page
cat > /tmp/meta-test.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
  <title>Meta Ads Manager Mock</title>
</head>
<body>
  <h1>Campaign Creation</h1>
  <input aria-label="Campaign name" type="text" value="Test Campaign 2026-Q1" />
  <input aria-label="Campaign objective: Traffic" type="radio" checked />
  <input aria-label="Budget value" type="text" value="100" />
</body>
</html>
EOF

# Open in Chrome
open -a "Google Chrome" /tmp/meta-test.html
```

### Test 5.2: Trigger Field Extraction

With the extension loaded and the test page open:

1. Open Chrome DevTools Console (F12)
2. Run field extraction:

```javascript
// This would normally be triggered by the extension
// For testing, we'll simulate it

// Check if extension content script is loaded
console.log('Testing field extraction...');

// Manually test selectors
const campaignNameInput = document.querySelector('input[aria-label*="Campaign name"]');
console.log('Campaign name field found:', campaignNameInput);
console.log('Campaign name value:', campaignNameInput?.value);
```

**Expected Output:**
```
Campaign name field found: <input aria-label="Campaign name" type="text" value="Test Campaign 2026-Q1">
Campaign name value: Test Campaign 2026-Q1
```

### Test 5.3: Check Telemetry After Extraction

After field extraction runs (either manually or via extension):

1. Open extension popup
2. Expand "Selector Health"
3. Verify telemetry shows extraction attempts

✅ **Phase 1 Test 5.3 PASSED** if telemetry increments!

---

## Part 6: Test Phase 2 - Field Validation Infrastructure

### Test 6.1: Verify Test Script Exists

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

✅ **Phase 2 Test 6.1 PASSED** if script exists and compiles!

### Test 6.2: Verify 18 Field Definitions

```bash
# Count field definitions in test script
grep -c "fieldPath:" tests/automated-field-validation.ts

# Should output: 18
```

**Expected Output:**
```
18
```

✅ **Phase 2 Test 6.2 PASSED** if 18 fields defined!

### Test 6.3: Verify High-Risk Fields Flagged

```bash
# Count high-risk fields
grep -c "highRisk: true" tests/automated-field-validation.ts

# Should output: 4
```

**Expected Output:**
```
4
```

✅ **Phase 2 Test 6.3 PASSED** if 4 high-risk fields flagged!

### Test 6.4: Verify TEST-RESULTS.md Template

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

✅ **Phase 2 Test 6.4 PASSED** if template exists!

### Test 6.5: Verify NPM Scripts

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

✅ **Phase 2 Test 6.5 PASSED** if scripts exist!

### Test 6.6: Verify Chrome MCP Setup Guide

```bash
cd /Users/leonhoulier/media-buying-governance/packages/extension

# Check if setup guide exists
ls -la CHROME-MCP-SETUP.md

# Check it has content
wc -l CHROME-MCP-SETUP.md
```

**Expected Output:**
```
CHROME-MCP-SETUP.md (file exists)
300+ lines
```

✅ **Phase 2 Test 6.6 PASSED** if setup guide exists!

---

## Part 7: Integration Test (Optional)

### Test 7.1: Pair Extension with Backend

1. Start backend and admin portal (if not already running)
2. Open admin portal: http://localhost:5173
3. Navigate to "Extension Pairing"
4. Generate a pairing code
5. Click extension icon → enter pairing code
6. Click "Connect Extension"

**Expected Result:**
- Popup switches from "Pairing View" to "Main View"
- Shows organization name
- Shows "Sync Status: Synced"

### Test 7.2: Create Rule and Verify SSE

1. In admin portal, create a new rule
2. Watch backend logs for Pub/Sub publish telemetry
3. Watch extension console for SSE message receipt
4. Check popup "Selector Health" → SSE Connection should show "Connected"

**Expected Backend Log:**
```
Published rule update message xyz789 (version: abc123, accounts: 1, latency: 35ms)
```

**Expected Extension Console:**
```
SSE message received: rules_updated
```

**Expected Popup:**
```
SSE Connection
  ├─ Status: Connected ✅
  ├─ Messages Received: 1
  └─ Avg Latency: 120ms
```

✅ **Integration Test PASSED** if rule updates flow through!

---

## Summary Checklist

### Phase 1: Telemetry Infrastructure

- [ ] **Test 3.1:** Telemetry module loads ✅
- [ ] **Test 3.2:** SSE health metrics initialize ✅
- [ ] **Test 3.3:** Field extraction telemetry logs ✅
- [ ] **Test 3.4:** Compliance event telemetry logs ✅
- [ ] **Test 3.5:** Popup dashboard displays telemetry ✅
- [ ] **Test 3.6:** Telemetry clears successfully ✅
- [ ] **Test 4.1:** Backend Pub/Sub telemetry logs ✅
- [ ] **Test 4.2:** SSE controller initializes ✅
- [ ] **Test 5.1-5.3:** Field extraction telemetry works ✅

**Phase 1 Result:** __ / 9 tests passed

### Phase 2: Testing Infrastructure

- [ ] **Test 6.1:** Test script exists and compiles ✅
- [ ] **Test 6.2:** 18 fields defined ✅
- [ ] **Test 6.3:** 4 high-risk fields flagged ✅
- [ ] **Test 6.4:** TEST-RESULTS.md template exists ✅
- [ ] **Test 6.5:** NPM scripts defined ✅
- [ ] **Test 6.6:** Chrome MCP setup guide exists ✅

**Phase 2 Result:** __ / 6 tests passed

### Integration Test (Optional)

- [ ] **Test 7.1:** Extension pairs with backend ✅
- [ ] **Test 7.2:** Rule updates flow through SSE ✅

**Integration Result:** __ / 2 tests passed

---

## Troubleshooting

### Issue: Extension doesn't load

**Solution:**
```bash
# Rebuild extension
cd packages/extension
pnpm build

# Check for build errors
ls -la dist/

# Reload extension in chrome://extensions/
```

### Issue: Telemetry module not found

**Solution:**
```bash
# Verify telemetry.ts was built
ls -la dist/utils/telemetry.js

# If missing, rebuild:
pnpm build
```

### Issue: Popup doesn't show telemetry

**Solution:**
1. Open popup inspector (right-click popup → Inspect)
2. Check Console for errors
3. Verify telemetry data exists in chrome.storage.local:

```javascript
chrome.storage.local.get(null, (data) => {
  console.log('Storage:', data);
});
```

### Issue: Backend telemetry logs don't appear

**Solution:**
1. Check backend is running: `curl http://localhost:3000/healthz`
2. Verify Pub/Sub emulator is running: `docker ps`
3. Check backend logs for errors
4. Restart backend: `pnpm dev`

---

## Next Steps After Testing

Once all tests pass:

1. **Document Results:**
   - Note which tests passed/failed
   - Take screenshots of popup telemetry dashboard
   - Save backend log excerpts

2. **Optional: Execute Phase 2 Automated Tests:**
   - Set up Chrome MCP (see CHROME-MCP-SETUP.md)
   - Run `pnpm test:meta-fields`
   - Review TEST-RESULTS.md

3. **Proceed to Phase 3:**
   - Start bridge hardening tasks
   - Implement token rotation
   - Add retry logic

---

*Testing Guide Generated: 2026-02-14*
