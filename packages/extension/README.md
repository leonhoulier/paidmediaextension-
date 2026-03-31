# @media-buying-governance/extension

Chrome Manifest V3 extension for the Media Buying Governance Platform. Injects real-time validation rules, naming convention enforcement, and compliance checks directly into ad platform UIs (Meta Ads Manager and Google Ads).

## Architecture Overview

```
extension/
├── manifest.json              # Chrome MV3 manifest (empty content_scripts)
├── esbuild.config.mjs         # Build pipeline (esbuild)
├── src/
│   ├── service-worker.ts      # Background service worker
│   │                          # - URL pattern detection
│   │                          # - Dynamic content script injection
│   │                          # - Rule cache polling via alarms
│   │                          # - Message routing
│   ├── content-scripts/
│   │   ├── injector.ts        # Main content script (ISOLATED world)
│   │   ├── eval-bridge.ts     # MAIN world script for React/Angular access
│   │   └── remote-eval-batcher.ts  # Batched cross-world communication
│   ├── adapters/
│   │   ├── platform-adapter.ts     # Factory + type guards
│   │   ├── meta/              # Meta Ads Manager adapter (Teammate 4)
│   │   └── google/            # Google Ads adapter (Teammate 5)
│   ├── rules/
│   │   └── evaluator.ts       # Local rule evaluation engine
│   ├── storage/
│   │   ├── rule-cache.ts      # IndexedDB cache (5-min TTL)
│   │   └── sync.ts            # API sync module
│   ├── components/            # Vanilla TS UI components (Shadow DOM)
│   │   ├── dom-utils.ts       # DOM helper functions
│   │   ├── theme.ts           # CSS variable theming
│   │   ├── validation-banner.ts
│   │   ├── guidelines-sidebar.ts
│   │   ├── campaign-score.ts
│   │   ├── creation-blocker.ts
│   │   ├── comment-modal.ts
│   │   └── naming-preview.ts
│   ├── popup/
│   │   ├── popup.html
│   │   └── popup.ts
│   ├── styles/
│   │   └── platform-theme.css
│   └── utils/
│       ├── logger.ts          # [Governance] prefixed logging
│       └── debounce.ts        # Debounce/throttle utilities
└── dist/                      # Build output (loadable in Chrome)
```

## Key Architecture Decisions

1. **Empty `content_scripts` array** in manifest.json. Content scripts are injected dynamically from the service worker using `chrome.scripting.executeScript()`. This enables centralized platform detection and conditional loading.

2. **remoteEval bridge pattern.** A separate script (`eval-bridge.ts`) is injected into the MAIN world to access React Fiber trees and Angular component state. Communication happens via `window.postMessage` with namespaced message types (`evalQuery.governance` / `evalResult.governance`).

3. **Shadow DOM isolation.** All injected UI components render inside Shadow DOM to prevent style conflicts with the host page.

4. **Local rule evaluation.** Rules are evaluated entirely client-side for speed (<100ms target). The backend is only contacted for rule fetching and compliance event reporting.

5. **Body-level CSS state classes.** Validation state is propagated via `body.gov-valid-{field}` and `body.gov-invalid-{field}` CSS classes.

## How to Build

```bash
# Install dependencies (from monorepo root)
pnpm install

# Build the shared types first
cd packages/shared && pnpm build

# Development build (with watch mode)
cd packages/extension
pnpm dev

# Production build
pnpm build

# Production build + Chrome Web Store .zip
pnpm zip
```

## How to Load as Unpacked Extension

1. Run `pnpm build` to generate the `dist/` directory.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top right).
4. Click **Load unpacked**.
5. Select the `packages/extension/dist/` directory.
6. The extension icon should appear in the Chrome toolbar.

## Type Checking

```bash
pnpm typecheck
```

## Build Output

The `dist/` directory contains:

| File | Description |
|:--|:--|
| `manifest.json` | Chrome extension manifest |
| `service-worker.js` | Background service worker (ESM) |
| `content-scripts/injector.js` | Main content script (IIFE, ISOLATED world) |
| `content-scripts/eval-bridge.js` | Eval bridge (IIFE, MAIN world) |
| `popup/popup.html` | Extension popup UI |
| `popup/popup.js` | Popup script |
| `styles/platform-theme.css` | Injected CSS variables and base styles |
| `icons/` | Extension icons |

## Permissions

| Permission | Reason |
|:--|:--|
| `storage` | Caching rules in IndexedDB and chrome.storage |
| `activeTab` | Accessing the current tab's URL |
| `alarms` | Periodic rule version polling (60s interval) |
| `scripting` | Dynamic content script injection |

Host permissions for ad platforms are declared as `optional_host_permissions` and requested at runtime.
