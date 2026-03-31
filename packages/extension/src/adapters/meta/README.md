# Meta Ads Manager Platform Adapter

DOM adapter for injecting governance rules into Meta Ads Manager (adsmanager.facebook.com / business.facebook.com).

## Architecture

```
meta/
  index.ts                      # Barrel export
  meta-adapter.ts               # MetaAdapter class (PlatformAdapter implementation)
  meta-fields.ts                # Field value extraction (DOM + React Fiber + remoteEval)
  meta-selectors.ts             # Selector registry with multi-strategy fallback
  meta-theme.css                # CSS matching Meta's design language
  __tests__/
    meta-adapter.test.ts        # MetaAdapter integration tests
    meta-fields.test.ts         # Field extraction unit tests
    meta-selectors.test.ts      # Selector strategy unit tests
```

## Field Mapping

All fields from Appendix B of the specification are supported:

| Field Path | Entity Level | Primary Selector | Extraction Method |
|:--|:--|:--|:--|
| `campaign.name` | Campaign | `input[aria-label*="Campaign name"]` | Input `.value` |
| `campaign.objective` | Campaign | `[role="radiogroup"]` | Selected card text |
| `campaign.budget_type` | Campaign | `[aria-label*="Budget type"]` | Selected option text |
| `campaign.budget_value` | Campaign | `input[aria-label*="Budget"]` | Input `.value` (parsed numeric) |
| `campaign.cbo_enabled` | Campaign | `[aria-label*="Advantage+ campaign budget"]` | `aria-checked` attribute |
| `ad_set.name` | Ad Set | `input[aria-label*="Ad set name"]` | Input `.value` |
| `ad_set.targeting.geo_locations` | Ad Set | `[aria-label*="Location"]` | Selected location tags (array) |
| `ad_set.targeting.age_range` | Ad Set | `[aria-label*="Age"]` | Min/max input values |
| `ad_set.targeting.genders` | Ad Set | `[aria-label*="Gender"]` | Checked options (array) |
| `ad_set.targeting.languages` | Ad Set | `[aria-label*="Language"]` | Language chips (array) |
| `ad_set.placements` | Ad Set | `[aria-label*="Placement"]` | Checked placements (array) |
| `ad_set.schedule.start_date` | Ad Set | `[aria-label*="Start date"]` | Input `.value` |
| `ad_set.schedule.end_date` | Ad Set | `[aria-label*="End date"]` | Input `.value` |
| `ad.name` | Ad | `input[aria-label*="Ad name"]` | Input `.value` |
| `ad.creative.destination_url` | Ad | `input[aria-label*="Website URL"]` | Input `.value` |
| `ad.creative.cta_type` | Ad | `[aria-label*="Call to action"]` | Dropdown selected text |
| `ad.creative.page_id` | Ad | `[aria-label*="Facebook Page"]` | `data-page-id` attr or selected text |

## Selector Strategy

Every field has multiple selector strategies tried in priority order:

1. **aria-label selector** (most stable) -- Meta uses aria-labels consistently and they survive React re-renders.
2. **data-testid selector** -- Internal test IDs, less stable but more specific.
3. **Text-content matching** -- Find elements containing specific text (case-insensitive, supports OR with `|`).
4. **Heuristic proximity** -- Find a label, walk up the DOM tree (max 5 levels), and find the nearest target element.

If all strategies fail for a field, the adapter returns `null` and the governance rule shows as "unable to verify" rather than crashing.

## React Fiber Traversal

Meta Ads Manager is a React SPA. For fields where DOM reading is insufficient, the adapter traverses React's internal Fiber tree:

```
DOM Element
  -> __reactFiber$xxx key
    -> fiber.memoizedProps (component props)
    -> fiber.return (walk up to parent components)
```

This is executed via the **remoteEval bridge** since content scripts run in an isolated world and cannot directly access page JavaScript:

```
Content Script (ISOLATED)  ---> postMessage('evalQuery.governance')  ---> eval.js (MAIN world)
Content Script (ISOLATED)  <--- postMessage('evalResult.governance') <--- eval.js (MAIN world)
```

The `RemoteEvalBatcher` batches multiple field queries into a single postMessage round-trip.

## Injection Points

