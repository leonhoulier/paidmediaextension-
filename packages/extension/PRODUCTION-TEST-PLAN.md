# Production Test Plan

Step-by-step instructions for testing the Media Buying Governance extension against the deployed production backend.

---

## Prerequisites

Before running these tests, ensure the following are complete:

- [ ] Production backend deployed and accessible at `https://mbg-backend-[HASH]-uc.a.run.app`
- [ ] Production backend health check returns 200: `curl https://mbg-backend-[HASH]-uc.a.run.app/healthz`
- [ ] Production admin portal deployed at CDN URL
- [ ] Firebase Auth configured for production domains
- [ ] First organization and admin user created via `seed-production.ts`
- [ ] Extension pairing token available (from seed script output)
- [ ] `.env.production` updated with actual backend and admin portal URLs
- [ ] Extension built with `pnpm build:prod`
- [ ] Extension loaded in Chrome via `chrome://extensions` > "Load unpacked" > select `dist/` directory

### Browser Setup

1. Open Chrome (version 120 or later)
2. Navigate to `chrome://extensions`
3. Enable "Developer mode" (top-right toggle)
4. Click "Load unpacked" and select `packages/extension/dist/`
5. Verify the extension appears with the name "Media Buying Governance"
6. Pin the extension to the toolbar for easy access

---

## Test 1: Extension Pairing

**Purpose:** Verify the extension can authenticate with the production backend.

| Step | Action | Expected Result |
|:--|:--|:--|
| 1 | Click the extension icon in Chrome toolbar | Popup opens showing "Not paired" state with pairing token input field |
| 2 | Enter the extension pairing token from `seed-production.ts` output | Token appears in the input field |
| 3 | Click "Connect" (or "Pair") button | Loading indicator appears briefly |
| 4 | Wait for pairing to complete | Popup transitions to "Connected" state |
| 5 | Verify popup shows organization name | Organization name from seed data is displayed |
| 6 | Verify popup shows admin email | Admin email from seed data is displayed |
| 7 | Verify popup shows sync status | "Last synced: [timestamp]" appears with a recent time |
| 8 | Open Chrome DevTools > Application > IndexedDB | IndexedDB database exists with cached rules |
| 9 | Expand the rules store in IndexedDB | Rules from the seed data are present |

**Failure recovery:** If pairing fails, check:
- Network tab for HTTP errors (401 = invalid token, 404 = wrong API URL)
- Console tab for CORS errors (backend must allow extension origin)
- `.env.production` has the correct `VITE_API_BASE_URL`

---

## Test 2: Rule Sync via SSE (Server-Sent Events)

**Purpose:** Verify real-time rule updates are pushed to the extension.

| Step | Action | Expected Result |
|:--|:--|:--|
| 1 | Open Chrome DevTools on any page with the extension active | DevTools opens |
| 2 | Go to Network tab, filter by "EventStream" or "eventsource" | SSE connection to `/api/v1/extension/rules-stream` is visible |
| 3 | Verify the SSE connection status is "open" | Connection shows status 200, type "eventsource" |
| 4 | Open the admin portal in a separate tab | Admin portal loads |
| 5 | Log in as the admin user | Admin dashboard appears |
| 6 | Create a new rule (e.g., naming convention rule for Meta) | Rule is saved successfully |
| 7 | Switch back to the tab with DevTools open | |
| 8 | Check Console for `rules_updated` event log | Log message confirms rule update received |
| 9 | Open Application > IndexedDB | |
| 10 | Verify the new rule appears in the cache | New rule is present with correct data |

---

## Test 3: Rule Sync via Polling Fallback

**Purpose:** Verify the extension falls back to polling when SSE is unavailable.

| Step | Action | Expected Result |
|:--|:--|:--|
| 1 | Open Chrome DevTools > Network tab | Network panel visible |
| 2 | Open Chrome DevTools > Console tab in a split view | Console visible alongside Network |
| 3 | Simulate SSE failure: throttle network to "Offline" in Network tab | Network goes offline |
| 4 | Wait 60 seconds (one polling interval) | Extension alarm fires |
| 5 | Check Console for polling fallback log messages | Log shows "SSE disconnected, falling back to polling" or similar |
| 6 | Set network back to "Online" | Network reconnects |
| 7 | Wait up to 30 seconds | SSE reconnection attempt occurs |
| 8 | Check Network tab for new EventSource connection | New SSE connection established |
| 9 | Check Console for reconnection log | Log confirms "SSE reconnected" or similar |

---

## Test 4: DOM Injection on Real Meta Ads Manager

**Purpose:** Verify the extension injects validation UI into the live Meta Ads Manager.

### Prerequisites for this test:
- You need an active Meta Ads Manager account with at least one ad account
- At least one naming convention rule and one budget rule should exist in the admin portal

