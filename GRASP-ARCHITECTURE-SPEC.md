# Grasp v26.203.2 — Architecture Specification (Reverse-Engineered)

**Date:** February 8, 2026
**Source:** Grasp Chrome Extension v26.203.2 (installed from Chrome Web Store)
**Analysis By:** DLG Competitive Intelligence
**Purpose:** Reference architecture for DLG Media Buying Governance Platform development
**Companion Document:** GRASP-COMPETITIVE-ANALYSIS.md (rule catalog + field mapping)

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Product Overview](#2-product-overview)
3. [Tech Stack](#3-tech-stack)
4. [Extension Architecture](#4-extension-architecture)
5. [Service Worker & Injection Flow](#5-service-worker--injection-flow)
6. [eval.js — MAIN World Bridge](#6-evaljs--main-world-bridge)
7. [Communication Protocol](#7-communication-protocol)
8. [Facebook/Meta Adapter (Deep Dive)](#8-facebookmeta-adapter-deep-dive)
9. [Platform Support (56 Platforms)](#9-platform-support-56-platforms)
10. [CSS & UI Injection Strategy](#10-css--ui-injection-strategy)
11. [API & Backend Architecture](#11-api--backend-architecture)
12. [Anti-Detection Mechanisms](#12-anti-detection-mechanisms)
13. [Campaign Creation (Programmatic)](#13-campaign-creation-programmatic)
14. [Vuex State Management (Facebook)](#14-vuex-state-management-facebook)
15. [Comparison: Grasp vs DLG Architecture](#15-comparison-grasp-vs-dlg-architecture)

---

## 1. Executive Summary

Grasp is a mature media buying governance SaaS product (Chrome extension + web admin portal) supporting 56 advertising platforms. Their Chrome extension (v26.203.2, 6.7MB, 289 files) uses Vue 3 + Quasar Framework for its UI, injected directly into platform DOMs without Shadow DOM. For Meta/Facebook specifically, Grasp bypasses DOM selectors entirely by leveraging Facebook's internal `require()` module system and React Context selectors — reading campaign data directly from React's in-memory state. Grasp also programmatically CREATES campaigns via Facebook's internal AdsGraphAPI, going far beyond passive validation.

Key quantitative metrics:
- 56 supported advertising platforms
- 289 files, 6.7MB total extension size
- 88 governance rules for Facebook alone
- 9 Facebook internal require() modules accessed
- 35 Vuex mutations, 40+ getters for Facebook state
- Only 3 querySelector calls in their Facebook module (vs DLG's 124)

---

## 2. Product Overview

Grasp positions itself as a "media buying governance" platform that overlays configurable validation rules on top of advertising platform UIs. Key capabilities:

- **Validation/Governance:** Real-time rule enforcement during campaign creation/editing across 56 platforms
- **Naming Conventions:** Template-based naming enforcement at campaign, adset, ad, audience, and instant form levels
- **Budget Controls:** Budget caps, confirmation dialogs, CBO enforcement, spending limits
- **Targeting Governance:** Geo-targeting requirements, audience inclusion/exclusion, placement controls
- **Media Plan Integration:** Links campaigns to pre-defined media plans, enforces budget and date alignment
- **Campaign Creation:** Programmatically creates campaigns on Facebook using internal APIs (not just validation)
- **Multi-Platform:** 56 platforms from social to programmatic to retail media
- **Second Approver:** Workflow for requiring a second team member to approve before publish
- **i18n:** Full internationalization (398KB translation file)

---

## 3. Tech Stack

### 3.1 Extension Frontend
| Component | Technology | Details |
|:--|:--|:--|
| UI Framework | Vue 3 | Composition API + Options API mix |
| State Management | Vuex | Per-platform stores (Facebook has 35 mutations, 40+ getters) |
| Component Library | Quasar Framework | Extensive component set, Material Design-inspired |
| Build System | Likely Vite or Webpack | Minified output, code-split per platform |
| Language | TypeScript → JavaScript | Minified production builds |

### 3.2 Extension Infrastructure
| Component | Technology | Details |
|:--|:--|:--|
| Manifest | V3 | Empty content_scripts array (dynamic injection) |
| Authentication | Amazon Cognito | OAuth2, eu-west-1 region |
| API Client | Axios + tRPC | Type-safe RPC communication |
| Data Fetching | TanStack Vue Query | Caching, refetching, optimistic updates |
| Schema Validation | Zod | Runtime type validation |
| Analytics | PostHog | Token: `phc_dEVeNGTkgS94ngtmbIMMeDa82WHsJ7KgvzlU3BVFwmL` |
| Feature Flags | Split.io | Org: `org_graspgraspgraspgras2` |
| Error Tracking | Sentry | Production error monitoring |
| Observability | OpenTelemetry | Distributed tracing |
| i18n | vue-i18n | 398KB translation file |
| Fonts | Fira Sans (4 weights) + Material Icons | Injected via style element |

### 3.3 External Libraries (75 files, 1.6MB in js/external/)
Key dependencies: Vue 3, Vuex, Quasar, Axios, tRPC client, TanStack Vue Query, Zod, Amazon Cognito SDK, Sentry, PostHog, Split.io, date-fns, lodash-es, rxjs, etc.

---

## 4. Extension Architecture

### 4.1 File Structure Overview
```
grasp-extension/ (289 files, 6.7MB)
├── manifest.json                          # MV3 manifest
├── is-loaded.js                           # Guard script (~50 bytes)
├── js/
│   ├── background.js                      # Service worker (~4KB minified)
│   ├── eval.js                            # MAIN world bridge (~18KB)
│   ├── content-script-inject.js           # Eval.js injector (~335 bytes)
│   ├── inject-fonts.js                    # Font injection
│   ├── load-content-script-*-app.js       # 56 platform loaders (identical template)
│   ├── content-script-*-app.js            # 57 platform-specific adapters
│   ├── services/
│   │   ├── platforms.js                   # Platform definitions (12KB, 56 platforms)
│   │   ├── config.js                      # API endpoints + credentials (1.6KB)
│   │   ├── auth.js                        # Cognito auth (3.8KB)
│   │   └── api.js                         # Axios client (3.8KB)
│   ├── lib/
│   │   ├── core/loop.js                   # Main validation engine (61KB)
│   │   ├── core/guidelines.js             # Pre-compiled rules (120KB)
│   │   └── web/translations.js            # i18n (398KB)
│   └── external/                          # 75 vendor files (1.6MB)
└── css/
    ├── content-script-*-app.css           # 50 platform-specific CSS files
    ├── dv360.css                          # 458KB (largest)
    └── prisma.css                         # 464KB (largest)
```

### 4.2 Manifest V3 Configuration
```json
{
  "manifest_version": 3,
  "permissions": ["scripting"],
  "optional_permissions": ["tabs", "storage", "webNavigation"],
  "optional_host_permissions": ["http://*/*", "https://*/*"],
  "content_scripts": [],
  "externally_connectable": {
    "matches": ["https://*.grasp.gg/*"]
  },
  "background": {
    "service_worker": "js/background.js"
  }
}
```

Key design decisions:
- **Empty content_scripts array** — ALL injection is dynamic via `chrome.scripting.executeScript()`
- **Optional permissions model** — requests host_permissions per-platform on demand
- **externally_connectable** limited to `*.grasp.gg` — only Grasp's own web app can send messages
- **No declarative_net_request** — no network modification needed

### 4.3 Injection Flow (Per-Platform)
```
1. chrome.webNavigation.onCompleted fires for URL match
2. Service worker checks Split.io feature flag ("ActiveExtension")
3. Executes is-loaded.js to check if already injected
4. If not loaded: injects load-content-script-{platform}-app.js
5. Loader imports content-script-inject.js (creates <script id="grasp-inject"> for eval.js)
6. Loader imports content-script-{platform}-app.js (Vue app)
7. Platform adapter initializes, mounts Vue components via Teleport
8. Validation loop begins
```

---

## 5. Service Worker & Injection Flow

### 5.1 Platform Detection
The service worker uses `chrome.webNavigation.onCompleted` (not just `chrome.tabs.onUpdated`) for reliable detection. Platform matching is defined in `js/services/platforms.js` (12KB) with regex patterns for all 56 platforms.

Detection pattern: URL regex match → permission check → feature flag check → injection

### 5.2 is-loaded Guard
```javascript
// is-loaded.js (~50 bytes)
body.hasAttribute('grasp-loaded') ? 'loaded' : body.setAttribute('grasp-loaded', '')
```
Prevents double-injection if the service worker fires multiple times.

### 5.3 Dynamic Injection
```javascript
chrome.scripting.executeScript({
  target: { tabId },
  files: ['js/load-content-script-{platform}-app.js'],
  injectImmediately: true,  // Critical: don't wait for DOMContentLoaded
  world: 'ISOLATED'         // Content script runs in isolated world
})
```

The `injectImmediately: true` flag ensures Grasp's scripts load as early as possible, before the platform's own JavaScript may alter the page.

### 5.4 Frame-Based Injection
For iframe-heavy platforms (SFMC, etc.), Grasp injects into specific frames:
```javascript
chrome.scripting.executeScript({
  target: { tabId, frameIds: [frameId] },
  files: ['js/load-content-script-{platform}-app.js']
})
```

### 5.5 Lifecycle Events
- **onInstalled:** Opens `activation?new_install=true` page for initial setup
- **onUpdated:** Handles extension updates
- **Periodic:** Split.io flag polling, PostHog event batching

---

## 6. eval.js — MAIN World Bridge

### 6.1 Purpose
`eval.js` (~18KB) is injected into the MAIN world (page context) via a `<script>` tag, giving it access to the page's JavaScript runtime — including React internals, Vue instances, jQuery objects, and Facebook's `require()` system.

### 6.2 Helper Functions

| Function | Purpose | Used By |
|:--|:--|:--|
| `FindReact(element, levels)` | Traverse React Fiber tree from DOM element | All React platforms |
| `FindReactFiber_v17(element)` | Direct React Fiber access (checks `__reactFiber$` and `__reactInternalInstance$`) | React 17+ platforms |
| `FindReactNodes(element)` | Traverse full fiber tree for all nodes | Deep React traversal |
| `GetCompFiber(fiber)` | Walk up fiber hierarchy to find component fiber | React component lookup |
| `FindContexts(element)` | Extract all React Context values from fiber tree | Facebook selector calls |
| `FindFacebookContextSelector(contexts, selectorName)` | Call Facebook's internal Redux-like selectors | Facebook data extraction |
| `FindContext_v0(t, e, n)` | Older React version context lookup | Legacy React support |
| `FindContext(t, e, n)` | Wrapper: tries v0 first, then FacebookContextSelector | Context resolution |
| `FindPath(element, keys)` | Deep property traversal via React Fiber | Nested field extraction |
| `FindPathInIframe(iframe, selector, keys)` | Cross-frame React property traversal | Iframe platforms |
| `FindVue(element)` / `FindVueInIframe(iframe, selector)` | Vue instance extraction | Vue-based platforms |
| `FindJQuery(element)` / `FindJQueryInIframe(iframe, selector)` | jQuery data extraction | jQuery-based platforms |
| `FacebookClearExtensionDetection()` | Disables `require("AdsBrowserExtensionErrorUtils").isBrowserExtensionError` | Facebook only |
| `callSelector(context, selectorName, ...args)` | Invoke React context selector functions by name | Facebook data extraction |
| `facebookEditorTree()` | Returns full campaign/adset/ad hierarchy with Immutable.js `.toJS()` | Facebook tree view |

### 6.3 Platform-Specific Getters

eval.js defines named getter functions for 9 platforms:

**Facebook:** `facebookEditorTree`, `callSelector`, `FindContexts`, `FindFacebookContextSelector`, `FacebookClearExtensionDetection`

**Snapchat:** Campaign/adset getters + **SETTERS** for budget, dates, targeting, languages, ages, gender, locations. Uses `FindReact(element, depth).handleChange()` to trigger React state changes.

**LinkedIn:** Ad name getter + **SETTER** (clicks element, waits 100ms, sets value, triggers input + blur events)

**Pinterest:** React-based getters via FindReact

**Google:** Standard getters (less sophisticated than Facebook approach — likely more DOM-based)

**Sprinklr, Twitter/X, Walmart, Yahoo:** Platform-specific getter configurations

### 6.4 Generic Getters
Available for ALL platforms:
- `elementText(selector)` — innerText of element
- `elementValue(selector)` — .value of form element
- `elementAttribute(selector, attr)` — single attribute
- `elementAttributes(selector, attrs)` — multiple attributes
- `elementsAttribute(selector, attr)` — attribute from all matching elements
- `elementsAttributes(selector, attrs)` — multiple attributes from all matching elements
- `elementPath(selector, keys)` — deep React Fiber traversal

### 6.5 Raw eval() Fallback
If no named getter matches, eval.js falls back to raw `eval(expression)`:
```javascript
// Dispatcher logic
if (query.id in namedGetters) {
  result = namedGetters[query.id](query.params)
} else if (query.expression) {
  result = eval(query.expression)  // Arbitrary JavaScript execution
}
```
This provides maximum flexibility — the backend can push arbitrary JavaScript extraction logic without updating the extension.

---

## 7. Communication Protocol

### 7.1 Content Script → eval.js (MAIN World)
```javascript
// Content script dispatches query
document.dispatchEvent(new CustomEvent('evalQuery.gg', {
  detail: {
    uid: uniqueId,
    query: {
      id: 'facebookEditorTree',    // Named getter
      selector: '.some-element',    // Optional DOM selector
      expression: 'arbitrary JS',   // Fallback expression
      params: { /* getter params */ }
    }
  }
}))
```

### 7.2 eval.js → Content Script (MAIN World → ISOLATED)
```javascript
// eval.js sends result back
const encoder = new TextEncoder()
const buffer = encoder.encode(JSON.stringify(result))
window.postMessage({
  type: 'evalResult.gg',
  uid: queryUid,
  buffer: buffer  // ArrayBuffer for efficiency
}, '*', [buffer])  // Transferable for zero-copy
```

### 7.3 Key Design Decisions
- **CustomEvent** for inbound (content script → main world): Avoids postMessage noise from other scripts
- **postMessage** for outbound (main world → content script): Cross-world communication requirement
- **Transferable ArrayBuffer**: Zero-copy transfer for large payloads (campaign trees can be 100KB+)
- **TextEncoder**: Efficient JSON → binary serialization
- **UID-based correlation**: Multiple concurrent queries can be in-flight
- **Grasp-namespaced events**: `evalQuery.gg` and `evalResult.gg` — `.gg` suffix prevents collisions

---

## 8. Facebook/Meta Adapter (Deep Dive)

### 8.1 Data Extraction Strategy

Grasp's Facebook adapter does NOT use DOM selectors for data. Instead, it accesses Facebook's internal state through 3 mechanisms:

#### Mechanism 1: require() Module System

Facebook's Ads Manager exposes an internal `require()` function in MAIN world. Grasp calls 9 internal modules:

| Module | Purpose |
|:--|:--|
| `AdsGraphAPI` | GraphQL API client for campaign operations |
| `AdsDraftFragmentUtils` | Draft campaign fragment manipulation |
| `AdsPECrepePackages` | Facebook's "Crepe" ad creation package definitions |
| `adsPECurrentDraftIDSelector` | Selector for the current draft's ID |
| `AdsNewIDs` | ID generation for new campaign entities |
| `AdsDraftFragmentDataManager` | CRUD operations on draft campaign data |
| `AdsAPICampaignGroupRecordUtils` | Campaign group record utilities (objective extraction) |
| `adsCFMaybeCampaignGroupRecordSelector` | Maybe-selector for campaign group records |
| `AdsCampaignStructureSelectors` | Structural selectors: `getFlatTreeItemsSelector()` |

Example call pattern:
```javascript
const objective = require("AdsAPICampaignGroupRecordUtils").getObjective(record)
const treeItems = require("AdsCampaignStructureSelectors").getFlatTreeItemsSelector()
const draftId = require("adsPECurrentDraftIDSelector")(state)
```

#### Mechanism 2: React Context Selectors

Accessed via `callSelector(contexts, selectorName)`:

| Selector | Returns |
|:--|:--|
| `selectedCampaignGroupsSelector` | Full campaign group data (Immutable.js Map) |
| `campaignsForSelectedCampaignGroupsSelector` | Campaigns within selected groups |
| `adgroupsForSelectedCampaignGroupsSelector` | Ad groups/adsets within selected campaigns |
| `selectedCampaignGroupIDsSelector` | Array of selected campaign group IDs |
| `selectedCampaignIDsSelector` | Array of selected campaign IDs |
| `selectedAdgroupIDsSelector` | Array of selected adgroup IDs |

All return Immutable.js objects — Grasp calls `.toJS()` to convert to plain JavaScript.

#### Mechanism 3: facebookEditorTree()

Returns the full campaign → adset → ad hierarchy as a JavaScript object. Uses the `AdsCampaignStructureSelectors.getFlatTreeItemsSelector()` module and converts from Immutable.js.

### 8.2 Injection Points (DOM — only 3 querySelector calls)

Grasp uses DOM selectors ONLY for:
1. Finding the publish/submit button (for creation interception)
2. Finding the container element for Vue Teleport (for UI overlay injection)
3. Finding the objective selection modal (for hiding/replacing it)

### 8.3 Navigation URL Patterns

The Facebook adapter detects these URL patterns for campaign editing:
```
/adsmanager/manage/campaigns/edit?act={account_id}&selected_campaign_ids={ids}
/adsmanager/manage/adsets/edit?act={account_id}&selected_adset_ids={ids}
/adsmanager/manage/ads/edit?act={account_id}&selected_ad_ids={ids}
```

### 8.4 React SPA Handling

Facebook Ads Manager is a React SPA. Grasp handles navigation via:
- `MutationObserver` on root element for React reconciliation
- `history.pushState` monitoring (patched during campaign creation)
- URL change detection via `chrome.webNavigation.onCompleted`

---

## 9. Platform Support (56 Platforms)

### 9.1 Complete Platform List

Based on `js/services/platforms.js` analysis, Grasp supports 56 advertising platforms organized by category:

**Social Media (8):**
Facebook/Meta, Instagram (via Meta), Snapchat, LinkedIn, Pinterest, Twitter/X, TikTok, Reddit

**Search & Display (5):**
Google Ads, Microsoft/Bing Ads, Yahoo/Verizon, Apple Search Ads, Amazon Advertising

**Programmatic/DSP (10):**
DV360 (Display & Video 360), The Trade Desk, Xandr (AppNexus), MediaMath, Adform, Basis (Centro), StackAdapt, Amobee, Yahoo DSP, Amazon DSP

**Video/CTV (4):**
YouTube (via Google), Spotify Ads, Roku, Samsung Ads

**Retail Media (5):**
Amazon Ads, Walmart Connect, Criteo (Retail Media), Instacart Ads, Target Roundel

**Ad Servers (4):**
Campaign Manager 360 (CM360), Flashtalking, Innovid, Sizmek

**Social/Content Management (6):**
Sprinklr, Salesforce Marketing Cloud (SFMC), HubSpot, Braze, Iterable, Kenshoo/Skai

**Other (14+):**
Taboola, Outbrain, Teads, AdRoll, Moloco, Liftoff, ironSource, Unity Ads, Adjust, AppsFlyer, Branch, Prisma, Mediaocean, others

### 9.2 Per-Platform Architecture

Each platform gets 3 files:
- `js/load-content-script-{platform}-app.js` — loader (identical template)
- `js/content-script-{platform}-app.js` — adapter logic (Vue component)
- `css/content-script-{platform}-app.css` — platform-specific styles

Loader template (identical for all 56):
```javascript
import('./content-script-inject.js')  // Injects eval.js
import('./content-script-{platform}-app.js')  // Platform adapter
```

### 9.3 Platform Detection Patterns

From `platforms.js`, each platform is defined as:
```javascript
{
  id: 'facebook',
  name: 'Facebook',
  domains: ['facebook.com', 'business.facebook.com'],
  urlPattern: /^https:\/\/(www\.|business\.)?facebook\.com\/adsmanager/,
  contentScript: 'content-script-facebook-app',
  css: 'content-script-facebook-app',
  // ...
}
```

### 9.4 Extraction Strategy by Platform Framework

| Framework | Extraction Method | Platforms |
|:--|:--|:--|
| React (internal require) | `require()` + Context selectors | Facebook/Meta |
| React (Fiber) | `FindReact()` + `FindPath()` | Snapchat, Pinterest, and others |
| Vue | `FindVue()` / `FindVueInIframe()` | Some newer ad platforms |
| jQuery | `FindJQuery()` / `FindJQueryInIframe()` | Legacy platforms |
| DOM + eval() | Generic getters + raw eval | All platforms as fallback |

---

## 10. CSS & UI Injection Strategy

### 10.1 No Shadow DOM

Grasp explicitly does NOT use Shadow DOM. All CSS and UI components are injected directly into the host page's DOM.

Implications:
- CSS rules use `!important` extensively to prevent platform styles from overriding
- CSS class names are prefixed (e.g., `gg-`, `grasp-`, `q-`) to avoid collisions
- The extension's styles can potentially conflict with platform CSS updates
- Platform CSS updates can potentially break Grasp's visual appearance

### 10.2 Vue Teleport for Component Injection

Instead of creating Shadow DOM containers, Grasp uses Vue's built-in `Teleport` component:
```html
<Teleport to=".ads-manager-sidebar">
  <GraspGuidelinesPanel />
</Teleport>
```
This mounts Vue components at specific DOM locations within the platform's page, allowing them to inherit some platform styling while applying Grasp's own CSS.

### 10.3 Body-Level CSS State Classes

Grasp communicates validation state via CSS classes on the `<body>` element:
```css
body.gg-invalid-campaign-name { }
body.gg-valid-campaign-name { }
body.gg-invalid-adset-budget { }
body.gg-valid-adset-budget { }
/* Pattern: body.gg-{valid|invalid}-{field-name} */
```
This allows platform-specific CSS to react to validation state without JavaScript, enabling pure CSS highlighting of invalid fields.

### 10.4 CSS Variables

```css
:root {
  --grasp-bar-width: 340px;
  --q-red: #C10015;
  --q-green: #21BA45;
  --q-primary: #1976D2;
}
```

### 10.5 Font Injection

Grasp injects its own fonts via `inject-fonts.js`:
- **Fira Sans** (Regular, Medium, SemiBold, Bold) — main UI font
- **Material Icons** — iconography

Both loaded via `<style id="grasp-fonts">` element with `@font-face` declarations pointing to extension URLs (`chrome-extension://{id}/fonts/...`).

### 10.6 Platform-Specific CSS

Most platforms get a small CSS file (1-10KB), but two platforms have massive overrides:
- `dv360.css` — 458KB (Google DV360)
- `prisma.css` — 464KB (Mediaocean Prisma)

These sizes suggest extensive DOM targeting and override rules for complex platform UIs.

---

## 11. API & Backend Architecture

### 11.1 Microservice Endpoints

Grasp uses a microservice architecture with platform-specific API services:

| Service | Endpoint | Purpose |
|:--|:--|:--|
| Guidelines | `guidelines.prod.api.grasp.gg` | Rule/guideline definitions |
| Accounts | `accounts.prod.api.grasp.gg` | Account management |
| Accounts (Facebook) | `accounts-facebook.prod.api.grasp.gg` | Facebook-specific account ops |
| Accounts (Google) | `accounts-google.prod.api.grasp.gg` | Google-specific account ops |
| Accounts (TikTok) | `accounts-tiktok.prod.api.grasp.gg` | TikTok-specific account ops |
| Accounts (Amazon) | `accounts-amazon.prod.api.grasp.gg` | Amazon-specific account ops |
| Taxonomies | `taxonomies.prod.api.grasp.gg` | Category/taxonomy data |
| Cache | `5yyvjg69d9.execute-api.eu-west-1.amazonaws.com` | AWS Lambda cache service |
| Admin | `j413joxmv8.execute-api.eu-west-1.amazonaws.com` | AWS Lambda admin service |

### 11.2 Authentication

- **Provider:** Amazon Cognito (OAuth2)
- **Region:** eu-west-1 (Ireland)
- **Domain:** `graspgg.auth.eu-west-1.amazoncognito.com`
- **Flow:** Extension authenticates via Cognito, receives Bearer token, attaches to all API requests via Axios interceptor

### 11.3 API Client Architecture

```
Extension → Axios Client (with Bearer token interceptor)
         → tRPC Client (type-safe procedure calls)
         → TanStack Vue Query (caching layer)
```

The tRPC layer provides end-to-end type safety between extension and backend, while TanStack Vue Query handles caching, background refetching, and optimistic updates.

### 11.4 Infrastructure (AWS)

Based on endpoint patterns, Grasp runs on AWS:
- **Compute:** API Gateway + Lambda (cache/admin services), likely ECS/Fargate for main APIs
- **Region:** eu-west-1 (Ireland)
- **Auth:** Amazon Cognito
- **CDN:** Likely CloudFront for static assets

---

## 12. Anti-Detection Mechanisms

### 12.1 FacebookClearExtensionDetection()

Facebook actively detects browser extensions that interact with Ads Manager. Grasp neutralizes this:

```javascript
function FacebookClearExtensionDetection() {
  try {
    const utils = require("AdsBrowserExtensionErrorUtils")
    utils.isBrowserExtensionError = () => false
  } catch(e) {}
}
```

This patches Facebook's extension detection utility to always return `false`, effectively making Grasp invisible to Facebook's detection system.

### 12.2 is-loaded Guard

```javascript
// Prevents double-injection and ensures clean state
if (document.body.hasAttribute('grasp-loaded')) return 'loaded'
document.body.setAttribute('grasp-loaded', '')
```

### 12.3 Namespaced Events

All custom events use `.gg` suffix (`evalQuery.gg`, `evalResult.gg`, `graspObjectiveSelection.gg`) to avoid detection by generic event listeners that monitor for extension activity.

### 12.4 Minimal DOM Footprint (Facebook)

With only 3 `querySelector` calls on Facebook, Grasp's DOM interaction footprint is minimal. Most data is read from JavaScript state, not DOM elements, making it harder for Facebook to detect extension usage via DOM access pattern monitoring.

### 12.5 history.pushState Patching

During programmatic campaign creation, Grasp patches `history.pushState = () => null` to prevent React Router from triggering navigation. This is restored after creation completes. The patching is time-limited and targeted, reducing detection risk.

---

## 13. Campaign Creation (Programmatic)

### 13.1 Overview

Grasp doesn't just VALIDATE campaigns — it can CREATE them programmatically on Facebook using internal APIs. This is a major capability that goes beyond governance.

### 13.2 Creation Flow

```
1. User triggers creation from Grasp UI (not Facebook's UI)
2. Grasp patches history.pushState = () => null (prevents React reset)
3. Grasp calls require("AdsPECrepePackages") to get creation package definitions
4. Grasp initializes draft via AdsPECrepeInitDraftFragmentsDataLoader
5. Grasp calls createMultiFragments() to create:
   - Campaign group (top-level)
   - Campaign (within group)
   - Adset (within campaign)
   - Ad (within adset)
6. Uses require("AdsNewIDs") for ID generation
7. Uses require("AdsDraftFragmentDataManager") for CRUD on fragments
8. Maps Grasp's media plan data → Facebook's internal format
9. Restores history.pushState to original function
10. Navigates to editing view for the newly created campaign
```

### 13.3 Objective Handling

Grasp intercepts and replaces Facebook's campaign objective selection:
- Hides Meta's objective modal: `display:none !important; visibility:hidden !important; aria-hidden:true`
- Registers `__graspObjectiveGlobalHandler` as capture-phase click listener on `document`
- Communicates objective selection via `graspObjectiveSelection.gg` postMessage
- Maps Grasp objectives → Facebook internal objectives:

| Grasp/User Objective | Facebook Internal |
|:--|:--|
| OUTCOME_APP_PROMOTION | APP_INSTALLS |
| OUTCOME_AWARENESS | BRAND_AWARENESS |
| OUTCOME_ENGAGEMENT | POST_ENGAGEMENT |
| OUTCOME_LEADS | LEAD_GENERATION |
| OUTCOME_SALES | CONVERSIONS |
| OUTCOME_TRAFFIC | LINK_CLICKS |

### 13.4 Data Mapping

The creation module maps comprehensive campaign data from Grasp's media plan format to Facebook's internal format:

- **Campaign level:** Name, objective, special ad categories, spending limit, CBO toggle
- **Adset level:** Budget (daily/lifetime), schedule (start/end dates), targeting (geo, age, gender, languages, audiences), placements (manual/auto + specific placements), optimization goal, bid strategy
- **Ad level:** Name, creative URL, page ID, Instagram account ID, CTA type, tracking parameters

---

## 14. Vuex State Management (Facebook)

### 14.1 Store Architecture

The Facebook adapter maintains a Vuex store with comprehensive state for all campaign entities.

### 14.2 Mutations (35)

Mutations are the only way to update Vuex state. Each maps to a specific campaign field:

**Campaign mutations:**
`campaignObjective`, `campaignCBO`, `campaignName`, `campaignBudget`, `campaignBudgetMode`

**Adset mutations:**
`adsetBudgetMode`, `adsetBudgetAmount`, `adsetAges`, `adsetGender`, `adsetLocales`, `adsetLocations`, `adsetPerformanceGoal`, `adsetDeliverySchedule`, `adsetAddPlacement`, `adsetRemovePlacement`, `adsetPageId`, `adsetName`, `adsetSavedAudience`, `adsetSchedule`

**Ad mutations:**
`adName`, `adUrl`, `adCreativeUrl`, `adCarouselUrl`, `adPageId`, `adInstagramId`

**Cross-cutting mutations:**
`manualPlacements`, `autoPlacements`, `urlParameters`, `viewTags`, `goToEntity`

### 14.3 Getters (40+)

Getters provide computed/derived state:

**Core getters:**
`campaignBudget`, `campaignBudgetTotal`, `editorTree`, `selectedEntity`

**Guideline getters:**
`guidelines`, `guidelinesCache`, `invalidGuidelines`, `activeGuidelines`

**Media Plan getters:**
`mediaPlan`, `hasAccessToMediaPlan`

**Context getters:**
`adAccountId`, `currentEntityLevel`, `currentEntityId`

### 14.4 Actions

Actions handle async operations — typically reading from Facebook's state via eval.js queries and committing mutations to update the Vuex store:
```
Action: fetchCampaignData
  → Dispatch evalQuery.gg (facebookEditorTree)
  → Receive evalResult.gg (ArrayBuffer → JSON)
  → Commit campaignObjective, campaignName, campaignBudget, etc.
```

### 14.5 Store Initialization

When the Facebook adapter loads:
1. Reads current URL to determine context (account ID, entity level, entity IDs)
2. Calls `FacebookClearExtensionDetection()` to disable detection
3. Fetches guidelines from `guidelines.prod.api.grasp.gg`
4. Dispatches initial data fetch actions
5. Starts validation loop (`loop.js`)
6. Mounts Vue components via Teleport to DOM locations

---

## 15. Comparison: Grasp vs DLG Architecture

### 15.1 Architecture Overview

| Aspect | Grasp v26 | DLG v1.7 |
|:--|:--|:--|
| **Extension UI** | Vue 3 + Quasar + Vuex | Vanilla TypeScript + Shadow DOM |
| **DOM Isolation** | None (direct injection + `!important`) | Shadow DOM |
| **Data Extraction (Meta)** | `require()` + React Context selectors | CSS selectors + React Fiber (pending refactor) |
| **Data Extraction (Other)** | FindReact/FindVue/FindJQuery + generic getters | CSS selectors (Google only) |
| **MAIN World Bridge** | eval.js (18KB, 15+ helper functions) | remoteEval bridge (basic) |
| **Communication** | CustomEvent + postMessage with Transferable ArrayBuffer | postMessage (basic JSON) |
| **Campaign Creation** | Yes (programmatic via AdsGraphAPI) | No (validation only) |
| **Platform Count** | 56 | 2 (Meta + Google) |
| **Rule Count (Meta)** | 88 | 17 → 88 (expanding) |
| **State Management** | Vuex (per-platform stores) | None (stateless extraction) |
| **Feature Flags** | Split.io | None |
| **Error Tracking** | Sentry | None (console.error) |
| **Analytics** | PostHog | None |
| **Auth** | Amazon Cognito | Firebase Auth |
| **API** | tRPC + Axios (microservices) | REST + Fetch (monolith) |
| **Backend** | AWS (Lambda + API Gateway + Cognito) | GCP (Cloud Run + PostgreSQL + Pub/Sub) |
| **Manifest** | MV3 (dynamic injection, optional permissions) | MV3 (dynamic injection) |
| **Anti-Detection** | Yes (FacebookClearExtensionDetection) | No |
| **Value Writing/Setting** | Yes (Snapchat, LinkedIn) | No (read-only) |
| **i18n** | Yes (398KB translations) | No |
| **Extension Size** | 6.7MB (289 files) | ~500KB (estimated) |

### 15.2 Key Advantages Grasp Has Over DLG

1. **Meta Data Extraction:** Grasp reads from React state (stable); DLG reads from DOM (fragile). DLG's v1.7 refactor plan addresses this.

2. **Platform Breadth:** 56 vs 2 platforms. Grasp has years of platform adapter development.

3. **Campaign Creation:** Grasp can programmatically create campaigns, not just validate. This is a significant feature for media plans.

4. **Setter Capabilities:** Grasp can set/write values on some platforms (Snapchat, LinkedIn). This enables auto-correction features.

5. **Production Infrastructure:** Sentry, PostHog, Split.io, OpenTelemetry — full observability stack. DLG has none.

6. **Anti-Detection:** Grasp actively disables Facebook's extension detection. DLG does not.

7. **Communication Efficiency:** Transferable ArrayBuffer vs basic JSON postMessage.

8. **Multi-Framework Support:** React + Vue + jQuery helpers. DLG only handles React (Meta) and Angular (Google).

### 15.3 Key Advantages DLG Has Over Grasp

1. **Shadow DOM Isolation:** DLG uses Shadow DOM for style isolation; Grasp relies on `!important` which is more brittle.

2. **Modern Stack:** DLG uses React 18 + TypeScript throughout; Grasp uses Vue 3 + mixed JS/TS.

3. **Database-Backed Rules:** DLG stores rules in PostgreSQL with a full admin portal; Grasp's rules appear pre-compiled in the extension (120KB guidelines.js).

4. **GCP Cloud-Native:** Cloud Run, Pub/Sub, PostgreSQL — potentially more scalable and cost-effective than Grasp's Lambda architecture.

5. **Open Architecture:** DLG is being built with clean interfaces and documented APIs from day one.

6. **Agent Teams Development:** DLG's Claude Code Agent Teams approach enables rapid parallel development.

### 15.4 Strategic Recommendations (Summary)

**Immediate (Step 2):**
- Implement `require()` + React Context strategy for Meta (already planned in v1.7)
- Add `FacebookClearExtensionDetection()` to prevent detection
- Upgrade communication protocol to use Transferable ArrayBuffer
- Expand to 88 rules

**Short-term:**
- Add Sentry + PostHog (or equivalent) for production observability
- Implement feature flags (Split.io or LaunchDarkly)
- Add `FindVue` and `FindJQuery` helpers for future platform support

**Medium-term:**
- Build Snapchat, TikTok, LinkedIn adapters (priority platforms after Meta + Google)
- Explore setter/auto-correction capabilities
- Consider media plan integration (Grasp's core workflow)

**Long-term:**
- Scale to 10-15 platforms (strategic subset of Grasp's 56)
- Evaluate programmatic campaign creation feature
- Build i18n support for international customers
