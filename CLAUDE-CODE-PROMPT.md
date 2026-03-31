# Claude Code Agent Teams — Initial Prompt

> **How to use:** Copy the prompt below into Claude Code after enabling Agent Teams. Run it from the root of your project directory. The prompt is designed to be self-contained — it tells the team lead everything it needs to scaffold the project, spawn teammates, and coordinate the full Phase 1 build.

---

## Prerequisites

Before running, make sure you have:

1. **Agent Teams enabled** in your `settings.json`:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

2. **Model set to Opus 4.6** — all teammates will use Opus 4.6:
```json
{
  "model": "claude-opus-4-6-20251101"
}
```

3. **The spec file** at `./SPEC.md` (the full specification document in this same directory).

4. **Node.js 20+** and **pnpm** installed.

5. **PostgreSQL** running locally (or a Cloud SQL connection string ready).

6. **Playwright MCP server** (for the E2E Tester teammate):
```bash
claude mcp add --transport stdio playwright -- npx -y @playwright/mcp@latest
```

---

## The Prompt — Phase 1 ✅ DONE

```
Read the full specification document at ./SPEC.md — this is the product and technical spec for a Media Buying Governance Platform. It's a SaaS product with three components: an admin portal (React), a backend API (NestJS), and a Chrome extension (Manifest V3, TypeScript) that injects validation rules into Meta Ads Manager and Google Ads.

All infrastructure runs on Google Cloud Platform (Cloud Run for services, Cloud SQL for PostgreSQL, Cloud Pub/Sub for events, Firebase Auth / Google Cloud Identity Platform for authentication, Cloud Storage + Cloud CDN for static assets, Secret Manager for secrets).

Create an agent team to build Phase 1 (Foundation) of this project. Use Opus 4.6 for every teammate. Spawn 6 teammates with the following roles:

**Teammate 1 — "Backend"** (Opus 4.6)
Owns: /packages/backend/
Tasks:
1. Scaffold a NestJS application with TypeScript strict mode. Configure it to deploy on Google Cloud Run (add a Dockerfile, set PORT from env, health-check endpoint at /healthz).
2. Set up Prisma ORM with PostgreSQL (compatible with Google Cloud SQL). Create the full database schema from Section 9 of the spec (organizations, users, ad_accounts, rule_sets, rules, naming_templates, compliance_events, approval_requests). Run the initial migration.
3. Implement Firebase Auth / Google Cloud Identity Platform JWT verification middleware — validate Firebase ID tokens on incoming requests. For local dev, support a bypass mode with a locally-signed JWT.
4. Build the Extension API endpoints from Section 10.2: GET /api/v1/rules (with query filters for platform, account_id, entity_level), GET /api/v1/rules/version, POST /api/v1/compliance/events (batch), POST /api/v1/compliance/comment.
5. Build the Admin API CRUD endpoints from Section 10.2: full CRUD for organizations, accounts, teams, users, rule-sets, rules, naming-templates.
6. Seed the database with realistic test data: 2 organizations, 3 teams, 5 users (mix of admin/buyer roles), 4 ad accounts (2 Meta, 2 Google Ads), and 10 sample rules covering naming_convention, budget_enforcement, targeting_constraint, and brand_safety rule types.
7. Write integration tests for all endpoints using Jest + Supertest.
8. Add a Pub/Sub publisher: when a rule is created/updated/deleted via the Admin API, publish a message to a `rules-updated` topic with { version, account_ids_affected }. This will be consumed by the extension sync channel later.

**Teammate 2 — "Admin Portal"** (Opus 4.6)
Owns: /packages/admin-portal/
Tasks:
1. Scaffold a React 18 + TypeScript app using Vite. Set up Tailwind CSS + shadcn/ui for the component library. Configure for static deployment on Cloud Storage + Cloud CDN (output to /dist).
2. Set up Firebase Auth client SDK for authentication — Google sign-in button on /login, auth state persistence, token refresh, and an auth context provider that wraps the app.
3. Set up React Router with the following routes: /login, /dashboard, /accounts, /teams, /rules, /rules/new, /rules/:id/edit, /naming-templates, /naming-templates/new, /compliance.
4. Build the Rule Builder page (Section 6.4): a multi-step form with scope selection (accounts, teams, buyers), platform selection, entity level, rule type selector, condition configurator (dynamic form based on rule type), enforcement mode selector, and a JSON preview panel.
5. Build the Naming Convention Builder page (Section 6.5): drag-and-drop segment editor where each segment has label, type (enum/free_text/date/auto_generated), separator, required flag, and allowed_values. Show a live preview of the generated name with color-coded segment badges (red × for invalid, green ✓ for valid).
6. Build a basic Compliance Dashboard page (Section 6.6): overall compliance score as a circular progress indicator, cards for campaigns created / violations this week / blocked creations, and a table of recent compliance events.
7. Wire all pages to the Backend API using TanStack Query for data fetching. Attach Firebase ID token as Bearer token on every request.
8. Ensure all components have proper TypeScript types — import shared types from /packages/shared/.

**Teammate 3 — "Extension Core"** (Opus 4.6)
Owns: /packages/extension/
Tasks:
1. Scaffold a Chrome Manifest V3 extension using TypeScript + esbuild for bundling. Set up the manifest.json following Section 11.2 of the spec — critically, use an EMPTY content_scripts array and dynamic injection from the service worker (this is the proven pattern from the reference architecture in Appendix C).
2. Implement the service worker (background.js): URL pattern detection for Meta Ads (adsmanager.facebook.com, business.facebook.com) and Google Ads (ads.google.com), dynamic content script injection via chrome.scripting.executeScript(), and dynamic CSS injection via chrome.scripting.insertCSS().
3. Implement the rule cache (IndexedDB) and sync module: fetch rules from GET /api/v1/rules on activation, cache with 5-minute TTL, poll GET /api/v1/rules/version every 60 seconds for cache invalidation.
4. Implement the PlatformAdapter TypeScript interface from Section 11.3: detectContext(), extractFieldValues(), getInjectionPoint(), interceptCreation(), observeFieldChanges(), cleanup().
5. Implement the remoteEval bridge pattern (Section 11.4 / Appendix C.3): create an eval-bridge.ts that injects a small script into the MAIN world via chrome.scripting.executeScript({ world: 'MAIN' }), communicates via window.postMessage with namespaced message types, and includes a batcher that collects multiple field queries into a single round-trip.
6. Implement the core injection components as vanilla TypeScript (no framework dependency): ValidationBanner (red/green banner with message), GuidelinesSidebar (floating panel with collapsible categories and pass/fail counts), CampaignScore (circular 0-100 indicator), CreationBlocker (overlay on publish button), CommentModal (inline form), NamingPreview (color-coded segment badges).
7. Implement the rule evaluation engine: takes a Record<string, any> of field values and an array of Rule objects, evaluates each rule's condition against the field values, returns pass/fail per rule with aggregated score.
8. Implement the is-loaded guard pattern: check for a body attribute before injection, set it after.
9. Build the extension popup: simple page showing current org, account, sync status, and a "Force Refresh" button.

**Teammate 4 — "Meta Adapter"** (Opus 4.6)
Owns: /packages/extension/src/adapters/meta/
Tasks:
1. Implement MetaAdapter class conforming to the PlatformAdapter interface.
2. Implement detectContext(): parse the URL and DOM to extract the Meta ad account ID, determine if we're in campaign/ad-set/ad creation or editing mode.
3. Implement extractFieldValues() using the remoteEval bridge: write named getters for every field in the Meta field map (Appendix B). For React-internal state, use React Fiber traversal — find DOM elements with __reactFiber$ keys and walk the fiber tree to extract component props and state. Key fields: campaign.name, campaign.budget_type, campaign.budget_value, campaign.cbo_enabled, ad_set.targeting.geo_locations, ad_set.targeting.genders, ad_set.targeting.languages, ad_set.placements.
4. Implement getInjectionPoint(): map each rule type to the correct DOM location using the injection points table from Section 12.1. Use multiple selector strategies with fallbacks: aria-label selectors first, then data-testid, then text-content matching, then heuristic proximity.
5. Implement observeFieldChanges(): set up MutationObserver on document.body with childList + subtree, debounce callbacks, and re-inject any removed elements after React re-renders.
6. Implement interceptCreation(): find the "Publish" / "Next" button and attach an event listener that checks all blocking rules before allowing the click to proceed.
7. Create meta-theme.css: style all injected components to match Meta Ads Manager's design language (refer to Section 12.3 for the color palette).
8. Write unit tests for all field extraction logic using mock DOM structures.

**Teammate 5 — "Google Adapter"** (Opus 4.6)
Owns: /packages/extension/src/adapters/google/
Tasks:
1. Implement GoogleAdsAdapter class conforming to the PlatformAdapter interface.
2. Implement detectContext(): parse the URL and DOM to extract the Google Ads customer ID, determine the current wizard step and entity level.
3. Implement extractFieldValues() using the remoteEval bridge: write named getters for every field in the Google Ads field map (Appendix B). Target Material Design components: material-input elements, mat-select dropdowns, mat-checkbox states. Key fields: campaign.name, campaign.budget_value, campaign.bidding_strategy, campaign.geo_targets, campaign.languages, campaign.brand_safety.
4. Implement getInjectionPoint(): map each rule type to the correct DOM location using the injection points table from Section 12.2. Handle the multi-step wizard — different rules are relevant at different steps.
5. Implement observeFieldChanges(): handle Angular's change detection, Shadow DOM traversal where needed.
6. Implement interceptCreation(): find the "Create campaign" / "Save" button and attach the blocking logic.
7. Create google-theme.css: style all injected components to match Google Ads' Material Design language (refer to Section 12.3 for the color palette — use Google Sans font, 4px border radius, Material color tokens).
8. Write unit tests for all field extraction logic using mock DOM structures.

**Teammate 6 — "E2E Tester"** (Opus 4.6)
Owns: /packages/e2e/ (new package)
Prerequisites: Playwright MCP server configured (`claude mcp add --transport stdio playwright -- npx -y @playwright/mcp@latest`)
Tasks:
1. Scaffold a Playwright test suite in /packages/e2e/ with TypeScript. Configure it to:
   - Load the Chrome extension from /packages/extension/dist/ via `--load-extension` and `--disable-extensions-except` flags.
   - Run against localhost (admin portal on :5173, backend on :3000).
   - Use the seeded test data (admin1@dlg.com, extension token, DLG org).
2. Write admin portal smoke tests:
   - Login page renders correctly with mock auth bypass.
   - Dashboard loads and shows stat cards (Active Rules, Ad Accounts, Teams, Compliance).
   - Rules list page loads and displays seeded rules.
   - Rule Builder wizard navigates through all 5 steps (scope → platform → condition → enforcement → preview).
   - Naming Convention Builder allows adding/removing segments and shows live preview.
3. Write extension pairing tests:
   - Extension popup renders and shows "Not Connected" state initially.
   - After setting extension token, popup shows org name ("DLG") and sync status.
   - Force Refresh button triggers rule re-fetch.
4. Write extension injection tests against mock ad platform pages:
   - Create minimal HTML fixtures that simulate Meta Ads Manager DOM structure (campaign name input, budget section, targeting section).
   - Create minimal HTML fixtures that simulate Google Ads DOM structure (campaign wizard steps).
   - Verify that the extension detects the mock platform page and injects validation banners, guidelines sidebar, and campaign score.
   - Verify that changing a field value triggers rule re-evaluation and updates the injected UI.
   - Verify that the creation blocker prevents clicking "Publish" when blocking rules are violated.
5. Write API integration tests:
   - GET /api/v1/rules returns rules for a valid extension token.
   - POST /api/v1/compliance/events accepts batch events.
   - Admin CRUD endpoints work for rules, accounts, teams.
6. Generate a test report summarizing pass/fail per test suite.

**Your role as team lead (Architect):**
1. First, set up the monorepo structure using pnpm workspaces:
   - /packages/shared/ — shared TypeScript types (Rule, RuleSet, ComplianceEvent, NamingTemplate, PlatformAdapter interface, all enums)
   - /packages/backend/
   - /packages/admin-portal/
   - /packages/extension/
   - /packages/e2e/ — Playwright E2E test suite
2. Create the shared types package FIRST and broadcast the interfaces to all teammates before they start coding.
3. Create a CLAUDE.md at the project root with:
   - Project overview (one paragraph)
   - Monorepo structure explanation
   - How to run each package (dev server commands)
   - Infrastructure: Google Cloud Platform — Cloud Run (backend), Cloud SQL (PostgreSQL), Firebase Auth (identity), Cloud Pub/Sub (events), Cloud Storage + CDN (admin portal static hosting)
   - Coding conventions: TypeScript strict, no any types, all functions documented with JSDoc, all API responses typed
4. Set up the pnpm workspace config (pnpm-workspace.yaml) and root package.json with shared dev dependencies (typescript, eslint, prettier). IMPORTANT: add an `onlyBuiltDependencies` allowlist in root package.json under the `"pnpm"` key to pre-approve native builds and avoid interactive prompts that block CI and agents:
   ```json
   "pnpm": {
     "onlyBuiltDependencies": ["@prisma/client", "@prisma/engines", "prisma", "esbuild", "protobufjs"]
   }
   ```
   Also create an `.npmrc` at the root with `side-effects-cache=true` for faster installs.
5. Create a docker-compose.yml at the root for local development: PostgreSQL container, Pub/Sub emulator, and optionally Firebase Auth emulator.
6. Coordinate teammates: ensure Backend publishes its API contract (OpenAPI or typed routes) before Admin Portal and Extension Core start wiring API calls. Ensure Extension Core publishes the PlatformAdapter interface before Meta and Google Adapter teammates start implementing. The E2E Tester should start only after all other teammates have completed their work.
7. Require plan approval from all teammates before they start implementing — review each plan to ensure it aligns with the spec and uses the correct GCP services.
8. When all teammates finish, synthesize a summary of what was built, what's working, and what needs attention in Phase 2.

**IMPORTANT — Lessons learned from Phase 1 build (avoid these pitfalls):**
- **Local dev auth:** Firebase Auth with fake credentials (`fake-key-for-local-dev`) causes `onAuthStateChanged` to hang. The admin portal MUST detect local dev mode (`isLocalDev` flag in `firebase.ts`) and bypass Firebase entirely with a `MOCK_USER` in `AuthContext.tsx`. The mock user should use the seeded admin email (`admin1@dlg.com`).
- **API client auth in local dev:** The Axios API client in `api.ts` MUST NOT read `firebaseAuth.currentUser` in local dev mode (it's always null because the mock user only lives in React state). Instead, send a base64-encoded JSON token: `btoa(JSON.stringify({ uid: 'local-dev-user', email: 'admin1@dlg.com' }))`. The backend's local auth guard must decode and validate this.
- **No hard redirects on 401 in local dev:** The Axios 401 response interceptor must NOT do `window.location.href = '/login'` in local dev mode — this causes an infinite page reload loop since the mock user re-initializes on every full reload. Log a console.warn instead.
- **Backend data model:** Ensure the backend transforms Prisma models into the shared API types before returning them. Don't return raw Prisma models — the frontend expects nested structures (e.g., `rule.scope.platforms`) but Prisma returns flat columns (e.g., `rule.platform`).
- **Extension URLs:** Hardcoded production URLs in `popup.ts` and `sync.ts` must be configurable via environment or manifest. Use `localhost` for development.

Use delegate mode — focus on coordination, not implementation. Let teammates do the work.
```

