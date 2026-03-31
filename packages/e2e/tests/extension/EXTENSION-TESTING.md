# Extension E2E Testing Guide

## Overview

Automated Chrome extension testing using Playwright with `launchPersistentContext()` to load the unpacked extension against mock platform fixtures.

## Architecture

```
packages/e2e/
├── playwright.config.ts        # 3 projects: api, admin-portal, extension
├── global-setup.ts             # Patches extension for localhost, fetches runtime data
├── global-teardown.ts          # Cleanup
├── tests/extension/
│   ├── extension-fixture.ts    # Custom Playwright fixture (loads extension)
│   ├── meta.spec.ts            # Full validation loop (14 tests)
│   ├── guidelines-sidebar.spec.ts
│   ├── creation-blocker.spec.ts
│   ├── content-injection.spec.ts
│   ├── validation-banners.spec.ts
│   ├── step4-regressions.spec.ts   # ← NEW: Step 4 bug regression tests
│   └── EXTENSION-TESTING.md       # ← This file
│
packages/extension/test/fixtures/
├── meta-campaign-creation.html     # Base Meta campaign creation fixture
├── meta-campaign-regression.html   # ← NEW: Enhanced fixture for regression testing
├── meta-adset-creation.html        # Meta ad set creation fixture
└── google-campaign-wizard.html     # Google Ads fixture
```

## How It Works

1. **`global-setup.ts`** copies `packages/extension/dist/` to `.test-extension/`, patches the manifest for localhost, and patches the service worker to recognize `localhost:8080/meta*` as Meta platform pages.

2. **`extension-fixture.ts`** launches Chromium with `--load-extension` pointing to `.test-extension/`, detects the service worker, and provides the test context.

3. **Fixtures** are served via `npx serve` on port 8080. They replicate real platform DOM structures (aria-labels, data-testids, React Fiber keys, obfuscated class names).

4. **The extension** detects the fixture page as a platform page (via the patched service worker), injects content scripts, and renders governance components (sidebar, banners, creation blocker, campaign score).

## Running Tests

```bash
# Prerequisites: build the extension first
cd packages/extension && pnpm build && cd ../..

# Run all extension E2E tests
cd packages/e2e && npx playwright test --project=extension

# Run just the Step 4 regression tests
npx playwright test --project=extension step4-regressions

# Run with visible browser (useful for debugging)
npx playwright test --project=extension --headed

# Run a single test file
npx playwright test --project=extension guidelines-sidebar

# Generate HTML report
npx playwright test --project=extension --reporter=html
```

## Step 4 Regression Tests

The `step4-regressions.spec.ts` file covers the 5 extension-side bugs fixed in Step 4:

### HIGH #3 — Sidebar/Score Fixed Overlay Positioning
- Verifies `position: fixed` computed style on sidebar host
- Verifies z-index >= 2147483000
- Verifies sidebar stays in place when page scrolls
- Verifies all overlay components use `all: initial` + `position: fixed`

### MEDIUM #2 — Extension Detection Evasion
- Verifies eval bridge injection in MAIN world
- Verifies `__d` wrapper intercepts `AdsBrowserExtensionErrorUtils`
- Verifies `isBrowserExtensionError` returns `false` (stubbed)

### LOW #1 — Click to Go to Field
- Verifies sidebar guidelines are clickable
- Verifies clicking a guideline scrolls to the related field

### LOW #2 — Inline Validation Banners
- Verifies banners inject near target fields (not at page bottom)
- Verifies banners use static/relative positioning (inline flow)
- Verifies `data-surface` fallback selectors are present

### LOW #3 — Publish Intercept Timing
- Verifies publish button has capture-phase click listener
- Verifies creation blocker modal structure and dismissibility

## Writing New Tests

### Adding a new fixture

1. Create an HTML file in `packages/extension/test/fixtures/`
2. Name it with the platform prefix (`meta-*`, `google-*`) so the service worker recognizes it
3. Include realistic DOM elements with the selectors from `meta-selectors.ts`
4. Add React Fiber simulation (`__reactFiber$` keys) for field value extraction
5. The fixture is automatically served at `http://localhost:8080/<filename>`

### Key selectors the extension targets

| Field | Primary Selector | Fallback |
|-------|-----------------|----------|
| Campaign name | `input[aria-label*="Campaign name"]` | `[data-surface*="name"]` |
| Objective | `[data-testid*="objective"]` | `[data-surface*="objective"]` |
| Budget type | `[aria-label*="Budget type"]` | `[data-surface*="budget"]` |
| Budget value | `input[aria-label*="Budget"]` | `input[inputmode="decimal"]` |
| CBO toggle | `[role="switch"][aria-label*="Advantage"]` | `[data-testid*="cbo"]` |
| Publish button | `[data-testid="publish-button"]` | `button[type="submit"]` |

### Testing Shadow DOM components

Governance components use Shadow DOM. Access inner elements via `evaluate`:

```typescript
const result = await page.locator('[data-gov-component="sidebar"]').evaluate((host) => {
  const shadow = host.shadowRoot;
  if (!shadow) return null;
  return {
    hasHeader: !!shadow.querySelector('.sidebar__header'),
    guidelines: shadow.querySelectorAll('.guideline').length,
  };
});
```

### Testing computed styles

Critical for catching the `all: initial` positioning bug:

```typescript
const position = await page.locator('[data-gov-component="sidebar"]').evaluate(
  (el) => window.getComputedStyle(el).position,
);
expect(position).toBe('fixed');
```

## Timing Considerations

- Extension injection takes 3-5 seconds after page load
- MutationObserver debounce is 300ms
- Compliance event batching is 5000ms
- Use `page.waitForTimeout(INJECTION_WAIT)` after navigation
- For field change detection, wait 1000ms after `fill()`

## CI Integration

Add to your CI pipeline:

```yaml
extension-e2e:
  steps:
    - run: pnpm install
    - run: pnpm --filter extension build
    - run: cd packages/e2e && npx playwright install chromium
    - run: cd packages/e2e && npx playwright test --project=extension
```

Note: Extension tests require `headless: false` (headed mode) because Chrome extensions cannot run in headless Chromium. Use `xvfb-run` on Linux CI:

```yaml
    - run: xvfb-run npx playwright test --project=extension
```