| Rule Type | Target Element | Position | DOM Method |
|:--|:--|:--|:--|
| Campaign Name | Input container | After | `insertAdjacentElement('afterend')` |
| Budget Type | Budget dropdown section | After | `insertAdjacentElement('afterend')` |
| Budget Value | Budget input container | After | `insertAdjacentElement('afterend')` |
| Targeting (Geo) | Locations section | Inside | `appendChild` |
| Targeting (Gender) | Gender selection | After | `insertAdjacentElement('afterend')` |
| Placement | Placement section | After | `insertAdjacentElement('afterend')` |
| CBO Toggle | Advantage+ toggle row | After | `insertAdjacentElement('afterend')` |
| Publish Button | Primary action button | Overlay | Absolute position overlay |

## MutationObserver Strategy

Meta Ads Manager frequently re-renders due to React reconciliation. The adapter handles this with:

1. **MutationObserver** on `document.body` with `{ childList: true, subtree: true }`
2. **Debouncing** at 300ms to avoid excessive re-evaluation
3. **Diff-based detection** -- only fires callback for fields whose values actually changed
4. **Re-injection tracking** -- detects when React removes injected governance elements and dispatches a `governance:injection-removed` custom event

## Creation Interception

The adapter intercepts "Publish" / "Next" button clicks using **capture-phase** event listeners. This fires before React's synthetic event system, allowing the governance engine to block the action if blocking rules fail.

When blocked:
- `event.preventDefault()` + `event.stopPropagation()` + `event.stopImmediatePropagation()`
- Body class `governance-creation-blocked` is applied for CSS-driven blocker overlay
- The creation blocker modal is shown

## Known Issues and Workarounds

### Dynamic Class Names
Meta uses CSS modules with hash-based class names (e.g., `_8-yf _8-o6`). These change across deployments and cannot be used as reliable selectors. The adapter avoids class-based selectors entirely, preferring aria-labels and data-testids.

### React Reconciliation Removing Injections
When React re-renders a section, it may remove governance-injected DOM elements. The MutationObserver detects this and dispatches `governance:injection-removed` events so the injection orchestrator can re-inject.

### Lazy-Loaded Sections
Ad set and ad level sections may not be present in the DOM initially (they load when the user navigates to that step in the creation flow). The adapter returns `null` for fields not yet in the DOM. The `observeFieldChanges()` method will detect when these sections appear.

### SPA Navigation
Meta Ads Manager is a single-page app. URL changes don't trigger full page reloads. The service worker should detect URL changes via `chrome.webNavigation` events and re-invoke `detectContext()`.

### Currency Formatting in Budget Fields
Budget values may include currency symbols, commas, and locale-specific decimal separators. The `getCampaignBudgetValue()` getter strips non-numeric characters. For locale-aware parsing (e.g., European `2.500,00`), additional work is needed.

### is-loaded Guard
The adapter sets a `governance-loaded` attribute on `document.body` to prevent duplicate injection during SPA navigation. Call `isLoaded()` before initializing and `markLoaded()` after setup.

## CSS Theme

`meta-theme.css` provides governance component styles matching Meta's design language:

- **Font**: -apple-system, BlinkMacSystemFont, "Segoe UI" (Meta's system font stack)
- **Border radius**: 8px (matches Meta's card style)
- **Error colors**: Light red background (#FEE2E2) with red text (#991B1B)
- **z-index**: 2147483000 (maximum safe value, above all platform UI)
- **Animations**: Subtle slide-in and fade effects

Components styled: banners (error/warning/success/info), sidebar panel, compliance score badge, rule list items, creation blocker overlay, comment modal, naming convention preview, field highlights, tooltips, and buttons.

## Usage

```typescript
import { MetaAdapter } from './adapters/meta';

const adapter = new MetaAdapter();

// Check if already loaded
if (adapter.isLoaded()) {
  return;
}

// Detect context
const context = adapter.detectContext();
if (!context) {
  return; // Not on a Meta Ads Manager page
}

// Mark as loaded
adapter.markLoaded();

// Extract field values
const values = await adapter.extractFieldValues();
console.log(values['campaign.name']); // "US_Social_Awareness_Q1_2026"

// Set up field change observation
adapter.observeFieldChanges((fieldPath, value) => {
  console.log(`Field changed: ${fieldPath} = ${value}`);
});

// Intercept creation
adapter.interceptCreation((allow) => {
  const allRulesPass = evaluateRules(values);
  allow(allRulesPass);
});

// Get injection point for a rule
const point = adapter.getInjectionPoint('naming_convention', 'campaign.name');
if (point) {
  const banner = createBanner('Campaign name must follow convention');
  point.element.insertAdjacentElement('afterend', banner);
  adapter.trackInjectedElement(banner);
}

// Cleanup on navigation
adapter.cleanup();
```