---

## Phase 1.5 — Hardening ✅ DONE

> **Context:** Phase 1 built the full foundation but left tech debt and untested integration points. Phase 1.5 fixes what's broken before adding new features. We stay local — no GCP deployment yet. The biggest risk is whether DOM selectors work on real ad platforms. Validate that first.

> **Team change:** Downsized from 6 to 4 teammates. The Meta and Google adapters are built — they don't need dedicated engineers. One "Extension Hardening" engineer handles both, focused on testing and fixing selectors. The E2E Tester is now central.

```
Read ./SPEC.md — focus on "Implementation Progress (Phase 1)", "Issues Resolved", "Known Issues", and "Remaining Work" sections. The Phase 1 foundation is built and running locally. Phase 1.5 is about HARDENING: fix what's broken, validate DOM injection on real platforms, and add tests. We stay on localhost — no deployment yet.

Create an agent team with 4 teammates (all Opus 4.6):

**Teammate 1 — "Backend" (Opus 4.6)**
Owns: /packages/backend/
Priority: Fix the data model mismatch — this is the #1 tech debt blocking admin portal pages.
Tasks:
1. Build a transformation layer: create a /src/transformers/ directory with mapper functions that convert Prisma models into the shared API types from /packages/shared/. Every API endpoint must return the shared types, not raw Prisma models. Key mappings:
   - Rule (flat Prisma columns) → Rule (nested scope object with platforms, entity_levels, account_ids, team_ids, buyer_ids)
   - AdAccount (Prisma) → AdAccount (shared type with active boolean, not isActive)
   - ComplianceEvent (Prisma) → ComplianceEvent (shared type)
   - NamingTemplate (Prisma) → NamingTemplate (shared type)
2. Fix NestJS watch mode: investigate the incremental compilation issue with `nest start --watch`. If unfixable, add a `dev` script that uses `tsx watch` or `nodemon` as a workaround.
3. Add a /api/v1/extension/pair endpoint: accepts { invite_code } or { email, org_slug }, returns { extension_token, organization }. This replaces the manual DevTools console pairing.
4. Ensure the local auth guard properly decodes the base64 JSON token from the admin portal (btoa({ uid, email })) and maps it to the seeded admin user in the database.
5. Add proper error responses with consistent error shape: { error: string, code: string, details?: any }.
6. Write integration tests for all transformer functions.

**Teammate 2 — "Admin Portal" (Opus 4.6)**
Owns: /packages/admin-portal/
Priority: Make all pages functional against the real backend API (not just Dashboard).
Tasks:
1. Fix every page that crashes due to data model mismatch. After Backend teammate builds the transformation layer, verify each page works. If any page still breaks, fix the frontend to match the API response shape. Pages to verify: Rules list, Rule Builder (edit mode), Accounts, Teams, Naming Templates, Compliance Dashboard.
2. Add proper loading and error states to every page — when the API returns an error, show a user-friendly message instead of a white screen or crash. Use TanStack Query's isError + error states.
3. Build an extension pairing page at /settings/extension: shows the current extension token, a "Generate New Token" button, and a copyable invite link. Wire this to the new /api/v1/extension/pair endpoint.
4. Remove the `(rule as any).platform` quick-fix in Rules.tsx — replace with proper typed access now that the backend returns shared types.
5. Clean up all remaining `console.log` debug statements from Phase 1 debugging.
6. Test the Rule Builder end-to-end: create a new rule via the wizard, save it, verify it appears in the rules list, edit it, delete it.

**Teammate 3 — "Extension Hardening" (Opus 4.6)**
Owns: /packages/extension/
Priority: Validate that DOM injection works on real ad platform pages.
Tasks:
1. Create mock platform HTML fixtures in /packages/extension/test/fixtures/:
   - meta-campaign-creation.html: Minimal reproduction of Meta Ads Manager campaign creation form (campaign name input with aria-label, budget section, CBO toggle, objective cards). Include realistic class names and React fiber keys.
   - meta-adset-creation.html: Targeting section (locations, gender, languages), placement section, schedule.
   - google-campaign-wizard.html: Campaign wizard steps with Material components (mat-input, mat-select), budget section, bidding strategy.
   These fixtures allow automated testing without needing real ad platform credentials.
2. Test the extension against the mock fixtures using a local file:// URL or a simple HTTP server. Verify:
   - Service worker detects the platform (may need to adjust URL matching for test fixtures).
   - Content scripts inject correctly.
   - Validation banners appear next to the right fields.
   - Guidelines sidebar shows seeded rules grouped by category.
   - Campaign score calculates correctly.
   - Changing a field value triggers re-evaluation.
3. Build the extension pairing UI in the popup: replace the DevTools console workflow with an "Enter Invite Code" form that calls the new /api/v1/extension/pair endpoint. Show org name and sync status after pairing.
4. Fix the Force Refresh button in the popup — verify it clears IndexedDB cache and re-fetches rules from the backend.
5. Add selector telemetry: when a selector fails to find its target, log { selector, platform, field_path, timestamp } to a local array. Add a "Selector Health" section in the popup that shows pass/fail counts.
6. Review and update selectors for both Meta and Google adapters based on the latest DOM structures. The fixtures should match the current real DOM as closely as possible.

**Teammate 4 — "E2E Tester" (Opus 4.6)**
Owns: /packages/e2e/
Priority: Automated test suite that validates the full stack works together.
Tasks:
1. Scaffold a Playwright test suite in /packages/e2e/ with TypeScript. Configure:
   - Load the Chrome extension from /packages/extension/dist/ via --load-extension flag.
   - Base URL: http://localhost:5173 (admin portal), API: http://localhost:3000.
   - Test fixtures: serve the mock platform HTML from Extension Hardening teammate.
   - Use seeded test data (admin1@dlg.com, extension token, DLG org).
2. Admin portal smoke tests:
   - Dashboard loads with stat cards showing real data from seeded database.
   - Rules page shows 3 seeded rules.
   - Rule Builder navigates all 5 steps and saves a new rule.
   - Naming Convention Builder adds segments and shows live preview.
   - Accounts page lists seeded accounts.
   - Teams page lists seeded teams.
3. Extension tests (against mock platform fixtures):
   - Extension popup shows "DLG" after pairing.
   - Opening a mock Meta page triggers content script injection.
   - Validation banners appear for violated rules.
   - Guidelines sidebar shows correct pass/fail counts.
   - Creation blocker activates when blocking rules are violated.
4. API integration tests:
   - Full CRUD cycle: create rule → read → update → delete.
   - Extension API: GET /rules returns rules filtered by account_id.
   - Compliance events: POST batch events, verify they're stored.
5. Generate an HTML test report at /packages/e2e/reports/. Configure Playwright reporter.

**Your role as Architect:**
1. Coordinate execution order: Backend builds transformation layer FIRST (Teammates 2 and 3 depend on correct API responses). Extension Hardening and Admin Portal can work in parallel after Backend finishes. E2E Tester runs last as the verification gate.
2. Verify the transformation layer is correct by comparing Backend API responses against the shared TypeScript types in /packages/shared/. Any mismatch is a build-breaking issue.
3. After all teammates finish, manually test the extension on a real Meta Ads Manager page:
   - Open Meta Ads Manager in Chrome (extension must be loaded).
   - Navigate to campaign creation.
   - Check browser console for injection logs.
   - Verify that validation banners appear (or document which selectors fail).
   This manual test is the most important validation of Phase 1.5.
4. Synthesize a "Ready for Phase 2" report: what works, what selectors need updating, and what's ready for GCP deployment.

**Important constraints:**
- Stay on localhost. No GCP deployment in this phase.
- All "Lessons learned from Phase 1 build" in this document still apply — read them.
- Do NOT add new features (no second approver, no webhooks, no Slack). This phase is fix + test only.
- Require plan approval from all teammates before implementation.

Use delegate mode.
```

---

## Phase 2 — Bugfix + Feature Completion ✅ DONE

> **Context:** Phase 1.5 hardening is substantially complete. Backend transformation layer built (8 transformers, 28 endpoints). Admin portal pages fixed. Extension selectors 100% on mock fixtures. E2E: 13/20 passing. **Critical bug: Rules page not loading (blocks 4 E2E tests).** This phase starts with fixing that bug, then adds real features.

> **Team:** 5 teammates. Re-add separate Meta and Google adapter engineers for the end-to-end validation loop. Keep the tester role but fold it into the Architect's responsibilities.

> **Stay local for this phase.** Deploy in Phase 2.5 after all E2E tests pass.