| Step | Action | Expected Result |
|:--|:--|:--|
| 1 | Navigate to `https://adsmanager.facebook.com/` | Meta Ads Manager loads |
| 2 | Log in to your Meta Ads Manager account | Dashboard appears |
| 3 | Click "Create" to start a new campaign | Campaign creation flow opens |
| 4 | Open Chrome DevTools > Console | Console visible |
| 5 | Check Console for service worker injection log | Log shows "Injecting Meta adapter content script" or similar |
| 6 | Look for the Guidelines Sidebar | Floating panel appears on the right side of the page |
| 7 | Look for the Campaign Score widget | Circular progress ring appears (typically top-right corner) |
| 8 | Enter a campaign name that violates a naming convention rule (e.g., "test campaign") | |
| 9 | Check below the campaign name field | Red validation banner appears with naming template hint |
| 10 | Check the Guidelines Sidebar | Naming convention rule shows a red "FAIL" badge |
| 11 | Check the Campaign Score widget | Score decreases from 100 |
| 12 | Fix the campaign name to match the naming template | |
| 13 | Check below the campaign name field | Banner turns green with "Passed" message |
| 14 | Check the Guidelines Sidebar | Naming convention rule shows a green "PASS" badge |
| 15 | Check the Campaign Score widget | Score increases back toward 100 |

### Troubleshooting:
- If no UI elements appear, check that `optional_host_permissions` were granted (Chrome may prompt)
- If selectors fail, Meta may have updated their DOM. Check Console for selector errors and update via admin portal
- Check that the content script was actually injected by looking for `[MBG]` prefixed logs in Console

---

## Test 5: DOM Injection on Real Google Ads

**Purpose:** Verify the extension injects validation UI into the live Google Ads interface.

### Prerequisites for this test:
- You need an active Google Ads account
- At least one budget rule should exist in the admin portal (e.g., "Budget must be at least $100")

| Step | Action | Expected Result |
|:--|:--|:--|
| 1 | Navigate to `https://ads.google.com/` | Google Ads loads |
| 2 | Log in to your Google Ads account | Dashboard appears |
| 3 | Click "+ New campaign" to start campaign creation | Campaign creation wizard opens |
| 4 | Open Chrome DevTools > Console | Console visible |
| 5 | Check Console for service worker injection log | Log shows "Injecting Google adapter content script" or similar |
| 6 | Look for the Guidelines Sidebar | Floating panel appears |
| 7 | Look for the Campaign Score widget | Circular progress ring appears |
| 8 | Navigate to the budget step in the wizard | Budget input field visible |
| 9 | Enter a budget of $50 (below the $100 minimum rule) | |
| 10 | Check below the budget field | Red validation banner appears indicating budget is too low |
| 11 | Check the Guidelines Sidebar | Budget rule shows a red "FAIL" badge |
| 12 | Change the budget to $150 | |
| 13 | Check below the budget field | Banner turns green |
| 14 | Check the Guidelines Sidebar | Budget rule shows a green "PASS" badge |

---

## Test 6: Creation Blocker

**Purpose:** Verify the creation blocker prevents publishing campaigns with unmet blocking rules.

### Prerequisites:
- Create a rule in the admin portal with enforcement mode set to "blocking"

| Step | Action | Expected Result |
|:--|:--|:--|
| 1 | In the admin portal, create a blocking rule (e.g., "Campaign name must match template", enforcement: blocking) | Rule saved |
| 2 | Navigate to Meta Ads Manager campaign creation | Campaign creation flow opens |
| 3 | Enter a campaign name that violates the blocking rule | Red validation banner appears |
| 4 | Scroll to the "Publish" or "Create Campaign" button | |
| 5 | Observe the Publish button area | A semi-transparent overlay covers the button with a blocker modal |
| 6 | Read the blocker modal | Modal lists the unmet blocking rule with details |
| 7 | Attempt to click the "Publish" button behind the overlay | Click is blocked; nothing happens |
| 8 | Fix the campaign name to satisfy the rule | |
| 9 | Observe the Publish button area | Blocker overlay disappears; "Publish" button is clickable |

---

## Test 7: Comment Modal

**Purpose:** Verify the comment prompt requires justification before publishing.

### Prerequisites:
- Create a rule in the admin portal with `requireComment: true`

