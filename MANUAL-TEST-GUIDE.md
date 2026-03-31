# Manual Test Guide -- Phase 2.5 Real Platform Validation

This guide walks through manually testing the DLG Governance extension on **real** Meta Ads Manager and Google Ads pages. The extension has passed 100% of mock fixture tests, but real ad platform UIs may differ from mocks due to A/B test variations, Shadow DOM, or different wizard flows.

**Goal:** Validate that the extension's DOM selectors, UI components, and governance logic work correctly on live ad platform pages.

**Time estimate:** 45-60 minutes (Meta: ~25 min, Google: ~25 min, edge cases: ~10 min)

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Extension Setup](#2-extension-setup)
3. [Meta Ads Manager Testing](#3-meta-ads-manager-testing)
4. [Google Ads Testing](#4-google-ads-testing)
5. [Selector Debug Mode Visual Inspection](#5-selector-debug-mode-visual-inspection)
6. [Recording Results](#6-recording-results)
7. [Edge Case Testing](#7-edge-case-testing)
8. [Quick Reference: All Field Paths](#8-quick-reference-all-field-paths)

---

## 1. Prerequisites

Before starting, make sure you have:

- [ ] **Chrome browser** (latest stable version, v120+)
- [ ] **Meta Ads Manager account** -- any account works, even a test/sandbox account (https://adsmanager.facebook.com/)
- [ ] **Google Ads account** -- any account works, even a test/sandbox account (https://ads.google.com/)
- [ ] **Local backend running** (required for rule sync and pairing)
- [ ] **Node.js 20+** and **pnpm 8+** installed
- [ ] Repository cloned at `/Users/leonhoulier/media-buying-governance/`

---

## 2. Extension Setup

### 2.1 Start the Local Backend

```bash
cd /Users/leonhoulier/media-buying-governance/packages/backend
pnpm dev
```

Verify it is running: open http://localhost:3000/healthz in your browser. You should see a 200 OK response.

### 2.2 Build the Extension

```bash
cd /Users/leonhoulier/media-buying-governance/packages/extension
pnpm build
```

This produces the extension bundle in:
```
/Users/leonhoulier/media-buying-governance/packages/extension/dist/
```

Verify the directory contains at minimum:
- `manifest.json`
- `service-worker.js`
- `popup/popup.html`
- `popup/popup.js`

### 2.3 Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the directory: `/Users/leonhoulier/media-buying-governance/packages/extension/dist/`
5. Verify:
   - [ ] Extension appears in the list with name **"DLG Governance"**
   - [ ] Version shows **1.0.0**
   - [ ] No error badge on the extension card

### 2.4 Grant Host Permissions

The extension uses `optional_host_permissions` for ad platform sites. You must grant them:

1. Click the extension card's **Details** button
2. Scroll to **Site access**
3. Ensure these domains are allowed:
   - `https://adsmanager.facebook.com/*`
   - `https://business.facebook.com/*`
   - `https://ads.google.com/*`

Alternatively, the permission prompt may appear automatically when you first visit one of these sites.

### 2.5 Pair the Extension

1. Click the extension icon in the Chrome toolbar (puzzle piece icon, then pin DLG Governance)
2. You should see the **pairing view** with an "Invite Code" input
3. Get the invite code from:
   - The backend seed data, OR
   - The Admin Portal at http://localhost:5173 under Settings > Extensions
4. Paste the invite code and click **Connect Extension**
5. Verify:
   - [ ] Success message: "Connected to [org name]"
   - [ ] Main view appears showing:
     - Organization name (e.g., "DLG")
     - Active Account (or "No active account" until you visit an ad platform)
     - Sync Status: "Synced at [timestamp]" with a green dot

### 2.6 Enable Selector Debug Mode

1. Click the extension icon to open the popup
2. Click the **Selector Debug Mode: OFF** button
3. The button text should change to **Selector Debug Mode: ON**
4. Navigate to an ad platform page -- you will see colored overlays:

| Overlay Color | Meaning |
|:-------------|:--------|
| **Green border + label** | Selector found the DOM element successfully |
| **Red floating banner** | Selector expected an element but could not find it |

> **Tip:** Keep Debug Mode ON throughout all testing. It provides instant visual feedback on selector health.

---

## 3. Meta Ads Manager Testing

**URL:** https://adsmanager.facebook.com/

### 3.1 Navigate to Campaign Creation

1. Log in to Meta Ads Manager
2. Click the **Campaigns** tab (left sidebar or top nav)
3. Click the **+ Create** button (green button, typically top-left area)
4. Select any campaign objective (e.g., "Awareness", "Traffic", "Sales")
5. Proceed to the campaign setup screen

> **Note:** Meta may show a simplified "Advantage+ Shopping Campaign" flow or a standard flow. Test whichever you see. If possible, test both by creating a second campaign.

### 3.2 Verify Extension Injection

On the campaign creation page, check:

- [ ] **Guidelines Sidebar:** A floating panel should appear on the right side of the page listing applicable rules
- [ ] **Campaign Score Widget:** A circular score indicator (0-100) should appear in the top-right corner of the page
- [ ] **Extension icon badge:** The DLG Governance icon in the toolbar should show an active state (colored badge)
- [ ] **Body attribute:** Open DevTools (F12), run `document.body.hasAttribute('governance-loaded')` in Console -- should return `true`

If none of these appear, check the Chrome extension console for errors:
1. Go to `chrome://extensions`
2. Click "Errors" on the DLG Governance card
3. Also check DevTools Console on the ad platform page for `[Governance]` prefixed logs

### 3.3 Test Campaign-Level Fields (5 fields)

For **each field** below, perform these checks:
1. Does Selector Debug Mode show a **green border** on the field element?
2. Does a **validation banner** appear near the field?
3. Change the field to a **non-compliant** value -- does the banner turn **red**?
4. Change the field to a **compliant** value -- does the banner turn **green**?
5. Does the **Guidelines Sidebar** update its pass/fail status?
6. Does the **Campaign Score** widget update its score?

#### campaign.name

| Property | Value |
|:---------|:------|
| **Expected selectors (priority order):** | `input[aria-label*="Campaign name"]` > `[data-testid*="campaign-name"] input` > heuristic: input near "Campaign name" label |
| **Risk level:** | LOW |
| **Test action:** | Type a campaign name that violates your naming convention rule |

#### campaign.objective

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[data-testid*="objective"]` > `[role="radiogroup"]` > text "Objective" in `<span>` |
| **Risk level:** | MEDIUM -- Meta A/B tests this UI frequently |
| **Test action:** | Select different objectives and verify the extension detects the change |
| **Known issue:** | The objective UI may be cards, a list, or a dropdown depending on A/B test variant |

#### campaign.budget_type

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[aria-label*="Budget type"]` > `[data-testid*="budget-type"]` > text "Daily budget\|Lifetime budget" in `<span>` > heuristic: `<select>` near "Budget" label |
| **Risk level:** | MEDIUM |
| **Test action:** | Toggle between Daily and Lifetime budget |
| **Known issue:** | Meta uses a custom dropdown (not native `<select>`). Heuristic fallback (strategy 4) targets `<select>` and will likely fail |

#### campaign.budget_value

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `input[aria-label*="Budget"][type="text"]` > `[data-testid*="budget-value"] input` > heuristic: `<input>` near "Budget" label |
| **Risk level:** | MEDIUM-HIGH |
| **Test action:** | Enter a budget below the minimum or above the maximum defined in your rules |
| **Known issue:** | The `type="text"` constraint on strategy 1 may fail if Meta uses `type="number"` or `inputmode="decimal"`. The remoteEval selector (`input[aria-label*="Budget"]`) does NOT have this constraint -- inconsistency |

#### campaign.cbo_enabled

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[aria-label*="Advantage"][aria-label*="campaign budget"]` > `[role="switch"][aria-label*="budget"]` > `[data-testid*="cbo"]` > heuristic: `<input>` near "Advantage+ campaign budget" text |
| **Risk level:** | MEDIUM |
| **Test action:** | Toggle the Advantage+ campaign budget (CBO) switch on/off |
| **Known issue:** | Heuristic (strategy 4) targets `<input>` but the real toggle is a `<div role="switch">` |

### 3.4 Test Ad Set-Level Fields (8 fields)

Click **Next** to proceed to the ad set setup screen.

#### ad_set.name

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `input[aria-label*="Ad set name"]` > `[data-testid*="adset-name"] input` > heuristic: input near "Ad set name" label |
| **Risk level:** | LOW |
| **Test action:** | Type an ad set name that violates the naming convention |

#### ad_set.targeting.geo_locations

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[aria-label*="Location"]` > `[data-testid*="location"]` > text "Locations" in `<span>` |
| **Risk level:** | MEDIUM-HIGH |
| **Test action:** | Add/remove locations, verify the extension detects changes |
| **Known issue:** | `[aria-label*="Location"]` is very broad -- may match unrelated elements. The getter looks for `.chip`, `.tag`, `[role="listitem"]` inside the container for selected locations |

#### ad_set.targeting.age_range

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[aria-label*="Age"]` > `[data-testid*="age-range"]` > text "Age" in `<span>` |
| **Risk level:** | MEDIUM |
| **Test action:** | Change the min/max age values |
| **Known issue:** | Meta typically uses custom dropdown selects, not native `<input>` or `<select>`. The mock uses `<input type="number">` which may not reflect the real DOM |

#### ad_set.targeting.genders

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[aria-label*="Gender"]` > `[data-testid*="gender"]` > text "Gender" in `<span>` |
| **Risk level:** | LOW-MEDIUM |
| **Test action:** | Select "Male", "Female", or "All" genders |

#### ad_set.targeting.languages

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[aria-label*="Language"]` > `[data-testid*="language"]` > text "Languages" in `<span>` |
| **Risk level:** | LOW-MEDIUM |
| **Test action:** | Add/remove languages |

#### ad_set.placements

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[aria-label*="Placement"]` > `[data-testid*="placement"]` > text "Placements" in `<span>` |
| **Risk level:** | MEDIUM |
| **Test action:** | Toggle between "Advantage+ placements" and "Manual placements" |

#### ad_set.schedule.start_date

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[aria-label*="Start date"]` > `[data-testid*="start-date"]` > heuristic: input near "Start date" label |
| **Risk level:** | LOW-MEDIUM |
| **Test action:** | Set a start date |

#### ad_set.schedule.end_date

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[aria-label*="End date"]` > `[data-testid*="end-date"]` > heuristic: input near "End date" label |
| **Risk level:** | LOW-MEDIUM |
| **Test action:** | Set an end date (or verify behavior if no end date is required) |

### 3.5 Test Ad-Level Fields (5 fields)

Click **Next** to proceed to the ad setup screen.

> **Note:** These fields are UNTESTED in mock fixtures. Expect a higher failure rate.

#### ad.name

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `input[aria-label*="Ad name"]` > `[data-testid*="ad-name"] input` > heuristic: input near "Ad name" label |
| **Risk level:** | LOW |

#### ad.creative.destination_url

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `input[aria-label*="Website URL"]` > `[data-testid*="destination-url"] input` > heuristic: input near "Website URL" label |
| **Risk level:** | LOW-MEDIUM |
| **Known issue:** | Meta's label may vary: "Website URL", "Destination", or "URL" depending on ad format |

#### ad.creative.cta_type

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[aria-label*="Call to action"]` > `[data-testid*="cta"]` > text "Call to action" in `<span>` |
| **Risk level:** | MEDIUM |
| **Known issue:** | CTA is a custom dropdown, not a native `<select>` |

#### ad.creative.page_id

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[aria-label*="Facebook Page"]` > `[data-testid*="page-selector"]` > text "Facebook Page" in `<span>` |
| **Risk level:** | MEDIUM |
| **Known issue:** | Meta may label this section "Identity" or "Page" without "Facebook Page" prefix |

#### ad_set.targeting.custom_audiences

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[data-testid*="custom-audience"]` > `[aria-label*="Custom audience"]` (direct DOM query in getter, NOT in selector registry) |
| **Risk level:** | HIGH |
| **Known issue:** | This field is NOT registered in META_FIELD_SELECTORS. The getter function queries the DOM directly. Debug Mode will NOT highlight this field. Test manually by inspecting DevTools |

### 3.6 Test Creation Blocker

1. Ensure at least one **blocking** rule is violated (red banner visible)
2. Scroll to the bottom of the page
3. Check:
   - [ ] Is the **Publish** (or **Next**) button disabled, overlaid, or intercepted?
   - [ ] Does a **blocker modal** appear listing all unmet blocking rules?
   - [ ] Fix the violation(s) -- does the blocker disappear and the button become clickable?

**Publish button selectors tried (in order):**
1. `button[type="submit"]`
2. `[data-testid*="publish"] button` or `[data-testid*="submit"] button`
3. Text "Publish" in `<button>`
4. Text "Next" in `<button>`

### 3.7 Test Comment Modal

If you have a `comment_required` enforcement rule configured:

1. With all blocking rules passing but a comment-required rule failing
2. Click **Publish**
3. Check:
   - [ ] Does a comment modal appear?
   - [ ] Does it require at least 10 characters?
   - [ ] After entering a comment, can you proceed?

### 3.8 Test Sidebar Toggle

1. Click the extension icon to open the popup
2. Click **Toggle Sidebar**
3. Check:
   - [ ] Does the sidebar disappear?
4. Click **Toggle Sidebar** again
5. Check:
   - [ ] Does the sidebar reappear?

### 3.9 Test Force Refresh

1. Click the extension icon
2. Click **Force Refresh**
3. Check:
   - [ ] Does the popup show "Refreshing..." then "Rules refreshed successfully."?
   - [ ] Do all validation banners re-render?
   - [ ] Does the Campaign Score recalculate?

---

## 4. Google Ads Testing

**URL:** https://ads.google.com/

### 4.1 Navigate to Campaign Creation

1. Log in to Google Ads
2. Click **+ New campaign** button
3. Select a campaign goal (e.g., "Sales", "Leads", "Website traffic")
4. Select a campaign type (e.g., "Search")
5. Proceed through the campaign setup wizard

> **Important:** Google Ads has TWO wizard flows:
> - **Smart campaigns** (simplified, fewer fields) -- accounts in "Smart mode"
> - **Standard campaigns** (full wizard with all fields) -- accounts in "Expert mode"
>
> If your account is in Smart mode, switch to Expert mode first (bottom of the Google Ads home page).

### 4.2 Verify Extension Injection

- [ ] **Guidelines Sidebar:** Visible on the right side?
- [ ] **Campaign Score Widget:** Visible in the top-right corner?
- [ ] **Extension active indicator:** Green badge on extension icon?
- [ ] **Body attribute:** `document.body.hasAttribute('governance-loaded')` returns `true`?

### 4.3 Test Campaign-Level Fields (9 fields)

Google Ads uses Angular with Material Design components. Key DOM patterns:
- `<material-input debugid="...">` wrapping standard `<input>` elements
- `[role="listbox"]` and `[role="radiogroup"]` for selection components
- Class-based selectors (`.budget-section`, `.location-targeting-panel`)
- Some components use **Shadow DOM** (noted per field below)

#### campaign.name

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `material-input[debugid="campaign-name"] input` > `material-input[debugid="ad-name"] input` > `input[name="campaign-name"]` > `input[aria-label*="Campaign name" i]` > `.campaign-name-section input` |
| **Risk level:** | LOW |
| **Test action:** | Enter a non-compliant campaign name |

#### campaign.type

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[debugid="campaign-type-selector"]` > `.campaign-type-selector [role="listbox"]` > `.campaign-type-section [role="radiogroup"]` > `[data-campaigntype]` > `.campaign-subtype-selector` |
| **Risk level:** | MEDIUM |
| **Known issue:** | Smart vs Standard campaigns use different wizard flows. Smart campaigns may skip this step entirely |

#### campaign.budget_value

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `material-input[debugid="budget-input"] input` > `input[aria-label*="Budget" i]` > `.budget-section input[type="number"]` > `.budget-section input[type="text"]` > `.budget-input input` |
| **Risk level:** | LOW |
| **Test action:** | Enter a budget below/above rule limits |

#### campaign.bidding_strategy

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `[debugid="bidding-strategy-selector"]` > `.bidding-strategy-section [role="listbox"]` > `.bidding-section .selected-strategy` > `[data-biddingstrategy]` > `.bidding-type-selector` |
| **Risk level:** | MEDIUM |
| **Known issue:** | Available strategies vary by campaign type |

#### campaign.geo_targets

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `.location-targeting-panel .selected-location` > `.location-targeting .location-item` > `.geo-targets-section .target-item` > `.locations-section .selected-item` > `[debugid="location-targeting"] .location-row` |
| **Risk level:** | HIGH |
| **Shadow DOM:** | YES -- location targeting may use Material autocomplete inside Shadow DOM |
| **Known issue:** | All selectors use speculative class names. These may not match the real Google Ads DOM |
| **Test action:** | Add/remove target locations |

#### campaign.languages

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `.language-targeting-section .selected-language` > `.language-section .language-item` > `[debugid="language-selector"] .selected-item` > `.languages-section .chip` > `.language-targeting .mat-chip` |
| **Risk level:** | MEDIUM |
| **Test action:** | Add/remove target languages |

#### campaign.brand_safety

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `.content-exclusion-section .excluded-category` > `.brand-safety-section .excluded-item` > `[debugid="content-exclusions"] .exclusion-item` > `.content-exclusions .selected-exclusion` > `.brand-safety .mat-chip` |
| **Risk level:** | MEDIUM-HIGH |
| **Known issue:** | This section is often hidden under "Additional settings" and requires expanding before elements exist in the DOM |

#### campaign.start_date

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `material-input[debugid="start-date"] input` > `input[aria-label*="Start date" i]` > `.start-date-section input` > `.schedule-section input[data-type="start"]` > `.date-range-picker input:first-of-type` |
| **Risk level:** | LOW-MEDIUM |

#### campaign.end_date

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `material-input[debugid="end-date"] input` > `input[aria-label*="End date" i]` > `.end-date-section input` > `.schedule-section input[data-type="end"]` > `.date-range-picker input:last-of-type` |
| **Risk level:** | LOW-MEDIUM |

### 4.4 Test Ad Group-Level Fields (2 fields)

Navigate to the Ad Groups step in the wizard.

> **Note:** These fields are UNTESTED in mock fixtures.

#### ad_group.name

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `material-input[debugid="ad-group-name"] input` > `input[aria-label*="Ad group name" i]` > `input[name="ad-group-name"]` > `.ad-group-name-section input` |
| **Risk level:** | LOW |

#### ad_group.cpc_bid

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `material-input[debugid="default-bid"] input` > `input[aria-label*="Default bid" i]` > `input[aria-label*="Max CPC" i]` > `.bid-section input[type="number"]` > `.bid-section input[type="text"]` > `.default-bid input` |
| **Risk level:** | LOW-MEDIUM |
| **Known issue:** | Label varies between "Default bid" and "Max CPC" depending on bidding strategy |

### 4.5 Test Ad-Level Fields (4 fields)

Navigate to the Ads step in the wizard.

> **Note:** All ad-level fields are UNTESTED in mock fixtures.

#### ad.headlines

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `material-input[debugid*="headline"] input` > `input[aria-label*="Headline" i]` > `.headline-input input` > `.ad-creative-section .headline input` > `.rsa-headline input` |
| **Risk level:** | MEDIUM |
| **Array field:** | YES -- multiple headline inputs (up to 15 for RSA) |

#### ad.descriptions

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `material-input[debugid*="description"] input` > `textarea[aria-label*="Description" i]` > `input[aria-label*="Description" i]` > `.description-input input` > `.ad-creative-section .description input` > `.rsa-description textarea` |
| **Risk level:** | MEDIUM |
| **Array field:** | YES -- multiple description inputs (up to 4 for RSA) |
| **Known issue:** | May use `<textarea>` instead of `<input>` |

#### ad.final_url

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `material-input[debugid="final-url"] input` > `input[aria-label*="Final URL" i]` > `input[name="final-url"]` > `.final-url-section input` > `.url-section input[type="url"]` > `.url-section input[type="text"]` |
| **Risk level:** | LOW-MEDIUM |

#### ad.display_path

| Property | Value |
|:---------|:------|
| **Expected selectors:** | `material-input[debugid*="display-path"] input` > `input[aria-label*="Display path" i]` > `input[aria-label*="Path" i]` > `.display-path-section input` > `.path-section input` |
| **Risk level:** | MEDIUM |
| **Array field:** | YES -- typically 2 path segments |
| **Known issue:** | Selector 3 (`[aria-label*="Path" i]`) is DANGEROUSLY BROAD -- may match unrelated inputs |

### 4.6 Test Wizard Step Navigation

Google Ads uses a multi-step wizard:

1. Navigate through all steps: Campaign settings -> Ad groups -> Ads -> Review
2. Check:
   - [ ] Do rules **update** as you move between steps?
   - [ ] On the **Review** step, are all rules evaluated (campaign + ad group + ad rules all visible)?
   - [ ] When going **back** to a previous step, do rules re-evaluate correctly?

### 4.7 Test Shadow DOM Handling

Many Google Ads fields use Material components that may render inside Shadow DOM:

1. Open DevTools (F12)
2. Inspect a Material input element (e.g., the campaign name input)
3. Check if it has a `shadowRoot`:
   ```js
   document.querySelector('material-input')?.shadowRoot
   ```
4. With Selector Debug Mode enabled:
   - [ ] Do green borders appear on Material component inputs?
   - [ ] If Shadow DOM is present, does the extension's `queryWithShadowDom()` function find elements inside shadow roots?

### 4.8 Test Creation Blocker (Google Ads)

Same process as Meta:
1. Violate a blocking rule
2. Navigate to the review/creation step
3. Check the Create/Submit button for blocker behavior

**Publish button selectors tried (in order):**
1. `button[type="submit"]`
2. `[data-test="create-button"]`
3. `.bottom-section button.primary`
4. `awsm-app-bar button.primary`

### 4.9 Test Sidebar Toggle (Google Ads)

Same process as Meta -- toggle from popup, verify sidebar shows/hides.

---

## 5. Selector Debug Mode Visual Inspection

With Selector Debug Mode enabled, perform a comprehensive visual scan:

### 5.1 Meta Ads Manager Scan

Navigate through all three levels (Campaign, Ad Set, Ad) and check:

- [ ] All 18 Meta field paths show **green borders** (selector found the element)
- [ ] No **red banners** appear (no expected elements are missing)
- [ ] If red banners appear, record which field paths failed

### 5.2 Google Ads Scan

Navigate through all wizard steps and check:

- [ ] All 15 Google field paths show **green borders**
- [ ] No **red banners** appear
- [ ] If red banners appear, record which field paths failed

### 5.3 What to Do When You See Red

If a field shows a **red banner** (selector failed):

1. **Open DevTools** (F12)
2. **Right-click the field** in the page and select **Inspect**
3. **Document the actual DOM structure:** Copy the outer HTML of the field and 2-3 parent containers
4. **Note these details:**
   - What tag name is the field element? (`<input>`, `<div>`, `<textarea>`, etc.)
   - Does it have an `aria-label`? What is the exact text?
   - Does it have a `data-testid`? What is the value?
   - Does it have a `debugid`? (Google Ads)
   - Is it inside a Shadow DOM? (`element.getRootNode()` returns a ShadowRoot?)
   - What is the nearest ancestor with a recognizable class or attribute?
5. **Paste all findings** into the [TEST-RESULTS.md](./TEST-RESULTS.md) template

---

## 6. Recording Results

Use the [TEST-RESULTS.md](./TEST-RESULTS.md) file to record all results. For each field:

1. Mark **Pass** or **Fail** in the Pass/Fail column
2. If failed, paste the **actual DOM HTML** in the "Actual DOM" column
3. Add any **notes** about the behavior

### Quick Pass/Fail Criteria

| Criteria | Pass | Fail |
|:---------|:-----|:-----|
| Selector Debug Mode shows green border | Yes | No border or red banner |
| Validation banner appears near the field | Yes | No banner appears |
| Validation banner updates on value change | Yes | No update |
| Sidebar reflects the rule result | Yes | Not listed or not updating |
| Campaign Score updates | Yes | Score stuck or absent |

### Using the Selector Health Panel

The popup includes a **Selector Health** section (collapsible). After testing:

1. Open the popup
2. Click **Selector Health > Show**
3. Review:
   - **Success rate:** Overall percentage of successful selector lookups
   - **Total:** Number of lookup attempts
   - **Failures:** Number of failed lookups
   - **Failing fields:** Which field paths consistently fail and on which platform

This data is the most reliable indicator of real-world selector health.

---

## 7. Edge Case Testing

### 7.1 Meta A/B Test Variations

Meta frequently A/B tests the campaign creation UI. If you notice the layout looks different from what you have seen before (e.g., cards vs. list for objectives, different budget section layout):

1. Record the variation you see
2. Check which selectors still work and which break
3. Note the A/B test variant in your results

### 7.2 Google Smart vs Standard Campaigns

1. **Standard campaign:** Should show all field steps. Test as described above.
2. **Smart campaign:** May skip campaign type selection and ad group steps. Check:
   - [ ] Does the extension handle the reduced wizard gracefully (no errors)?
   - [ ] Do applicable rules still evaluate on the fields that ARE present?

### 7.3 Multi-Tab Sync

1. Open Meta Ads Manager campaign creation in **Tab 1**
2. Open Google Ads campaign creation in **Tab 2**
3. Check:
   - [ ] Both tabs show the Guidelines Sidebar and Campaign Score independently?
   - [ ] Switching between tabs does not cause errors?
   - [ ] Force Refresh from the popup updates the active tab only?

### 7.4 Disconnect and Reconnect SSE

1. Stop the backend (`Ctrl+C` in the backend terminal)
2. Wait 10 seconds
3. Check:
   - [ ] Extension popup shows a sync error (red dot)?
   - [ ] Extension does not crash -- existing rules continue to evaluate?
4. Restart the backend (`pnpm dev`)
5. Click **Force Refresh** in the popup
6. Check:
   - [ ] Sync status returns to green?
   - [ ] Rules re-evaluate correctly?

### 7.5 Page Navigation Within Ad Platform

1. Start campaign creation
2. Navigate away (e.g., click "Campaigns" to go back to the list)
3. Navigate back to campaign creation (create a new campaign)
4. Check:
   - [ ] Extension re-injects correctly (new `governance-loaded` attribute)?
   - [ ] No duplicate sidebars or score widgets?
   - [ ] Rules evaluate fresh on the new page?

---

## 8. Quick Reference: All Field Paths

### Meta Ads Manager (18 fields)

| # | Field Path | Level | Risk |
|:-:|:-----------|:------|:-----|
| 1 | `campaign.name` | Campaign | LOW |
| 2 | `campaign.objective` | Campaign | MEDIUM |
| 3 | `campaign.budget_type` | Campaign | MEDIUM |
| 4 | `campaign.budget_value` | Campaign | MEDIUM-HIGH |
| 5 | `campaign.cbo_enabled` | Campaign | MEDIUM |
| 6 | `ad_set.name` | Ad Set | LOW |
| 7 | `ad_set.targeting.geo_locations` | Ad Set | MEDIUM-HIGH |
| 8 | `ad_set.targeting.age_range` | Ad Set | MEDIUM |
| 9 | `ad_set.targeting.genders` | Ad Set | LOW-MEDIUM |
| 10 | `ad_set.targeting.languages` | Ad Set | LOW-MEDIUM |
| 11 | `ad_set.targeting.custom_audiences` | Ad Set | HIGH |
| 12 | `ad_set.placements` | Ad Set | MEDIUM |
| 13 | `ad_set.schedule.start_date` | Ad Set | LOW-MEDIUM |
| 14 | `ad_set.schedule.end_date` | Ad Set | LOW-MEDIUM |
| 15 | `ad.name` | Ad | LOW |
| 16 | `ad.creative.destination_url` | Ad | LOW-MEDIUM |
| 17 | `ad.creative.cta_type` | Ad | MEDIUM |
| 18 | `ad.creative.page_id` | Ad | MEDIUM |

### Google Ads (15 fields)

| # | Field Path | Level | Risk |
|:-:|:-----------|:------|:-----|
| 1 | `campaign.name` | Campaign | LOW |
| 2 | `campaign.type` | Campaign | MEDIUM |
| 3 | `campaign.budget_value` | Campaign | LOW |
| 4 | `campaign.bidding_strategy` | Campaign | MEDIUM |
| 5 | `campaign.geo_targets` | Campaign | HIGH |
| 6 | `campaign.languages` | Campaign | MEDIUM |
| 7 | `campaign.brand_safety` | Campaign | MEDIUM-HIGH |
| 8 | `campaign.start_date` | Campaign | LOW-MEDIUM |
| 9 | `campaign.end_date` | Campaign | LOW-MEDIUM |
| 10 | `ad_group.name` | Ad Group | LOW |
| 11 | `ad_group.cpc_bid` | Ad Group | LOW-MEDIUM |
| 12 | `ad.headlines` | Ad | MEDIUM |
| 13 | `ad.descriptions` | Ad | MEDIUM |
| 14 | `ad.final_url` | Ad | LOW-MEDIUM |
| 15 | `ad.display_path` | Ad | MEDIUM |

**Total fields: 33**

---

## Decision Framework

After completing all tests, use this framework:

| Pass Rate | Action |
|:----------|:-------|
| **95%+** (31+ of 33) | Excellent. Proceed to deployment. |
| **70-95%** (23-31 of 33) | Good. Deploy with a backlog for Phase 3 hardening. |
| **50-70%** (17-23 of 33) | Moderate. Phase 2.75 hardening sprint needed before deployment. |
| **<50%** (fewer than 17) | Significant rework needed. Delay deployment. |

Focus on **HIGH** and **MEDIUM-HIGH** risk fields first -- these are the most likely to fail and the most impactful to fix.