```
Read ./SPEC.md — focus on "Implementation Progress (Phase 1.5)", "Known Issues", and Section 6.6 (Compliance Dashboard), 6.7 (Webhooks).

Phase 1.5 hardening is done. Backend has a transformation layer (Prisma → shared types), admin portal pages are fixed, extension selectors pass 100% on mock fixtures, and we have 13/20 E2E tests passing.

CRITICAL BUG: The Rules page is not loading at all — all 4 Rules E2E tests fail with 10s timeout. This must be fixed FIRST before any new features.

Additionally, 3 E2E tests fail due to ambiguous getByText() selectors (Dashboard: "Teams" and "Naming Template" match sidebar + stat cards; Teams: "US Social" matches name + description). Fix with getByRole().

Create an agent team with 5 teammates (all Opus 4.6):

**Teammate 1 — "Backend" (Opus 4.6)**
Owns: /packages/backend/
Tasks (in priority order):
1. FIRST: Investigate and fix the Rules page bug. Check:
   - Does GET /api/v1/admin/rules return 200? Test with curl.
   - Does the rule transformer crash on any edge case? (null ruleSet, missing fields, etc.)
   - Are Prisma includes correct? (must include { ruleSet: true, namingTemplate: true } relations)
   - Check backend logs for errors when the admin portal calls the rules endpoint.
   Fix whatever is broken. The Rules page must load before anything else.
2. Build the compliance dashboard aggregation API (Section 6.6): GET /api/v1/admin/compliance/dashboard with group_by parameter (market, team, buyer, account, rule_category). Return overall_score, breakdowns array, and time-series trends. Use PostgreSQL aggregation queries, not in-memory computation.
3. Build the webhook system (Section 6.7): POST /api/v1/admin/webhooks (CRUD). When a compliance event is created, fan out to registered webhook URLs. Payload: { event_type, timestamp, buyer, account, platform, rule, violation_details }. Use Cloud Pub/Sub topic + push subscription for reliable delivery.
4. Build a Slack integration module: format compliance events into Slack Block Kit messages. POST to Slack webhook URL.
5. Build an SSE endpoint: GET /api/v1/extension/rules-stream. Backed by a Cloud Pub/Sub subscription on the "rules-updated" topic. Extensions can subscribe to get real-time push updates instead of polling.
6. Add rule versioning: every rule edit creates a new version row. GET /api/v1/admin/rules/:id/versions returns the version history with diffs.
7. Prepare for GCP deployment: verify Dockerfile works with Cloud Run, add Secret Manager integration for production secrets, add Cloud SQL connection via Unix socket.

**Teammate 2 — "Admin Portal" (Opus 4.6)**
Owns: /packages/admin-portal/
Tasks (in priority order):
1. FIRST: Once Backend fixes the rules endpoint, verify the Rules page loads. If it still crashes, debug the frontend: check if rule.scope.platforms is the expected shape, add try/catch around the mapping, check browser console for React errors.
2. Fix the 3 E2E test selector ambiguities:
   - Dashboard: getByText('Teams') → getByRole('heading', { name: 'Teams' }) or scope within the stat card
   - Dashboard: getByText('Naming Template') → scope to quick action cards
   - Teams: getByText('US Social') → getByRole('cell', { name: 'US Social', exact: true })
3. Build the advanced compliance dashboard (Section 6.6): pie chart (compliance by rule category), line chart (compliance over time), tabbed breakdowns (by team, by buyer, by account). Use recharts. Wire to the new aggregation API.
4. Build drill-down views: click a team → see per-buyer compliance. Click a buyer → see per-campaign compliance events. Click a rule → see violation history.
5. Build the webhook configuration page at /settings/webhooks: CRUD for webhook URLs, test webhook button, delivery log viewer.
6. Add rule versioning UI: version history timeline on the rule edit page, diff viewer showing what changed between versions.
7. Build production auth flow: replace mock auth with real Firebase Auth Google sign-in. The login page must work both locally (mock user bypass) and in production (real Firebase). Use isLocalDev flag.

**Teammate 3 — "Extension Core" (Opus 4.6)**
Owns: /packages/extension/ (core modules, excluding adapters)
Tasks:
1. Implement the SSE-based rule sync: replace the 60-second polling with an EventSource connection to /api/v1/extension/rules-stream. Fall back to polling if SSE connection drops.
2. Build the full Guidelines Sidebar with live updates: collapsible categories, pass/fail badges that update in real time as fields change, click-to-scroll to the relevant field.
3. Build the Creation Blocker: intercept the platform's Publish/Create button click, show a modal listing all unmet blocking rules, link each to the relevant field.
4. Build the Comment Modal: inline form that appears when a comment-required rule is triggered. POST comment to /api/v1/compliance/comment.
5. Build the Budget Confirmation field: inject a confirmation input below the budget field, require the buyer to re-type the budget, validate match before allowing proceed.
6. Build the Campaign Score widget: circular SVG indicator (0-100) with weighted scoring per rule priority.
7. Fix the pre-existing TypeScript errors in meta-adapter.ts and meta-fields.ts (interceptCreation callback type, unused imports, HTMLElement casts).

**Teammate 4 — "Meta Adapter" (Opus 4.6)**
Owns: /packages/extension/src/adapters/meta/
Tasks:
1. Full end-to-end validation loop: field change → MutationObserver fires → extractFieldValues() → run rule evaluation → update ValidationBanners → update GuidelinesSidebar → update CampaignScore → debounced POST to /api/v1/compliance/events.
2. Add React Fiber deep extraction: for complex fields (targeting audiences, custom audiences, Advantage+ toggles) where the value isn't in a simple input, walk the React Fiber tree to extract from component state.
3. Handle Meta's multi-entity creation flow: when creating a campaign with an ad set and ad in one flow, track entity-level transitions and re-evaluate rules at each step.
4. Write Playwright E2E tests in /packages/e2e/ for Meta injection using the mock fixture at /packages/extension/test/fixtures/meta-campaign-creation.html. Test: validation banners appear, sidebar shows rules, creation blocker activates on violations.

**Teammate 5 — "Google Adapter" (Opus 4.6)**
Owns: /packages/extension/src/adapters/google/
Tasks:
1. Same end-to-end validation loop as Meta Adapter but for Google Ads.
2. Handle Google Ads campaign wizard steps: different fields are visible at different steps. Re-evaluate rules when the user navigates between steps.
3. Handle Shadow DOM: Google Ads uses Material Web Components with Shadow DOM. Ensure field extraction pierces shadow boundaries where needed.
4. Write Playwright E2E tests in /packages/e2e/ for Google injection using the mock fixture at /packages/extension/test/fixtures/google-campaign-wizard.html.

**Your role as Architect:**
1. FIRST PRIORITY: Ensure the Rules page bug is fixed. Backend investigates the API, Admin Portal investigates the frontend. The Rules page MUST load before any feature work begins.
2. Sequence after bugfix: Backend builds compliance API and webhooks. Admin Portal and Extension Core work in parallel. Meta and Google Adapter engineers start after Extension Core ships the sidebar, blocker, and score widgets.
3. After all teammates finish, run the full E2E test suite. Target: 20/20 passing (100%). If any fail, coordinate fixes.
4. Manually test the extension on a real Meta Ads Manager page and a real Google Ads page. Document which selectors pass and which need updating.
5. Prepare a GCP deployment plan: which services deploy to Cloud Run, Cloud SQL config, Firebase Auth production setup, Cloud Storage for admin portal.
6. Do NOT deploy to GCP — deployment is Phase 2.5.

**Lessons learned from Phase 1 + 1.5 (avoid these pitfalls):**
- Local dev auth: The admin portal uses isLocalDev flag to bypass Firebase Auth. api.ts sends btoa({ uid, email }) as Bearer token in local dev. The 401 response interceptor does NOT hard-redirect in local dev mode. Do not break this.
- Backend returns shared types (not Prisma models) thanks to the transformation layer. All new endpoints must also use transformers.
- Extension manifest has localhost in host_permissions for testing. Service worker has localhost URL patterns for mock fixtures.
- pnpm: onlyBuiltDependencies allowlist in root package.json prevents interactive prompts.
- The E2E test suite is in /packages/e2e/ with Playwright. Run with: cd packages/e2e && npx playwright test.

Use delegate mode.
```

---

## Step 1 — Fix Broken Features + Test on Real Platforms ✅ DONE

> **Context:** Phase 2 built all features and E2E tests pass at ~98%. BUT:
> - 3 admin portal features are broken (buttons with no click handlers)
> - The extension sidebar toggle message is silently dropped (no content script listener)
> - Selector QA found 33% of fields have NO mock fixture coverage, 3 HIGH-risk selectors, and estimated 60-75% pass rate on real platforms
> - **We do NOT deploy until selectors are validated on real Meta Ads Manager and Google Ads**

> **Team:** 3 teammates. Focus entirely on fixing what's broken and testing on real platforms.

> **What already exists from Phase 2.5 (do NOT redo this work):**
> - SELECTOR-VALIDATION.md — 1,140-line checklist with all 33 fields and 124 selector strategies (in /packages/extension/)
> - Terraform IaC provisioning 49 GCP resources at /infrastructure/terraform/ (ready but NOT to be used yet)
> - Deployment scripts: deploy-backend.sh, deploy-admin-portal.sh, seed-production.ts (at /infrastructure/)
> - RUNBOOK.md with deployment + rollback procedures (at /infrastructure/)
> - Production extension build: 44 KB .zip, manifest.prod.json, .env.production
> - PRODUCTION-LAUNCH-REPORT.md at project root (full status report)
> - PRODUCTION-TEST-PLAN.md with 10 test scenarios
> - Chrome Web Store listing draft + privacy policy