| Step | Action | Expected Result |
|:--|:--|:--|
| 1 | In the admin portal, create a comment-required rule | Rule saved |
| 2 | Navigate to Meta Ads Manager campaign creation | Campaign creation flow opens |
| 3 | Set up the campaign to trigger the comment-required rule | Rule applies to the campaign |
| 4 | Attempt to publish the campaign | Comment modal appears |
| 5 | Try to submit with an empty comment | Submit button is disabled or error message appears |
| 6 | Enter a comment shorter than 10 characters (e.g., "ok") | Submit button remains disabled or shows minimum length warning |
| 7 | Enter a valid comment (10+ characters, e.g., "Approved by manager for Q1 campaign") | Submit button becomes enabled |
| 8 | Click submit | Comment is saved; campaign publish proceeds |
| 9 | Open the admin portal compliance dashboard | Dashboard loads |
| 10 | Find the compliance event for this campaign | Event row is visible |
| 11 | Check the comment column/detail | Comment text matches what was entered |

---

## Test 8: Compliance Event Logging

**Purpose:** Verify that field changes and rule evaluations are logged to the backend.

| Step | Action | Expected Result |
|:--|:--|:--|
| 1 | Navigate to Meta Ads Manager campaign creation | Campaign creation flow opens |
| 2 | Open Chrome DevTools > Network tab | Network panel visible |
| 3 | Make several field changes: update campaign name, budget, targeting settings | Fields are modified |
| 4 | Wait 5 seconds (compliance events are debounced and batched) | |
| 5 | Filter Network tab for `compliance/events` | POST request to `/api/v1/compliance/events` appears |
| 6 | Click the request to inspect the payload | |
| 7 | Verify payload contains field values | `fieldName`, `fieldValue` properties are present |
| 8 | Verify payload contains rule pass/fail status | `ruleId`, `passed` properties are present for each evaluated rule |
| 9 | Verify response status is 200 or 201 | Backend accepted the events |
| 10 | Open the admin portal in a new tab | Admin portal loads |
| 11 | Log in and navigate to the compliance dashboard | Dashboard appears |
| 12 | Check the events table | Recent compliance events appear |
| 13 | Verify event details match what was logged | Field names, values, and rule statuses correspond to your actions |

---

## Test 9: Extension Disconnect and Reconnect

**Purpose:** Verify the extension can cleanly disconnect and re-pair.

| Step | Action | Expected Result |
|:--|:--|:--|
| 1 | Click the extension icon to open the popup | Popup shows "Connected" state |
| 2 | Click "Disconnect" button | Confirmation prompt may appear |
| 3 | Confirm disconnection | Popup transitions to "Not paired" state |
| 4 | Open Application > Chrome Storage > Local | Extension token is removed |
| 5 | Open Application > IndexedDB | Rule cache is cleared |
| 6 | Navigate to Meta Ads Manager | |
| 7 | Verify no validation UI is injected | No banners, sidebar, or score widget appear |
| 8 | Re-enter the pairing token and click "Connect" | Extension pairs again |
| 9 | Navigate to Meta Ads Manager | Validation UI reappears |

---

## Test 10: Cross-Tab Consistency

**Purpose:** Verify the extension works consistently across multiple tabs.

| Step | Action | Expected Result |
|:--|:--|:--|
| 1 | Open Meta Ads Manager in Tab 1 | Validation UI appears |
| 2 | Open Google Ads in Tab 2 | Validation UI appears |
| 3 | Open Meta Ads Manager in Tab 3 | Validation UI appears (independent instance) |
| 4 | Make changes in Tab 1 | Only Tab 1 UI updates; Tabs 2 and 3 are unaffected |
| 5 | Create a new rule in admin portal | |
| 6 | Switch to each tab and verify rule is available | All tabs reflect the updated rules after SSE/polling |

---

## Test Results Template

Record results for each test:

| Test | Status | Notes | Date | Tester |
|:--|:--|:--|:--|:--|
| 1. Extension Pairing | | | | |
| 2. Rule Sync (SSE) | | | | |
| 3. Rule Sync (Polling) | | | | |
| 4. Meta Ads Manager | | | | |
| 5. Google Ads | | | | |
| 6. Creation Blocker | | | | |
| 7. Comment Modal | | | | |
| 8. Compliance Events | | | | |
| 9. Disconnect/Reconnect | | | | |
| 10. Cross-Tab Consistency | | | | |

**Status values:** PASS, FAIL, BLOCKED (dependency not met), SKIPPED (not applicable)

---

## Known Limitations

1. **Selector fragility:** Meta Ads Manager and Google Ads frequently update their DOM structure. If validation UI does not appear, selectors may need updating. Check the Console for selector-related errors and refer to `SELECTOR-VALIDATION.md`.

2. **SSE connection limits:** Chrome limits the number of concurrent SSE connections per domain. If many tabs are open, some may fall back to polling.

3. **Service worker lifecycle:** Chrome may suspend the service worker after 5 minutes of inactivity. The extension uses alarms to keep the worker alive, but brief delays in injection are possible after long idle periods.

4. **Ad platform login requirements:** You must be logged into Meta Ads Manager or Google Ads for the extension to inject content scripts. The extension does not handle authentication for ad platforms.