```
Read ./SPEC.md — focus on "Implementation Progress (Phase 2)", "Known Issues (Post Phase 2)", and the SELECTOR-VALIDATION.md in /packages/extension/.

Phase 2 features are built but several things are BROKEN and selectors are UNTESTED on real platforms. This step fixes the broken features and validates selectors before any deployment. DO NOT deploy to GCP in this step.

Create an agent team with 3 teammates (all Opus 4.6):

**Teammate 1 — "Admin Portal Fix" (Opus 4.6)**
Owns: /packages/admin-portal/
Priority: Wire up the 3 dead buttons and make the admin portal fully functional.
Tasks:
1. BROKEN: "Create Team" button in /packages/admin-portal/src/pages/Teams.tsx has NO onClick handler. Fix it:
   - Add a dialog/modal form with fields: team name, description, market/region.
   - On submit, call the existing useCreateTeam() hook from useApi.ts (it already POSTs to /admin/teams).
   - Invalidate the teams query after success so the list refreshes.
   - Add form validation (name required, min 2 chars).
   - Also wire up the empty-state "Create your first team" button.
2. BROKEN: "Add Account" button in /packages/admin-portal/src/pages/Accounts.tsx has NO onClick handler. Fix it:
   - Add a dialog/modal form with fields: account name, platform (Meta/Google Ads dropdown), platform account ID, market.
   - On submit, call the existing useCreateAccount() hook from useApi.ts (it already POSTs to /admin/accounts).
   - Invalidate the accounts query after success.
   - Add form validation (name required, platform required, platform account ID required).
   - Also wire up the empty-state "Add your first account" button.
3. Add edit and delete actions to both Teams and Accounts pages:
   - Each row should have an edit icon (opens pre-filled form dialog) and a delete icon (confirmation dialog → call useDeleteTeam/useDeleteAccount).
   - The hooks already exist in useApi.ts — just wire the UI.
4. After fixes, run the admin portal E2E tests: cd packages/e2e && npx playwright test tests/admin-portal/
   All 20 tests must still pass. Write 4 new E2E tests:
   - Create a new team via the form dialog → verify it appears in the list.
   - Create a new account via the form dialog → verify it appears in the list.
   - Edit team name → verify change persists.
   - Delete an account → verify it's removed from the list.

**Teammate 2 — "Extension Fix" (Opus 4.6)**
Owns: /packages/extension/
Priority: Fix the sidebar toggle and the 3 HIGH-risk selectors identified in SELECTOR-VALIDATION.md.
Tasks:
1. BROKEN: Sidebar toggle — the popup sends { type: 'toggleSidebar' } via chrome.tabs.sendMessage(), but the content script injector has NO message listener for this type. Fix it:
   - In the content script (likely /packages/extension/src/content/injector.ts or similar), add a chrome.runtime.onMessage listener that handles 'toggleSidebar' by calling sidebar.toggle().
   - Verify the message flow: popup.ts → chrome.tabs.sendMessage → content script listener → sidebar.toggle().
   - Test: click Toggle Sidebar in popup → sidebar shows/hides on the page.
2. Fix the 3 HIGH-risk selectors from SELECTOR-VALIDATION.md:
   - ad_set.targeting.custom_audiences (Meta) — MISSING from the selector registry. Add it with appropriate selectors (aria-label, data-testid fallbacks).
   - campaign.geo_targets (Google) — all selectors use SPECULATIVE class names. Review real Google Ads DOM structure and update.
   - ad.display_path strategy 3 (Google) — dangerously broad [aria-label*="Path"]. Narrow it down.
3. Add mock fixture coverage for the 11 uncovered fields (33% gap). For each missing field:
   - Add the HTML element to the appropriate fixture file in /packages/extension/test/fixtures/.
   - Add a selector test for that field.
   - Verify the selector passes on the fixture.
4. After fixes, run full extension tests: cd packages/e2e && npx playwright test tests/extension/
   All existing tests must still pass. Write tests for the 3 fixed selectors.

**Teammate 3 — "Real Platform Tester" (Opus 4.6)**
Owns: /packages/extension/SELECTOR-VALIDATION.md and /packages/extension/test/fixtures/
Priority: Test the extension on REAL Meta Ads Manager and REAL Google Ads pages. This is the most important task.
Prerequisites: You need the owner (Léon) to log into Meta Ads Manager and Google Ads in Chrome with the extension loaded. You cannot do this yourself — instead, prepare everything so manual testing is as fast as possible.
Tasks:
1. Create a MANUAL-TEST-GUIDE.md at the project root with step-by-step instructions for Léon to test:
   - How to load the extension in Chrome (chrome://extensions → Developer mode → Load unpacked → select /packages/extension/dist/).
   - How to pair the extension (open popup → enter invite code → verify "DLG" appears).
   - Meta Ads Manager test checklist:
     a. Navigate to adsmanager.facebook.com → Campaigns → Create
     b. For each field in SELECTOR-VALIDATION.md Meta section: does a validation banner appear? Y/N
     c. Change campaign name to a non-compliant value → does the banner turn red?
     d. Click Publish → does the Creation Blocker modal appear?
     e. Does the Guidelines Sidebar show on the right? Can you toggle it from the popup?
     f. Does the Campaign Score widget show in the top-right corner?
   - Google Ads test checklist:
     a. Navigate to ads.google.com → Campaigns → New Campaign
     b. Same field-by-field check as Meta
     c. Navigate through wizard steps → do rules update per step?
     d. Does Shadow DOM piercing work for Material components?
   - For each selector that FAILS, note: field name, expected element, what the DOM actually looks like (Inspect Element → copy outer HTML of the area).
2. Create a test-results-template.md that Léon can fill in during manual testing: a simple table with field / expected / actual / pass-fail columns.
3. Build a "selector debug mode" for the extension:
   - Add a button in the popup labeled "Selector Debug Mode".
   - When enabled, the content script overlays a colored border on every element it successfully finds via selectors (green = found, red = expected but missing).
   - This makes manual testing 10x faster — Léon can see at a glance which selectors hit and which miss.
4. Update the extension build: pnpm build in /packages/extension/ so the latest code (with sidebar toggle fix, selector fixes, debug mode) is in /dist/.

**Your role as Architect:**
1. Admin Portal Fix and Extension Fix teammates work in parallel (no dependencies).
2. Real Platform Tester prepares the test guide and debug mode in parallel.
3. After all 3 teammates finish, run the FULL E2E test suite: cd packages/e2e && npx playwright test
   Target: all existing tests still pass + new tests for the fixed features.
4. DO NOT proceed to deployment. The output of this step is:
   - Fixed admin portal (team/account forms work)
   - Fixed extension (sidebar toggle works, 3 high-risk selectors fixed)
   - MANUAL-TEST-GUIDE.md ready for Léon to test on real platforms
   - Selector Debug Mode in the extension
5. Write a "Ready for Manual Testing" summary for Léon.

**Lessons learned (avoid these pitfalls):**
- Shared package exports MUST support both CJS and ESM. The backend uses require() (CJS), the admin portal uses import (ESM).
- Local dev auth: isLocalDev flag + mock user + btoa JSON Bearer token. Do NOT break this.
- 401 response interceptor: console.warn in local dev, NOT window.location.href redirect.
- Backend returns shared types via transformation layer. All endpoints use transformers.
- Extension uses Shadow DOM isolation for injected components.
- Mock fixtures must match real ad platform DOM. When selectors change, update fixtures too.
- pnpm: onlyBuiltDependencies allowlist prevents interactive prompts.

Use delegate mode.
```

---

## Manual Testing Gate (Léon — ~2-3 hours) ✅ DONE

> **COMPLETED.** All code was written and feature-complete. Léon tested the new features and validated selectors on real ad platforms before proceeding to Step 3.

**Pre-test setup:**
```bash
cd /path/to/media-buying-governance
pnpm prisma migrate dev          # Apply webhook_deliveries migration
pnpm build                        # Rebuild all packages
```

**Checklist:**
- [ ] Test approval workflow end-to-end: create request from extension → approve in admin portal → extension receives approval
- [ ] Test organizations CRUD in admin portal (/organizations — super_admin only)
- [ ] Test rule sets CRUD in admin portal (/rule-sets)
- [ ] Test compliance events filtering (/compliance — filter by buyer, account, rule, status, date range)
- [ ] Test webhook delivery logs (/settings/webhooks → delivery history)
- [ ] **P0:** Load extension in Chrome → test on **real Meta Ads Manager** → fill in selector test results
- [ ] **P0:** Load extension in Chrome → test on **real Google Ads** → fill in selector test results
- [ ] Record results in TEST-RESULTS.md (use MANUAL-TEST-GUIDE.md for instructions)

**If selectors fail on real platforms:** Note which fields fail and what the real DOM looks like (copy outerHTML). The Google Selector Fix teammate in Step 3 will use these results. If Meta selectors fail, the require() refactor in Step 3 will fix most of them by eliminating DOM dependency.

---

## Step 3 — Refactor Meta Adapter + Production Infrastructure + GCP Deployment ✅ DONE

> **Context:** Steps 1, 1.5, and 2 are complete. The platform is 100% feature-complete for v1: all admin portal CRUD operations work (accounts, teams, users, rules, naming templates, organizations, rule sets), approval workflow is end-to-end functional (backend API + admin inbox + extension modal), compliance events have filtering/pagination, webhook delivery logging is built, and 114+/116 E2E tests pass. A deep competitive analysis of Grasp v26 revealed that DOM/CSS selectors are the WRONG approach for Meta field extraction. Grasp uses Facebook's internal `require()` module system and React Context selectors to read campaign state directly from memory — resulting in only 3 querySelector calls vs DLG's 124. This step refactors the Meta adapter to use the same approach, expands the rule catalog from 18 to 88 rules, adds production-grade infrastructure (error tracking, analytics, feature flags) copied from Grasp, then deploys to GCP.

> **CRITICAL ARCHITECTURE CHANGE:** Read GRASP-COMPETITIVE-ANALYSIS.md, GRASP-ARCHITECTURE-SPEC.md, and SPEC.md Section 11.4.1 + Appendix C.9 for full details.

> **What Step 1 delivered (do NOT redo this work):**
> - Admin portal: Create Team and Add Account form dialogs fully wired with validation, edit/delete actions per row
> - Extension: Sidebar toggle fixed (popup → content script listener → sidebar.toggle())
> - 3 HIGH-risk selectors fixed: custom_audiences (Meta, was missing), geo_targets (Google, was speculative), display_path (Google, was too broad)
> - Mock fixture coverage raised to 100% (was 67%) — all 33 fields now have fixture coverage
> - Selector Debug Mode: visual overlay in extension (green borders = found, red banners = missing)
> - MANUAL-TEST-GUIDE.md at project root with step-by-step instructions
> - TEST-RESULTS.md template for recording results
> - 10 new E2E tests (all passing, total 114+/116)
> - Extension built to /packages/extension/dist/ with latest code

> **What Step 1.5 delivered (do NOT redo this work):**
> - Fixed Account creation (removed organizationId from payload — backend derives from @CurrentUser())
> - Fixed Team creation (same organizationId fix)
> - Fixed Rule updates (errors now logged and displayed to user instead of swallowed)
> - NEW: Users management page (550 lines) — create/edit/delete users, 4 roles (Super Admin, Admin, Viewer, Media Buyer), multi-select team assignment, role badge display
> - Route: /users added to App.tsx, "Users" added to sidebar navigation
> - Type safety improvements: `Omit<T, 'id' | 'organizationId'>` patterns throughout hooks

> **What Step 2 (Gap Closure Sprint) delivered (do NOT redo this work):**
> - **Approval Request Backend API** (Task #33): 5 REST endpoints at /api/v1/extension/approval/* and /api/v1/admin/approval/* — create, poll status, cancel, list for approver, approve/reject. 26 integration tests. Validates approver role, prevents self-approval, stores campaign snapshot JSON.
> - **Compliance Events List Endpoint** (Task #34): GET /api/v1/admin/compliance/events with filters (buyerId, accountId, ruleId, status, dateFrom, dateTo), pagination (limit/offset), org scoping. Returns { events, total }.
> - **Webhook Delivery Logging** (Task #35): New `webhook_deliveries` DB table + Prisma migration. Logs all delivery attempts with statusCode, requestBody, responseBody, error, duration. GET /api/v1/admin/webhooks/deliveries endpoint.
> - **Approval Requests Inbox Page** (Task #36): Admin portal at /approvals — tab navigation (Pending with badge count, Approved, Rejected, All), detail dialog with campaign snapshot, approve (optional comment) / reject (required comment) buttons, 30s polling via refetchInterval.
> - **Extension Approval Request Flow** (Task #37): Shadow DOM modal (354 lines) with spinner animation, 5s status polling, cancel button, auto-destroy on completion. Integrated into both Meta and Google adapters (+110 lines each). API client at /packages/extension/src/api/client.ts.
> - **Organizations Management Page** (Task #38): Admin portal at /organizations — full CRUD, plan management (Free/Pro/Enterprise badges), slug validation (lowercase, alphanumeric + hyphens), type-to-confirm delete, super_admin only visibility. 21 KB component.
> - **Rule Sets Management Page** (Task #39): Admin portal at /rule-sets — full CRUD, account/team multi-select assignment, rules count display, RuleBuilder integration ("Create one now" + "Manage Rule Sets" links). 591 lines.
> - **Totals:** ~4,500 lines of code, 17 new files, 12 modified files, 45+ test cases

> **What already exists from Phase 2.5:**
> - Terraform IaC at /infrastructure/ provisioning 49 GCP resources
> - Deployment scripts: deploy-backend.sh, deploy-admin-portal.sh
> - RUNBOOK.md with full deployment procedures
> - seed-production.ts for first org setup
> - .env.production for admin portal
> - PRODUCTION-LAUNCH-REPORT.md, PRODUCTION-TEST-PLAN.md
> - Chrome Web Store listing draft + privacy policy

> **What Step 3 delivered (all 5 teams complete):**
> - **Team 1 — Meta Adapter Refactor** ✅: eval-bridge.ts fully rewritten with 12+ helper functions (FindReact, FindReactFiber_v17, FindReactNodes, GetCompFiber, FindContexts, FindFacebookContextSelector, FindPath, FacebookClearExtensionDetection, FindVue, FindJQuery, FindContext_v0). require() + React Context as PRIMARY extraction. Transferable ArrayBuffer for zero-copy postMessage. Body-level CSS state classes (body.dlg-invalid-{field} / body.dlg-valid-{field}). webNavigation.onCompleted replaces tabs.onUpdated. history.pushState patching for SPA navigation. Fallback chain: require() → React Context → React Fiber → multi-framework → DOM. DLG-namespaced events (evalQuery.governance / evalResult.governance). **318 tests passing.**
> - **Team 2 — Rules Engine Expansion** ✅: 88-rule catalog (was 18). 19 new RuleType enum values added to shared types. 10 new RuleOperator values. rule-catalog.ts with full category/priority mapping. Rule Builder UI updated with all new types. Rule evaluator expanded for all operators. 10 seed rules for new types. **All backend + admin portal tests passing.**
> - **Team 3 — Google Selector Fix** ✅: Shadow DOM piercing optimized to O(Material components) instead of O(all nodes). ARIA selectors strengthened for all Google Ads fields. Mock fixtures updated for all 33 fields. **253 unit tests + 22 E2E tests passing.**
> - **Team 4 — Production Infra** ✅: @sentry/react (admin portal) + @sentry/nestjs (backend) + @sentry/browser (extension) integrated with source map upload, error boundaries, breadcrumbs, org/user/platform context tags. PostHog analytics: 100% admin portal sampling, 10% extension field extraction sampling, key events tracked (rule_created, compliance_violation, require_extraction). Split.io feature flags: enable-require-extraction and enable-expanded-rules flags with 30s cache TTL, rollout plan DLG → 10% → 50% → 100%. Terraform secrets updated for Sentry DSN, PostHog key, Split.io key. **30 instrumentation tests passing.**
> - **Team 5 — Deploy** ✅: Terraform configuration updated for production secrets. Production .env.production files created for admin portal and extension. PRODUCTION.md (770 lines) with full GCP deployment procedures. DEPLOYMENT-CHECKLIST.md (239 lines) with operational checklist. Enhanced deployment scripts with validation checks. All required credentials documented with sourcing instructions. **Platform production-ready.**

> **Key reference files for the refactor:**
> - `GRASP-COMPETITIVE-ANALYSIS.md` — full competitive analysis with all 88 Grasp rules and architecture comparison
> - `GRASP-ARCHITECTURE-SPEC.md` — deep-dive reverse-engineered architecture (15 sections, 700+ lines)
> - `SPEC.md` Section 11.4.1 — eval-bridge helper functions and Facebook `require()` modules
> - `SPEC.md` Appendix B — expanded Meta field map (88 rules with extraction sources)
> - `SPEC.md` Appendix C.9 — Grasp's `require()` + React Context architecture details

```
Read ./SPEC.md (focus on Section 11.4.1, Section 12.1, Appendix B, Appendix C.9), ./GRASP-COMPETITIVE-ANALYSIS.md, and ./GRASP-ARCHITECTURE-SPEC.md.

This step has four parts:
1. Refactor the Meta adapter from DOM/CSS selector extraction to Facebook's internal require() + React Context strategy
2. Expand the Meta rule catalog from 18 to 88 rules
3. Add production-grade infrastructure (error tracking, analytics, feature flags) from Grasp parity
4. Deploy to GCP

Create an agent team with 5 teammates (all Opus 4.6):

**Teammate 1 — "Meta Adapter Refactor" (Opus 4.6)**
Owns: /packages/extension/src/adapters/meta/ and /packages/extension/src/eval-bridge.ts
Priority: This is the most important task. Replace DOM selector extraction with require() + React Context. Copy all infrastructure patterns from Grasp.
Tasks:
1. Read GRASP-COMPETITIVE-ANALYSIS.md, GRASP-ARCHITECTURE-SPEC.md, and SPEC.md Section 11.4.1 + Appendix C.9.
2. Rewrite eval-bridge.ts to inject the following helper functions into MAIN world (via chrome.scripting.executeScript({ world: 'MAIN', injectImmediately: true })):
   - FindReact(element, levels) — get React component state from a DOM element
   - FindReactFiber_v17(element) — direct React Fiber access (checks __reactFiber$ and __reactInternalInstance$)
   - FindReactNodes(element) — traverse fiber tree for all nodes
   - GetCompFiber(fiber) — walk up fiber hierarchy to find component fiber
   - FindContexts(element) — extract all React Context values from a DOM element
   - FindFacebookContextSelector(contexts, selectorName) — call Facebook's internal Redux-like selectors by name
   - FindPath(element, keys) — deep property traversal via dot-path
   - FacebookClearExtensionDetection() — disable Meta's extension detection by overriding require("AdsBrowserExtensionErrorUtils").isBrowserExtensionError = () => false
   - FindVue(element, levels) — extract Vue 2/3 component state (for future platform adapters)
   - FindJQuery(element) — jQuery data extraction if present
   - FindContext_v0(element) — generic context API pattern matching
3. Use DLG-namespaced events: CustomEvent('evalQuery.governance') for requests, postMessage('evalResult.governance') for responses (avoid collision with Grasp's evalQuery.gg).
4. Implement Transferable ArrayBuffer communication: for large field payloads, use TextEncoder + transferable objects in postMessage to avoid copying overhead (copy Grasp's optimization pattern — see GRASP-ARCHITECTURE-SPEC.md Section 7).
5. Implement body-level CSS state classes: add/remove `body.dlg-invalid-{field}` and `body.dlg-valid-{field}` classes to mark validation state at document level (allows CSS cascading to injected components without postMessage — see GRASP-ARCHITECTURE-SPEC.md Section 10).
6. Replace tabs.onUpdated with webNavigation.onCompleted for platform detection — more reliable for detecting page navigation completion (Grasp pattern — see GRASP-ARCHITECTURE-SPEC.md Section 5).
7. Add history.pushState patching: intercept history.pushState() to detect in-app navigation (SPA route changes) without full page reload. Use during programmatic operations to prevent React from resetting state.
8. Rewrite meta-fields.ts extractFieldValues() to use require() as PRIMARY extraction:
   - Call require("AdsCampaignStructureSelectors").getFlatTreeItemsSelector() to get the full campaign tree with ALL field values from memory
   - Call callSelector(contexts, "selectedCampaignGroupsSelector") for campaign data
   - Call callSelector(contexts, "campaignsForSelectedCampaignGroupsSelector") for adset data
   - Call callSelector(contexts, "adgroupsForSelectedCampaignGroupsSelector") for ad data
   - Call require("AdsAPICampaignGroupRecordUtils").getObjective() for campaign objective
   - Call require("AdsDraftFragmentDataManager") for draft editing state
   - Call require("adsPECurrentDraftIDSelector") for current draft ID
   - Call require("adsCFMaybeCampaignGroupRecordSelector") for campaign group records
9. Keep CSS selectors ONLY for:
   - Injection points (where to place validation banners in the DOM)
   - Button interception (finding Publish/Next button) — use data-surface attributes: data-surface="/am/table/lib:creation-button" and data-surface="/am/lib:convergence_alt_modal_geo/lib:completion-button"
   - Scroll-to-field (scrolling user to relevant section when they click a rule)
10. Implement fallback chain: require() → React Context selectors → React Fiber traversal (FindReact) → multi-framework helpers (FindVue, FindJQuery, FindContext_v0) → DOM selectors (last resort).
11. Call FacebookClearExtensionDetection() on content script injection to prevent Meta's extension detection warnings.
12. Write unit tests for:
    - Each eval-bridge helper function (including FindVue, FindJQuery, FindContext_v0)
    - Field extraction via require() (mock the require() responses)
    - Transferable ArrayBuffer communication (verify no copy overhead)
    - Body CSS state classes (verify DOM updates)
    - webNavigation.onCompleted event handling
    - history.pushState interception
    - Fallback chain (when require() fails, falls back to React Context, then Fiber, then multi-framework, then DOM)
13. Update mock fixtures to test injection point selectors and CSS state classes.
14. Verify injectImmediately: true works on first page load (Grasp optimization — content script runs before DOM is ready).

**Teammate 2 — "Rules Engine Expansion" (Opus 4.6)**
Owns: /packages/shared/, /packages/backend/src/, /packages/admin-portal/src/
Priority: Expand the rule catalog to support all 88 Meta rule types. Coordinate type definitions with Meta Adapter Refactor.
Tasks:
1. Read SPEC.md Appendix B for the full 88-rule catalog with categories, field paths, and priorities.
2. Add new rule types to /packages/shared/src/types/:
   - spending_limit — campaign spending limit enforcement
   - special_ad_categories — legal compliance (housing, credit, politics)
   - pixel_conversion — pixel and conversion event validation
   - bid_value — max/target bid enforcement
   - frequency_cap — frequency cap requirement
   - tracking_url — tracking URL template validation
   - status_enforcement — prevent accidental "Active" launch
   - identity_enforcement — Instagram account + Facebook Page selection
   - inventory_filter — brand safety inventory controls
   - performance_goal — optimization alignment
   - billing_event — cost model governance
   - audience_control — Advantage+ prevention, targeting expansion prevention, saved audience
   - placement_control — manual vs automatic, specific placements, placement count
   - duration_enforcement — min/max flight dates
   - eu_compliance — beneficiary + payer (DSA requirements)
   - day_scheduling — dayparting requirements
   - creative_specs — video duration/format, carousel card count, flexible media
   - confirmation — re-type budget, spending limit, dates
   - media_plan — linking to media plans, enforcing budget/dates from plan
3. Update the rule evaluation engine in /packages/extension/src/rule-evaluator.ts to handle the new rule types. Each new type needs an operator implementation.
4. Update the Rule Builder UI in /packages/admin-portal/ to show the new rule types in the type selector dropdown, with appropriate condition configurators for each.
5. Add seed data for 5-10 representative new rules (covering the high-priority ones: spending_limit, special_ad_categories, pixel_conversion, status_enforcement, identity_enforcement).
6. Update the Prisma schema if any new columns are needed for the expanded rule types.
7. Run backend and admin portal tests to verify nothing breaks.

**Teammate 3 — "Google Selector Fix" (Opus 4.6)**
Owns: /packages/extension/src/adapters/google/
Priority: Ensure Google Ads selectors work on real platform. Google does NOT get require() refactor (Google doesn't expose internal modules).
Tasks:
1. Read the manual test results for Google Ads (if available). Fix any selectors that failed on real platforms.
2. Pay special attention to Shadow DOM selectors — if they fail, the piercing strategy may need updating.
3. Re-run Google E2E tests. All must pass.
4. NOTE: Google Ads does NOT get the require() refactor — Google doesn't expose internal modules the same way. Keep the existing Material component + Shadow DOM traversal approach for Google.

**Teammate 4 — "Production Infra" (Opus 4.6)**
Owns: /packages/extension/src/instrumentation/, /packages/backend/src/instrumentation/, /packages/admin-portal/src/instrumentation/
Priority: Add production-grade infrastructure copied from Grasp: error tracking (Sentry), analytics (PostHog), feature flags (Split.io or LaunchDarkly). See GRASP-ARCHITECTURE-SPEC.md Section 11 for Grasp's approach.
Tasks:
1. Read GRASP-ARCHITECTURE-SPEC.md Section 11 (API & Backend Architecture) for Grasp's production infrastructure patterns.
2. Implement Sentry error tracking across all three packages:
   - Add @sentry/react to admin portal: initialize in main.tsx with DSN from environment, error boundary component wrapping App, breadcrumbs for route changes and API calls.
   - Add @sentry/nestjs to backend: initialize in main.ts, enable request and database breadcrumbs, capture unhandled exceptions via NestJS exception filter integration.
   - Add @sentry/browser to extension: initialize in service worker and content scripts, capture unhandled promise rejections, console errors, and eval-bridge communication failures.
   - Configure source maps upload for all three packages (sentry-webpack-plugin for admin portal, manual upload for extension).
   - Tag all errors with { org_id, user_id, platform } context for filtering.
3. Implement PostHog analytics:
   - Add posthog-js to admin portal: initialize after login with org_id as group, track page views, rule CRUD operations, compliance dashboard views.
   - Add PostHog to extension: track rule sync events, field extraction success/failure rates, injection point success, require() fallback chain usage.
   - Add PostHog to backend: track API request volumes, rule evaluation counts, compliance event ingestion rates.
   - Key events to track: identify(org_id, user_email), track('rule_created', { rule_type, scope }), track('compliance_violation', { platform, entity_level, rule_type }), track('require_extraction', { success, fallback_level }).
   - Configure sampling rate (100% for admin portal, 10% for extension field extraction events to avoid noise).
4. Implement feature flags (Split.io or LaunchDarkly):
   - Add split SDK to extension: check 'enable-require-extraction' flag per org_id — controls whether require() extraction is used vs DOM selectors (rollout safety net).
   - Add split SDK to backend: check 'enable-expanded-rules' flag before returning new rule types in the catalog.
   - Add split SDK to admin portal: conditionally show new rule types in Rule Builder based on flag.
   - Rollout plan: DLG org first → 10% of new orgs → 50% → 100%.
   - Cache flag values with 30-second TTL, refresh on extension popup open.
5. Store all credentials in GCP Secret Manager:
   - Sentry DSN, PostHog API key, Split.io SDK key.
   - Inject via environment variables to Cloud Run services.
   - Extension: embed in manifest or fetch from backend /api/v1/config endpoint.
6. Write instrumentation tests:
   - Verify Sentry captures unhandled errors (mock Sentry client).
   - Verify PostHog tracks key events (mock PostHog client).
   - Verify feature flags return correct values and cache properly.
   - Verify feature flag toggle disables require() extraction and falls back to DOM.
7. Set up monitoring dashboards:
   - Cloud Run: error rates, latency (p50, p95, p99), memory usage, instance count.
   - Cloud SQL: query performance, connection pool health, replication lag.
   - Cloud Pub/Sub: message throughput, dead-letter queue depth.
   - Sentry: error volume by service, new issue alerts.
   - PostHog: event volume, require() extraction success rate dashboard.

**Teammate 5 — "Deploy" (Opus 4.6)**
Owns: /infrastructure/ and deployment scripts
Priority: Deploy entire system to GCP. Start AFTER Meta Adapter Refactor, Rules Engine Expansion, and Production Infra are complete.
Tasks:
1. The Terraform IaC and deployment scripts already exist at /infrastructure/. Use them.
2. Update Terraform to add resources for production infrastructure (Secret Manager entries for Sentry DSN, PostHog key, Split.io key).
3. Run Terraform to provision GCP resources (or use the gcloud CLI scripts if Terraform isn't configured).
4. Deploy backend to Cloud Run:
   - Build Docker image, push to Artifact Registry.
   - Deploy to Cloud Run (min 0 / max 3 instances, 512MB, 1 vCPU).
   - Run Prisma migration on Cloud SQL (including webhook_deliveries table from Step 2 + any new columns from Rules Engine Expansion).
   - Seed with DLG org data using seed-production.ts.
   - Set environment variables: Sentry DSN, PostHog API key, Split.io SDK key, Firebase Auth config.
5. Deploy admin portal:
   - Build production bundle with real Firebase config (.env.production).
   - Include Sentry DSN, PostHog API key in production environment.
   - Upload to Cloud Storage bucket, configure CDN + CORS + SPA routing.
   - Upload Sentry source maps.
6. Set up Firebase Auth production:
   - Enable Google sign-in, configure authorized domains.
   - Verify isLocalDev does NOT trigger (real API key, not 'fake-key-for-local-dev').
7. Prepare Chrome extension for production:
   - Update manifest.json with production API URL and admin portal URL.
   - Include Sentry DSN, PostHog API key, Split.io SDK key in extension config.
   - Remove localhost from host_permissions.
   - Set version 1.0.0, add proper name ("DLG Governance"), description, icons.
   - Build .zip for Chrome Web Store.
   - Upload Sentry source maps for extension.
   - Set up as PRIVATE listing (unlisted, invite-only).
8. Test deployed system end-to-end:
   - Admin portal loads, Firebase Auth works, Dashboard shows data.
   - Rules CRUD works (including new rule types), compliance dashboard aggregation works.
   - Approval workflow works: create request from extension → approve in admin inbox → extension receives.
   - Organizations CRUD works (super_admin only).
   - Rule Sets CRUD works with account/team assignment.
   - Compliance events list with filtering and pagination works.
   - Webhook delivery logs are recorded and viewable.
   - Extension pairs with production backend.
   - Rule sync (SSE or polling fallback) works.
   - Feature flag changes propagate to extension within 30 seconds.
   - Trigger test error → verify it appears in Sentry.
   - Create test rule → verify analytics event appears in PostHog.
9. Set up alerting:
   - Sentry: alert on error rate spike or new unhandled exception type.
   - Cloud Run: alert on error rate > 1% or p95 latency > 2s.
   - Cloud SQL: alert on connection errors or query timeouts > 5s.
   - Uptime check: /healthz endpoint, 5-minute interval, alert if down > 5 min.
10. Document production URLs and access details in PRODUCTION.md: Cloud Run service URL, admin portal URL, Sentry project URL, PostHog dashboard URL, Split.io control panel URL, monitoring dashboard links.

**Your role as Architect:**
1. **ALL 5 TEAMS ARE COMPLETE.** Step 3 is finished. This prompt is now archival reference only.
2. Meta Adapter Refactor (318 tests), Rules Engine Expansion (88 rules), Google Selector Fix (253 tests + 22 E2E), Production Infra (Sentry + PostHog + Split.io, 30 tests), and Deploy (PRODUCTION.md + DEPLOYMENT-CHECKLIST.md + Terraform configs + .env.production files) are all done.
3. **Next action for Léon:** Follow PRODUCTION.md and DEPLOYMENT-CHECKLIST.md to deploy to GCP. Steps: obtain credentials → configure terraform.tfvars → terraform apply → deploy-backend.sh → deploy-admin-portal.sh → build + upload extension to Chrome Web Store.
4. After deployment, test the full flow: sign in → create rule (including new types) → load extension → navigate to Meta Ads Manager → verify require() extraction works → verify injection points work → verify Sentry/PostHog/Split.io are operational.
5. CRITICAL: Feature flags must control the require() extraction rollout — start with DLG org only, monitor success rate in PostHog, then expand.

**Lessons learned (avoid these pitfalls):**
- Shared package exports MUST support both CJS and ESM. The backend uses require() (CJS), the admin portal uses import (ESM).
- Local dev auth: isLocalDev flag + mock user + btoa JSON Bearer token. Do NOT break this.
- 401 response interceptor: console.warn in local dev, NOT window.location.href redirect.
- Backend returns shared types via transformation layer. All endpoints use transformers.
- Extension uses Shadow DOM isolation for injected components.
- pnpm: onlyBuiltDependencies allowlist prevents interactive prompts.
- The eval-bridge.ts helper functions MUST be injected into MAIN world (not ISOLATED world) to access require() and React internals.
- Use DLG-namespaced events (evalQuery.governance / evalResult.governance), NOT Grasp's namespace (evalQuery.gg).
- FacebookClearExtensionDetection() MUST be called early to prevent Meta from detecting the extension.
- Transferable ArrayBuffer communication requires proper ownership transfer — use the transferList parameter in postMessage, not just in the message payload. See GRASP-ARCHITECTURE-SPEC.md Section 7 for implementation details.
- Body CSS state classes must be added/removed DURING field extraction (before rule evaluation completes) for styling to cascade properly to injected UI components.
- webNavigation.onCompleted fires after full page load — coordinate with injectImmediately: true for earliest possible injection.
- PostHog sampling: 100% for admin portal, 10% for high-frequency extension events (field extraction, CSS class updates). Configurable per org via feature flag.
- Split.io rollout: start with DLG org only, monitor require() extraction success rate in PostHog, then expand rollout once >95% success rate confirmed.
- Sentry should NOT capture rule evaluation "violations" (expected behavior) — only capture unexpected errors, unhandled rejections, and eval-bridge communication failures.
- Feature flag changes may not propagate instantly — extension caches flags with 30s TTL, refreshes on popup open and rule sync events.
- Backend CRUD endpoints expect organizationId from @CurrentUser() decorator, NOT from the request body. Frontend must NOT send organizationId in create payloads (Step 1.5 lesson).
- Approval system already exists: 5 backend endpoints, admin inbox at /approvals, extension modal with 5s polling. Do NOT rebuild — only upgrade polling to SSE push if needed.
- Webhook deliveries table requires migration: run `pnpm prisma migrate dev` if webhook_deliveries table doesn't exist.
- Organizations page is super_admin only (superAdminOnly: true flag in sidebar navigation). Rule Sets page is visible to all admins.
- Extension approval flow stores requestId in chrome.storage.local for persistence across page reloads.

Use delegate mode.
```

---

## Step 4 — Bug Fixes & UX Polish (Post Chrome Testing)

> **Context:** Step 3 is complete and the platform is production-ready. A comprehensive 2-round manual test on real Chrome (live Meta Ads Manager + admin portal) found 7 bugs across 3 severity levels. This step fixes all of them. Full test results are in TEST-RESULTS.md at the project root.
>
> **Test Summary:** 19 test areas, ~85% pass rate. 14 PASS, 3 PARTIAL, 1 KNOWN ISSUE, 1 NOT OBSERVED. The end-to-end flow (admin creates rule → extension enforces it on Meta) works. But 2 HIGH bugs block key UI workflows, and 5 MEDIUM/LOW bugs degrade UX.
>
> **What the Chrome testing confirmed works:**
> - Creation Blocker shows accurate violations on real Meta Ads Manager (4 blocking violations detected)
> - Guidelines Sidebar fully functional (7 rules across 3 categories, compliance scoring)
> - New rules created via API are picked up by the extension in real-time
> - Campaign name input triggers Meta auto-save and extension detects the change
> - All 30 rule types available in Rule Builder with dynamic condition fields
> - Admin portal navigation, Rules page (11 rules), Compliance Dashboard all functional
>
> **What this step fixes (from TEST-RESULTS.md + additional Chrome observations):**
> - HIGH #1: Save Rule button on Preview step doesn't make API call
> - HIGH #2: Approvals page tabs (Approved/Rejected/All) return errors
> - HIGH #3: Guidelines Sidebar & Campaign Score render at page bottom instead of floating (CSS `all: initial` kills `position: fixed`)
> - MEDIUM #4: Edit Rule form doesn't pre-select Rule Set dropdown
> - MEDIUM #5: Meta "Malfunctioning browser extension" warning still appearing
> - LOW #6: "Click to go to field" links in Creation Blocker don't navigate
> - LOW #7: No inline per-field validation banners on real Meta Ads Manager
> - LOW #8: Publish button intercept timing vs Meta's native dialogs

```
Read ./SPEC.md (focus on Section 11.4.1 and Section 12.1), ./TEST-RESULTS.md (the full Chrome testing results), and ./CLAUDE.md.

Step 3 is complete. A comprehensive Chrome test on real Meta Ads Manager found 8 bugs (3 HIGH, 2 MEDIUM, 3 LOW). This step fixes all of them. Read TEST-RESULTS.md for the full details of each bug.

Create an agent team with 4 teammates (all Opus 4.6):

**Teammate 1 — "Admin Portal & Backend Fix" (Opus 4.6)**
Owns: /packages/admin-portal/ and /packages/backend/
Priority: Fix the 2 HIGH bugs and 1 MEDIUM bug that affect the admin portal.
Tasks:

1. **HIGH — Fix Save Rule button on Rule Builder Preview step.**
   The Save Rule button (`type="submit"` at line 465 of RuleBuilder.tsx) does NOT trigger an API call when clicked on the Preview step (step 4). During Chrome testing, clicking Save Rule produced zero network requests, zero console errors, and zero feedback.

   **Root cause:** The form uses `zodResolver(ruleBuilderSchema)` (line 224) with Zod validation. The `form.handleSubmit(onSubmit)` at line 439 runs validation BEFORE calling `onSubmit`. If ANY required field fails Zod validation, `handleSubmit` silently swallows the error — it never calls `onSubmit` (line 296) and never shows an error to the user. The schema has 5 required `min(1)` fields: `name`, `description`, `ruleSetId`, `message`, `category` (lines 45-84). If any of these are empty strings at submit time, validation fails silently.

   **Fix (two parts):**

   a) Add a validation error handler to `form.handleSubmit`. Change line 439 from:
      ```tsx
      <form onSubmit={form.handleSubmit(onSubmit)}>
      ```
      to:
      ```tsx
      <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
        console.error('Rule Builder validation errors:', errors);
        const firstError = Object.values(errors)[0];
        if (firstError && 'message' in firstError) {
          toast.error(String(firstError.message));
        } else {
          toast.error('Please fill in all required fields before saving.');
        }
      })}>
      ```

   b) Add per-step validation so the "Next" button on each step validates THAT step's required fields before advancing. Currently `goNext` (line 284) blindly increments `currentStep` with no validation. Wrap it:
      ```tsx
      const goNext = useCallback(async () => {
        const fieldsPerStep: Record<number, (keyof RuleBuilderFormData)[]> = {
          0: ['name', 'description', 'ruleSetId'],
          1: ['platforms', 'entityLevels'],
          2: ['ruleType'],
          3: ['enforcement', 'message', 'category'],
        };
        const fields = fieldsPerStep[currentStep];
        if (fields) {
          const valid = await form.trigger(fields);
          if (!valid) {
            toast.error('Please fill in all required fields before continuing.');
            return;
          }
        }
        setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
      }, [currentStep, form]);
      ```

   c) After the fix, test: create a rule through all 5 steps → click Save Rule → confirm a POST request is made to `/api/v1/admin/rules` → verify the rule appears in the Rules table.

2. **HIGH — Fix Approvals page tab errors.**
   The Approvals page at `/approvals` has 4 tabs: Pending, Approved, Rejected, All. Pending works. The other 3 return errors (the test showed "The requested resource was not found").

   **Investigation steps:**
   a) The ApprovalRequests.tsx page (lines 38-41) fetches ALL 4 tabs eagerly on mount:
      - `useApprovalRequests('pending')` → `GET /api/v1/admin/approval/requests?status=pending`
      - `useApprovalRequests('approved')` → `GET /api/v1/admin/approval/requests?status=approved`
      - `useApprovalRequests('rejected')` → `GET /api/v1/admin/approval/requests?status=rejected`
      - `useApprovalRequests()` → `GET /api/v1/admin/approval/requests` (no filter)
   b) The backend controller (`approval.controller.ts` lines 74-102) handles all variants with `@Query('status')`. The service `findAllForApprover` (line 102-117 of `approval.service.ts`) returns `prisma.approvalRequest.findMany(...)` — this returns an empty array when no records match, NOT a 404.
   c) Check if the problem is the local auth guard. The local dev user has `uid: 'local-dev-user'`. The `findAllForApprover` filters by `approverId` — if the seeded admin user's ID doesn't match `local-dev-user`, ALL queries return empty arrays. Test with `curl`:
      ```bash
      curl -H "Authorization: Bearer $(echo -n '{"uid":"local-dev-user","email":"admin1@dlg.com"}' | base64)" \
           http://localhost:3000/api/v1/admin/approval/requests?status=approved
      ```
   d) If the curl test also returns 404, check:
      - Is the ApprovalModule imported in AppModule?
      - Does `app.setGlobalPrefix()` exist in `main.ts`? If so, the route might be double-prefixed (e.g., `/api/v1/api/v1/admin/approval/requests`).
      - Check NestJS logs for route registration.
   e) **Likely fix:** If there's a global prefix `api/v1` in `main.ts`, the controller routes should NOT include `api/v1/` in the `@Get()` decorator — they should use `@Get('admin/approval/requests')` instead. Check all routes in `approval.controller.ts` (lines 49, 74, 108, 127, 153) and remove the `api/v1/` prefix if a global prefix exists.
   f) **Frontend fix:** Change ApprovalRequests.tsx to only fetch the active tab's data (lazy loading), not all 4 tabs eagerly. This avoids 3 unnecessary API calls on page load:
      ```tsx
      const { data: currentRequests, isLoading } = useApprovalRequests(
        activeTab === 'all' ? undefined : activeTab
      );
      ```

3. **MEDIUM — Fix Edit Rule form: Rule Set dropdown not pre-selected.**
   When editing a rule at `/rules/:id/edit`, the Rule Set dropdown shows "Select a rule set" instead of the rule's actual rule set (e.g., "Global Meta Rules").

   **Root cause:** Race condition between `useForm`'s `values` prop and async data loading. When the page first renders, `existingRule` is undefined (still loading), so `useForm` initializes with `values: undefined` (line 248-274). When `existingRule` arrives, `values` updates to include `ruleSetId: existingRule.ruleSetId`, but react-hook-form may not re-sync controlled Select components.

   **Fix:** Add a `useEffect` that explicitly sets the `ruleSetId` when `existingRule` loads in edit mode:
   ```tsx
   React.useEffect(() => {
     if (isEditMode && existingRule?.ruleSetId) {
       form.setValue('ruleSetId', existingRule.ruleSetId);
     }
   }, [isEditMode, existingRule, form]);
   ```
   Place this after the existing `useEffect` at line 278. Also add a `form.reset(...)` call when `existingRule` arrives to ensure ALL fields are synced:
   ```tsx
   React.useEffect(() => {
     if (isEditMode && existingRule) {
       form.reset({
         name: existingRule.name,
         description: existingRule.description,
         ruleSetId: existingRule.ruleSetId,
         // ... all other fields from the existing values block (lines 250-273)
       });
     }
   }, [isEditMode, existingRule, form]);
   ```

4. After all 3 fixes, run the admin portal and backend test suites:
   ```bash
   cd packages/backend && pnpm test
   cd packages/admin-portal && pnpm build
   cd packages/e2e && npx playwright test tests/admin-portal/
   ```
   All tests must pass. Write 2 new E2E tests:
   - Create a rule through the full 5-step wizard → verify Save Rule makes a POST and the rule appears in the list.
   - Edit a rule → verify the Rule Set dropdown shows the correct pre-selected value.

**Teammate 2 — "Extension UX Fix" (Opus 4.6)**
Owns: /packages/extension/
Priority: Fix the 5 remaining bugs that affect the Chrome extension's user experience on real Meta Ads Manager.
Tasks:

1. **HIGH — Fix Guidelines Sidebar and Campaign Score rendering at page bottom instead of floating.**
   During Chrome testing, the Guidelines Sidebar and Campaign Score render at the very bottom of the page (below all Meta content) instead of as fixed overlays pinned to the viewport. They should float on screen while the user scrolls.

   **Root cause:** In `dom-utils.ts` line 69, `createShadowContainer()` sets `style: 'all: initial;'` on the host element. This resets ALL CSS properties to their initial values — including `position`, which resets to `static`. The Shadow DOM `:host { position: fixed; }` rule (sidebar.ts line 64) is supposed to override this, but inline styles have higher specificity than `:host` selectors in the CSS cascade. Combined with `document.body.appendChild(this.host)` (sidebar.ts line 436) which appends at the end of `<body>`, the components render in normal document flow at the bottom.

   **Fix:** Update `createShadowContainer()` in `/packages/extension/src/components/dom-utils.ts` to preserve position and z-index while still isolating from host page styles:
   ```ts
   const host = createElement('div', {
     id: `${GOV_PREFIX}-${hostId}`,
     'data-governance': 'true',
     style: 'all: initial; position: fixed; z-index: 2147483647; pointer-events: none;',
   });
   ```
   The `all: initial` still isolates from Meta's styles, but we immediately re-set `position: fixed` and `z-index` inline so they can't be overridden. Add `pointer-events: none` on the host and `pointer-events: auto` on the shadow content so only the visible component captures clicks, not the full-viewport host.

   Alternatively, you can use `all: revert` instead of `all: initial` — this reverts to the user-agent stylesheet defaults which include `position: static` but the `:host` rule can then override it since there's no inline style conflict. Test both approaches and pick whichever renders correctly on real Meta.

   **Important:** This fix affects ALL Shadow DOM components (sidebar, campaign score, creation blocker, validation banners). Test each one after the change. The creation blocker already uses a full-screen backdrop and may not need `position: fixed` on the host — verify it still renders correctly. Consider making `createShadowContainer()` accept an optional `positionStyle` parameter so callers can specify their own positioning.

2. **MEDIUM — Improve FacebookClearExtensionDetection() to suppress Meta's warning.**
   Meta shows a "Malfunctioning browser extension" dialog when the DLG extension is loaded. The existing `FacebookClearExtensionDetection()` in eval-bridge.ts (lines 358-380) clears React DevTools markers, but that's NOT enough — Meta also detects extensions via its internal `AdsBrowserExtensionErrorUtils` module.

   **Fix:** Expand `FacebookClearExtensionDetection()` to also override the Meta-internal detection module:
   ```ts
   // In the MAIN world script (eval-bridge.ts), add to FacebookClearExtensionDetection:
   try {
     // Override Meta's internal extension detection module
     const requireModule = (window as any).__d;  // Facebook's require system
     if (requireModule) {
       // Intercept the error utils module
       const origRequire = requireModule;
       (window as any).__d = function(name: string, ...args: any[]) {
         const result = origRequire.call(this, name, ...args);
         if (name === 'AdsBrowserExtensionErrorUtils' && result) {
           result.isBrowserExtensionError = () => false;
           result.maybeReportBrowserExtensionError = () => {};
         }
         return result;
       };
     }
     // Also try direct module override if already loaded
     try {
       const adsModule = (window as any).require?.('AdsBrowserExtensionErrorUtils');
       if (adsModule) {
         adsModule.isBrowserExtensionError = () => false;
         adsModule.maybeReportBrowserExtensionError = () => {};
       }
     } catch {}
   } catch {}
   ```
   Ensure this runs with `injectImmediately: true` BEFORE Meta's scripts load. The function is called at line 871 of eval-bridge.ts — verify it runs early enough. If not, move it to a separate early-injection script.

2. **LOW — Wire up "Click to go to field" navigation in Creation Blocker.**
   The Creation Blocker has a "Click to go to field" link for each violation (line 421 of creation-blocker.ts), and the click handler calls `this.onViolationClick(ruleId)` (line 405). BUT: this callback is NEVER wired up. Searching the meta adapter and injector code for `onViolationClick` and `onScrollToField` finds ZERO assignments outside the component definitions.

   **Fix:** In the Meta adapter's initialization (meta-adapter.ts), after creating the CreationBlocker and Sidebar, wire up the callbacks:
   ```ts
   // After creating this.creationBlocker
   this.creationBlocker.onViolationClick = (ruleId: string) => {
     this.scrollToRuleField(ruleId);
   };

   // After creating this.sidebar
   this.sidebar.onScrollToField = (ruleId: string) => {
     this.scrollToRuleField(ruleId);
   };
   ```
   Then implement `scrollToRuleField` in MetaAdapter:
   ```ts
   private scrollToRuleField(ruleId: string): void {
     const rule = this.rules.find((r) => r.id === ruleId);
     if (!rule) return;

     const fieldPath = rule.condition.field ?? '';
     const injectionPoint = this.getInjectionPoint(rule.ruleType, fieldPath);
     if (injectionPoint?.element) {
       injectionPoint.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
       // Flash highlight
       injectionPoint.element.style.outline = '3px solid #4F46E5';
       injectionPoint.element.style.outlineOffset = '4px';
       setTimeout(() => {
         injectionPoint.element.style.outline = '';
         injectionPoint.element.style.outlineOffset = '';
       }, 2000);
       return;
     }

     // Fallback: try to find the field's section by aria-label or data attribute
     const sectionSelectors: Record<string, string> = {
       'campaign.name': '[aria-label="Campaign name"]',
       'campaign.budget_value': '[data-surface*="budget"]',
       'campaign.budget_type': '[data-surface*="budget"]',
       'ad_set.targeting.geo_locations': '[data-surface*="geo"]',
       'campaign.objective': '[data-surface*="objective"]',
     };
     const selector = sectionSelectors[fieldPath];
     if (selector) {
       const el = document.querySelector(selector);
       if (el) {
         el.scrollIntoView({ behavior: 'smooth', block: 'center' });
       }
     }
   }
   ```
   Do the same for the Google adapter's creation blocker and sidebar.

3. **LOW — Fix inline per-field validation banners not appearing on real Meta.**
   The `updateUI` method in meta-adapter.ts (lines 699-716) calls `getInjectionPointForField()` for each rule evaluation result. If the injection point is null (selector doesn't find the DOM element on real Meta), the banner is silently skipped.

   **Root cause:** The `META_FIELD_SELECTORS` array in meta-selectors.ts uses CSS selectors that may not match the real Meta Ads Manager DOM (they were designed for mock fixtures).

   **Fix (two parts):**
   a) Add fallback injection logic to `getInjectionPointForField()` in meta-selectors.ts. When the primary selector fails, try broader selectors:
      ```ts
      // After line 914 (if config not found or selector fails)
      // Fallback: try to find a section container for the field path
      const fallbackMap: Record<string, string[]> = {
        'campaign.name': ['[data-surface*="name"]', '[aria-label*="Campaign name"]', 'input[placeholder*="name" i]'],
        'campaign.budget_value': ['[data-surface*="budget"]', '[aria-label*="Budget"]'],
        'campaign.budget_type': ['[data-surface*="budget"]', '[aria-label*="Budget"]'],
        'ad_set.targeting.geo_locations': ['[data-surface*="geo"]', '[aria-label*="Location"]'],
        'campaign.objective': ['[data-surface*="objective"]', '[aria-label*="Objective"]'],
      };
      const fallbacks = fallbackMap[fieldPath];
      if (fallbacks) {
        for (const selector of fallbacks) {
          const el = document.querySelector(selector);
          if (el) {
            return { element: el as HTMLElement, position: InjectionPosition.AFTER };
          }
        }
      }
      ```
   b) When ALL selector strategies fail for a banner, log a telemetry event so the selector health panel captures the miss:
      ```ts
      if (!injectionPoint) {
        console.debug(`[DLG] No injection point found for ${fieldPath} (${ruleType})`);
        // telemetry: increment miss counter for this fieldPath
      }
      ```

4. **LOW — Fix Publish button intercept timing vs Meta's native dialogs.**
   When the user clicks Publish, Meta's own "Additional business info" dialog (ABN for Australian Business Number) appears BEFORE the DLG Creation Blocker can intercept the click. The current intercept uses a capture-phase event listener on the Publish button (meta-adapter.ts line 485).

   **Fix:** Add a MutationObserver that watches for Meta's publish-related dialogs and intercepts them:
   ```ts
   // In interceptCreation(), after attaching the capture-phase listener:
   // Also intercept Meta's native dialogs that bypass the click listener
   const publishObserver = new MutationObserver((mutations) => {
     for (const mutation of mutations) {
       for (const node of mutation.addedNodes) {
         if (node instanceof HTMLElement) {
           // Detect Meta's publish confirmation dialogs
           const isPublishDialog = node.querySelector?.(
             '[data-surface*="publish"], [data-surface*="completion"], [aria-label*="Publish"]'
           );
           if (isPublishDialog && document.body.classList.contains('governance-creation-blocked')) {
             // Close Meta's dialog and show DLG blocker instead
             const closeBtn = node.querySelector('[aria-label="Close"]') as HTMLElement;
             if (closeBtn) closeBtn.click();
             this.creationBlocker?.show(this.lastEvaluationResults ?? []);
           }
         }
       }
     }
   });
   publishObserver.observe(document.body, { childList: true, subtree: true });
   ```

5. After all fixes, rebuild the extension:
   ```bash
   cd packages/extension && pnpm build
   ```
   Run extension unit tests:
   ```bash
   cd packages/extension && pnpm test
   ```
   All tests must pass.

**Teammate 3 — "Verification & Rebuild" (Opus 4.6)**
Owns: /packages/e2e/ and project-level test coordination
Priority: After Teammates 1 and 2 finish, run the full test suite, add regression tests, and rebuild all packages.
Tasks:

1. Wait for Teammates 1 and 2 to finish their fixes.

2. Run the FULL E2E test suite:
   ```bash
   cd packages/e2e && npx playwright test
   ```
   All existing tests must still pass. If any regress, coordinate fixes with the responsible teammate.

3. Run all unit test suites:
   ```bash
   cd packages/backend && pnpm test
   cd packages/extension && pnpm test
   ```

4. Write 5 new E2E tests for the fixed bugs:
   - **Save Rule E2E:** Navigate to /rules/new → fill all 5 wizard steps → click Save Rule → verify toast success → verify rule appears in /rules table.
   - **Edit Rule Set Pre-selection E2E:** Create a rule → navigate to /rules/:id/edit → verify Rule Set dropdown shows the correct rule set name (not "Select a rule set").
   - **Approvals Tabs E2E:** Navigate to /approvals → click Approved tab → verify no error message → click Rejected tab → verify no error → click All tab → verify no error. (Tabs may show "No requests" but must not show 404 error.)
   - **Validation Error Feedback E2E:** Navigate to /rules/new → skip to step 5 without filling fields → click Save Rule → verify a toast error appears with a validation message.
   - **Extension Sidebar Toggle E2E (against mock fixture):** Open mock Meta fixture with extension → verify sidebar is visible → click toggle in popup → verify sidebar hides → click toggle again → verify it reappears.

5. Rebuild ALL packages for production:
   ```bash
   pnpm build
   ```
   Verify zero build errors across all packages.

6. Update TEST-RESULTS.md with a "Round 3 — Post Bug Fix" section:
   - For each of the 8 bugs, document: original issue, fix applied, verification result (PASS/FAIL).
   - Update the overall pass rate (target: >95%).
   - Update the "Recommended Backlog" section to remove fixed items.

**Teammate 4 — "Spec Keeper" (Opus 4.6)**
Owns: /SPEC.md, /TEST-RESULTS.md, /CLAUDE-CODE-PROMPT.md
Priority: Keep project documentation in sync with actual implementation state. Runs CONTINUOUSLY alongside Teammates 1-3.
Tasks:

1. **Before fixes begin:** Read the current SPEC.md and snapshot the "Implementation Progress" section. Note what it claims vs what TEST-RESULTS.md actually found. Document any discrepancies.

2. **After each teammate completes a fix:** Immediately update SPEC.md to reflect the actual state:
   - Section 12 (Known Issues / Bugs): Remove fixed bugs, add any newly discovered ones.
   - Update route tables if the Approvals API path changed.
   - Update the Rule Builder section if step validation behavior changed.
   - Update the Extension section if new MutationObservers, fallback selectors, or scroll-to-field behavior was added.

3. **Track implementation drift — the specific risks for this step:**
   - If Teammate 1 discovers the Approvals 404 is caused by a global prefix double-path, update SPEC.md Appendix with the correct API route table. Other teams referencing API paths need the truth.
   - If Teammate 2 changes how `FacebookClearExtensionDetection` works (e.g., intercepting `__d`), update the Grasp integration notes in the spec — future developers need to know we're patching Meta's module system.
   - If the Rule Builder now enforces per-step validation, the spec's "Rule Builder UX" section must reflect this: users can no longer skip steps with empty fields.
   - If fallback selectors are added for injection points, document the selector fallback chain order in the spec so future selector updates follow the same pattern.

4. **Maintain the "Lessons Learned" section** in CLAUDE-CODE-PROMPT.md. After Step 4 completes, append any NEW lessons discovered during this round (there will be some — every step produces new ones).

5. **Final spec audit:** After Teammate 3 finishes verification, do a full read of SPEC.md top to bottom. Check:
   - Does every feature mentioned in the spec actually work (cross-reference TEST-RESULTS.md)?
   - Are there features that work but aren't documented?
   - Are version numbers, test counts, and file paths accurate?
   - Is the "Next Steps" or "Deployment" section still correct?

6. **Produce a CHANGELOG.md** entry for Step 4:
   ```markdown
   ## Step 4 — Bug Fixes & UX Polish (YYYY-MM-DD)
   ### Fixed
   - Save Rule button now triggers API call with validation error feedback
   - Approvals page tabs (Approved/Rejected/All) load without errors
   - Edit Rule form pre-selects the correct Rule Set
   - Meta extension detection warning suppressed
   - "Click to go to field" navigation working in Creation Blocker and Sidebar
   - Inline validation banners with fallback selectors for real Meta DOM
   - Publish button intercept handles Meta's native dialogs
   ### Added
   - Per-step validation in Rule Builder wizard (prevents advancing with empty required fields)
   - 5 new E2E regression tests
   ### Changed
   - Approvals page uses lazy tab loading (fetches only active tab data)
   ```

**Your role as Architect:**
1. Teammates 1 and 2 work in PARALLEL (no dependencies between admin portal/backend fixes and extension fixes).
2. Teammate 4 (Spec Keeper) runs CONTINUOUSLY alongside all other teammates — updating docs as fixes land.
3. Teammate 3 starts AFTER Teammates 1 and 2 finish — it's the verification gate.
4. After Teammate 3 finishes, Teammate 4 does the final spec audit.
5. After Teammate 4 finishes, review the updated SPEC.md and TEST-RESULTS.md. The target is >95% pass rate with 0 HIGH bugs remaining.
6. If any new bugs are found during verification, coordinate fixes immediately — do not leave this step with regressions.
7. Final deliverables:
   - All 8 bugs fixed
   - Updated SPEC.md reflecting actual implementation state (no drift)
   - Updated TEST-RESULTS.md with Round 3 results
   - New CHANGELOG.md entry for Step 4
   - All E2E tests passing (existing + 5 new)
   - All packages rebuilt (backend, admin-portal, extension)

**Lessons learned (avoid these pitfalls):**
- Local dev auth: isLocalDev flag + mock user + btoa JSON Bearer token. Do NOT break this.
- 401 response interceptor: console.warn in local dev, NOT window.location.href redirect.
- Backend returns shared types via transformation layer. All endpoints use transformers.
- Extension uses Shadow DOM isolation for injected components.
- react-hook-form: `handleSubmit(onSuccess)` silently drops validation errors. ALWAYS add the second `onError` callback.
- react-hook-form: when using `values` prop with async data, also call `form.reset()` in a useEffect when the data arrives — the `values` prop alone may not re-sync controlled components.
- NestJS global prefix: check if `app.setGlobalPrefix('api/v1')` exists in main.ts. If it does, ALL controller route decorators should NOT include `api/v1/`.
- Extension MAIN world scripts: `injectImmediately: true` runs before DOM is ready. Verify that FacebookClearExtensionDetection runs before Meta's own scripts initialize.
- MutationObserver: always disconnect observers in cleanup() to prevent memory leaks.
- Meta's internal module system uses `__d` and `require`. These are available in MAIN world only.
- The eval-bridge.ts helper functions MUST be injected into MAIN world (not ISOLATED world).
- Use DLG-namespaced events (evalQuery.governance / evalResult.governance), NOT Grasp's namespace.
- Backend CRUD endpoints expect organizationId from @CurrentUser() decorator, NOT from the request body.
- pnpm: onlyBuiltDependencies allowlist prevents interactive prompts.
- Shadow DOM `all: initial` on host element kills `position: fixed` from `:host` styles (inline styles beat shadow DOM selectors in CSS cascade). Always re-set positioning properties inline AFTER `all: initial`.
- When fixing shared utilities like `createShadowContainer()`, test ALL components that use it — a fix for the sidebar could break the creation blocker.

Use delegate mode.
```
