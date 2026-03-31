# Selector Validation Report -- Phase 2.5

**Date:** 2026-02-07
**Tester:** Selector QA Agent
**Status:** Ready for Manual Validation
**Extension Version:** Phase 2 (pre-deployment)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Meta Ads Manager -- Campaign Level](#meta-ads-manager----campaign-level)
3. [Meta Ads Manager -- Ad Set Level](#meta-ads-manager----ad-set-level)
4. [Meta Ads Manager -- Ad Level](#meta-ads-manager----ad-level)
5. [Meta Ads Manager -- Publish Button](#meta-ads-manager----publish-button)
6. [Google Ads -- Campaign Level](#google-ads----campaign-level)
7. [Google Ads -- Ad Group Level](#google-ads----ad-group-level)
8. [Google Ads -- Ad Level](#google-ads----ad-level)
9. [Google Ads -- Publish Button](#google-ads----publish-button)
10. [Selector Telemetry Coverage](#selector-telemetry-coverage)
11. [Mock Fixture vs. Real DOM Analysis](#mock-fixture-vs-real-dom-analysis)
12. [Edge Cases to Test](#edge-cases-to-test)
13. [Known Risk Assessment](#known-risk-assessment)
14. [Manual Testing Instructions](#manual-testing-instructions)
15. [Summary](#summary)

---

## Executive Summary

This document inventories every DOM selector used by the Media Buying Governance Chrome extension to extract field values from Meta Ads Manager and Google Ads. Each selector is documented with its strategy, fallback chain, expected DOM element type, and risk assessment for real-platform compatibility.

**Total selectors catalogued:**

| Platform    | Fields | Selector Strategies (total) |
|:------------|:------:|:---------------------------:|
| Meta Ads    |   18   |           56                |
| Google Ads  |   15   |           68                |
| **Total**   | **33** |         **124**             |

**Code files reviewed:**

- `src/adapters/meta/meta-selectors.ts` -- Meta selector registry (16 field configs + publish button)
- `src/adapters/meta/meta-fields.ts` -- Meta field extraction logic (18 getter functions)
- `src/adapters/google/google-selectors.ts` -- Google selector registry (15 field configs + publish button)
- `src/adapters/google/google-fields.ts` -- Google field extraction logic (15 getter functions)
- `src/utils/selector-telemetry.ts` -- Ring buffer telemetry for selector health
- `test/fixtures/meta-campaign-creation.html` -- Mock Meta campaign DOM
- `test/fixtures/meta-adset-creation.html` -- Mock Meta ad set DOM
- `test/fixtures/google-campaign-wizard.html` -- Mock Google Ads wizard DOM

---

## Meta Ads Manager -- Campaign Level

### campaign.name

| Attribute | Value |
|:----------|:------|
| **Field Path** | `campaign.name` |
| **Expected Element** | `<input type="text">` |
| **Injection Position** | AFTER |
| **Extraction Method** | `input.value` with React Fiber `memoizedProps.value` fallback |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `input[aria-label*="Campaign name"]` | aria-label | -- | Primary strategy. Relies on Meta using "Campaign name" in aria-label. |
| 2 | data-testid match | `[data-testid*="campaign-name"] input, [data-testid*="campaign_name"] input` | data-testid | -- | Fallback. Requires data-testid containing "campaign-name" or "campaign_name". |
| 3 | Heuristic proximity | Label text "Campaign name" near `<input>` | heuristic | -- | Last resort. Walks up to 5 ancestor levels from label to find input. |

**remoteEval selector:** `input[aria-label*="Campaign name"]` (method: `elementValue`)

**Mock fixture match:** The mock uses `<input aria-label="Campaign name" ...>` inside `<div data-testid="campaign-name-input">`. Both strategy 1 and 2 match.

**Risk Assessment:** LOW. Campaign name is a fundamental field; aria-label is likely stable.

---

### campaign.objective

| Attribute | Value |
|:----------|:------|
| **Field Path** | `campaign.objective` |
| **Expected Element** | Radiogroup / card container |
| **Injection Position** | AFTER |
| **Extraction Method** | `aria-selected="true"` / `aria-checked="true"` text, then React Fiber for `ObjectiveSelector` component |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | data-testid match | `[data-testid*="objective"]` | data-testid | -- | Primary. Requires "objective" in data-testid. |
| 2 | Role-based | `[role="radiogroup"]` | role | -- | Very generic -- may match other radiogroups on the page. |
| 3 | Text content | `<span>` containing "Objective" | text-content | -- | Will match section headers but NOT the selection itself. |

**remoteEval selector:** `[data-testid*="objective"], [role="radiogroup"]` (method: `FindReact`)

**Value extraction chain in getCampaignObjective():**
1. `container.querySelector('[aria-selected="true"]')` -> textContent
2. `container.querySelector('[aria-checked="true"]')` -> textContent
3. `container.querySelector('.selected, .active, [data-selected="true"]')` -> textContent
4. React Fiber: `findReactComponentProps(container, /Objective|ObjectiveSelector/i)` -> `.value`
5. Direct Fiber props -> `.value`

**Mock fixture match:** Mock uses `<div data-testid="campaign-objective-selector" role="radiogroup">` with `aria-checked="true"` on selected card. All strategies align.

**Risk Assessment:** MEDIUM. Meta frequently A/B tests the objective selection UI. The `role="radiogroup"` fallback is too generic and could match other elements. The React Fiber component name pattern (`/Objective|ObjectiveSelector/i`) is speculative.

---

### campaign.budget_type

| Attribute | Value |
|:----------|:------|
| **Field Path** | `campaign.budget_type` |
| **Expected Element** | Dropdown / combobox |
| **Injection Position** | AFTER |
| **Extraction Method** | `HTMLSelectElement.value`, `aria-selected="true"` option text, or text content matching "daily"/"lifetime" |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `[aria-label*="Budget type"], [aria-label*="budget type"]` | aria-label | -- | Primary. |
| 2 | data-testid match | `[data-testid*="budget-type"], [data-testid*="budget_type"]` | data-testid | -- | |
| 3 | Text content | `<span>` containing "Daily budget\|Lifetime budget" | text-content | -- | Matches display text. |
| 4 | Heuristic proximity | Label "Budget" near `<select>` | heuristic | -- | Only finds `<select>` elements; Meta likely uses custom dropdown, not `<select>`. |

**remoteEval selector:** `[aria-label*="Budget type"]` (method: `elementText`)

**Mock fixture match:** Mock uses `<div aria-label="Budget type" data-testid="budget-type-selector">`. Strategies 1 and 2 match.

**Risk Assessment:** MEDIUM. Meta's budget type is a custom dropdown (not native `<select>`). The heuristic strategy (4) targets `<select>` and will likely fail on real UI. Strategies 1-3 should work if aria-label text is stable.

---

### campaign.budget_value

| Attribute | Value |
|:----------|:------|
| **Field Path** | `campaign.budget_value` |
| **Expected Element** | `<input type="text">` (number-like) |
| **Injection Position** | AFTER |
| **Container Selector** | `.budget-section, [class*="budget"]` |
| **Extraction Method** | `input.value` stripped of currency symbols/commas, parsed to float |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `input[aria-label*="Budget"][type="text"], input[aria-label*="budget"][type="text"]` | aria-label | -- | Primary. Note: constrained to `type="text"`. |
| 2 | data-testid match | `[data-testid*="budget-value"] input, [data-testid*="budget_value"] input` | data-testid | -- | |
| 3 | Heuristic proximity | Label "Budget" near `<input>` | heuristic | -- | May match budget type section input instead. |

**remoteEval selector:** `input[aria-label*="Budget"]` (method: `elementValue`)

**Mock fixture match:** Mock uses `<input type="text" aria-label="Budget" value="$5,000.00">`. Strategy 1 matches.

**Risk Assessment:** MEDIUM-HIGH. The `type="text"` constraint could fail if Meta uses `type="number"` or `inputmode="decimal"` without `type="text"`. The remoteEval selector `input[aria-label*="Budget"]` is broader and does NOT have the type constraint -- inconsistency.

---

### campaign.cbo_enabled

| Attribute | Value |
|:----------|:------|
| **Field Path** | `campaign.cbo_enabled` |
| **Expected Element** | Toggle switch (`[role="switch"]`) or checkbox |
| **Injection Position** | AFTER |
| **Extraction Method** | `aria-checked`, `HTMLInputElement.checked`, React Fiber for `CBOToggle`/`Advantage`/`BudgetOptimization` |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `[aria-label*="Advantage"][aria-label*="campaign budget"], [aria-label*="Campaign budget optimization"]` | aria-label | -- | Primary. Compound match for "Advantage" AND "campaign budget". |
| 2 | Role + aria-label | `[role="switch"][aria-label*="budget"], [role="switch"][aria-label*="Budget"]` | role | -- | More generic -- any budget-related switch. |
| 3 | data-testid match | `[data-testid*="cbo"], [data-testid*="campaign-budget-optimization"]` | data-testid | -- | |
| 4 | Heuristic proximity | Label "Advantage+ campaign budget" near `<input>` | heuristic | -- | Targets `<input>` but the toggle is likely a `<div role="switch">`, not `<input>`. |

**remoteEval selector:** `[aria-label*="Advantage+ campaign budget"], [role="switch"]` (method: `FindReact`)

**Value extraction chain in getCampaignCBOEnabled():**
1. `el.getAttribute('aria-checked')` === 'true'
2. `el instanceof HTMLInputElement && el.type === 'checkbox'` -> `.checked`
3. Child `[role="switch"]` or `input[type="checkbox"]` -> `aria-checked` / `.checked`
4. React Fiber: `findReactComponentProps(el, /CBO|Advantage|BudgetOptimization/i)` -> `.checked` / `.value` / `.isEnabled`
5. Direct Fiber props -> `.checked` / `.value`

**Mock fixture match:** Mock uses `<div role="switch" aria-checked="true" aria-label="Advantage+ campaign budget" data-testid="cbo-toggle">`. Strategies 1-3 all match.

**Risk Assessment:** MEDIUM. Meta rebranded CBO to "Advantage+ campaign budget" -- if they change the branding again, strategy 1 breaks. The heuristic (strategy 4) targets `<input>` but the real element is `[role="switch"]`, which is a mismatch.

---

## Meta Ads Manager -- Ad Set Level

### ad_set.name

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad_set.name` |
| **Expected Element** | `<input type="text">` |
| **Injection Position** | AFTER |
| **Extraction Method** | `input.value` with React Fiber fallback |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `input[aria-label*="Ad set name"]` | aria-label | -- | Primary. |
| 2 | data-testid match | `[data-testid*="adset-name"] input, [data-testid*="ad_set_name"] input` | data-testid | -- | |
| 3 | Heuristic proximity | Label "Ad set name" near `<input>` | heuristic | -- | |

**Mock fixture match:** Mock uses `<input aria-label="Ad set name">` inside `<div data-testid="adset-name-input">`. Strategies 1 and 2 match.

**Risk Assessment:** LOW. Same pattern as campaign.name.

---

### ad_set.targeting.geo_locations

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad_set.targeting.geo_locations` |
| **Expected Element** | Container with location chips/tags |
| **Injection Position** | INSIDE |
| **Extraction Method** | DOM chips (`[data-testid*="location-tag"]`, `.chip`, `[role="listitem"]`), then React Fiber for `Location`/`GeoTarget` component, then Fiber state, then parent container search |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `[aria-label*="Location"], [aria-label*="location"]` | aria-label | -- | Primary. Very broad -- could match many elements. |
| 2 | data-testid match | `[data-testid*="location"], [data-testid*="geo"]` | data-testid | -- | Also broad. |
| 3 | Text content | `<span>` containing "Locations" | text-content | -- | Will match section header, not the selection container. |

**Value extraction chain in getGeoLocations():**
1. `container.querySelectorAll('[data-testid*="location-tag"], .selected-location, [role="listitem"], .tag, .chip')` -> textContent array
2. React Fiber: `findReactComponentProps(container, /Location|GeoTarget|TargetingLocations/i)` -> `.selectedLocations` / `.locations` / `.value`
3. React Fiber state: `findReactComponentState(container, /Location|GeoTarget/i)` -> `.selectedLocations`
4. Parent container: `container.closest('[class*="location"], [class*="geo"]')` -> child `.tag, .chip, [role="listitem"]`

**Mock fixture match:** Mock uses `<div aria-label="Locations" data-testid="location-targeting-section">` with `.chip[role="listitem"][data-testid="location-tag-*"]` children. Strategies 1, 2 match the container; extraction step 1 finds chips.

**Risk Assessment:** MEDIUM-HIGH. The `[aria-label*="Location"]` selector is overly broad and may match unintended elements (e.g., any element with "Location" in its label). Meta's actual location picker uses a search autocomplete + chip pattern that may differ from the mock.

---

### ad_set.targeting.age_range

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad_set.targeting.age_range` |
| **Expected Element** | Container with two `<input>` or `<select>` elements |
| **Injection Position** | AFTER |
| **Extraction Method** | Two inputs/selects parsed as integers; React Fiber for `AgeRange`/`AgeSelector`/`AgePicker` |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `[aria-label*="Age"], [aria-label*="age"]` | aria-label | -- | Very broad. |
| 2 | data-testid match | `[data-testid*="age-range"], [data-testid*="age_range"]` | data-testid | -- | |
| 3 | Text content | `<span>` containing "Age" | text-content | -- | Extremely broad -- will match many spans. |

**Mock fixture match:** Mock uses `<div aria-label="Age range" data-testid="age-range-selector">` with two `<input type="number">` children. Strategy 1 matches (substring "Age" in "Age range").

**Risk Assessment:** MEDIUM. Meta typically uses custom dropdowns (`<select>`-like) for age, not `<input type="number">`. The text-content strategy matching "Age" is dangerously broad.

---

### ad_set.targeting.genders

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad_set.targeting.genders` |
| **Expected Element** | Radio group or checkbox group |
| **Injection Position** | AFTER |
| **Extraction Method** | Checked inputs/radios with label text, `aria-checked="true"` with label, `.selected`/`[aria-selected="true"]`, React Fiber for `GenderSelector` |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `[aria-label*="Gender"], [aria-label*="gender"]` | aria-label | -- | Primary. |
| 2 | data-testid match | `[data-testid*="gender"]` | data-testid | -- | |
| 3 | Text content | `<span>` containing "Gender" | text-content | -- | |

**Mock fixture match:** Mock uses `<div aria-label="Gender" data-testid="gender-selection">` with radio buttons using `aria-checked`. Strategies 1, 2 match.

**Risk Assessment:** LOW-MEDIUM. Gender is a simple selection; pattern is standard.

---

### ad_set.targeting.languages

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad_set.targeting.languages` |
| **Expected Element** | Multi-select with chips |
| **Injection Position** | AFTER |
| **Extraction Method** | `.tag, .chip, [role="listitem"], [data-testid*="language-tag"]` text, React Fiber for `LanguageSelector`/`LocaleSelector` |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `[aria-label*="Language"], [aria-label*="language"]` | aria-label | -- | Primary. |
| 2 | data-testid match | `[data-testid*="language"]` | data-testid | -- | |
| 3 | Text content | `<span>` containing "Languages" | text-content | -- | |

**Mock fixture match:** Mock uses `<div aria-label="Languages" data-testid="language-targeting-section">` with `.chip[role="listitem"]` children. Strategies 1, 2 match.

**Risk Assessment:** LOW-MEDIUM.

---

### ad_set.targeting.custom_audiences

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad_set.targeting.custom_audiences` |
| **Expected Element** | Audience picker section with chips/tags |
| **Injection Position** | N/A (no entry in META_FIELD_SELECTORS) |
| **Extraction Method** | `findFieldElement` returns null (no registry entry), then falls back to direct `document.querySelector('[data-testid*="custom-audience"], [aria-label*="Custom audience"]')` |

**CRITICAL NOTE:** This field has **no entry in META_FIELD_SELECTORS** in `meta-selectors.ts`. The getter `getCustomAudiences()` in `meta-fields.ts` falls back to a direct document query if `findFieldElement` returns null:
```
document.querySelector('[data-testid*="custom-audience"], [aria-label*="Custom audience"], [aria-label*="custom audience"]')
```

**No mock fixture exists** for custom audiences. This field is untested.

**Risk Assessment:** HIGH. Missing from selector registry. No mock fixture. Direct fallback query is speculative.

---

### ad_set.placements

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad_set.placements` |
| **Expected Element** | Checkbox group (Advantage+ vs Manual) |
| **Injection Position** | AFTER |
| **Extraction Method** | `aria-checked="true"` / `input:checked` / `.selected` with label text, React Fiber for `PlacementSelector`/`PlacementPicker`/`PlacementConfig`, Fiber prop path `placements` |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `[aria-label*="Placement"], [aria-label*="placement"]` | aria-label | -- | Primary. |
| 2 | data-testid match | `[data-testid*="placement"]` | data-testid | -- | |
| 3 | Text content | `<span>` containing "Placements" | text-content | -- | |

**Mock fixture match:** Mock uses `<div aria-label="Placements" data-testid="placement-section">` with checkbox rows using `aria-checked`. Strategies 1, 2 match.

**Risk Assessment:** MEDIUM. Meta's placement UI is complex and has been redesigned multiple times. The "Advantage+ placements" vs "Manual placements" binary may not reflect the full placement tree.

---

### ad_set.schedule.start_date

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad_set.schedule.start_date` |
| **Expected Element** | `<input type="text">` (date picker) |
| **Injection Position** | AFTER |
| **Extraction Method** | `input.value`, React Fiber fallback |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `[aria-label*="Start date"], [aria-label*="start date"]` | aria-label | -- | |
| 2 | data-testid match | `[data-testid*="start-date"], [data-testid*="start_date"]` | data-testid | -- | |
| 3 | Heuristic proximity | Label "Start date" near `<input>` | heuristic | -- | |

**Mock fixture match:** Mock uses `<input aria-label="Start date">` inside `<div data-testid="start-date-picker">`. Strategies 1, 2 match.

**Risk Assessment:** LOW-MEDIUM. Date pickers may use custom components.

---

### ad_set.schedule.end_date

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad_set.schedule.end_date` |
| **Expected Element** | `<input type="text">` (date picker) |
| **Injection Position** | AFTER |
| **Extraction Method** | `input.value`, React Fiber fallback |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `[aria-label*="End date"], [aria-label*="end date"]` | aria-label | -- | |
| 2 | data-testid match | `[data-testid*="end-date"], [data-testid*="end_date"]` | data-testid | -- | |
| 3 | Heuristic proximity | Label "End date" near `<input>` | heuristic | -- | |

**Mock fixture match:** Same pattern as start_date. Strategies 1, 2 match.

**Risk Assessment:** LOW-MEDIUM.

---

## Meta Ads Manager -- Ad Level

### ad.name

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad.name` |
| **Expected Element** | `<input type="text">` |
| **Injection Position** | AFTER |
| **Extraction Method** | `input.value`, React Fiber fallback |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `input[aria-label*="Ad name"]` | aria-label | -- | |
| 2 | data-testid match | `[data-testid*="ad-name"] input, [data-testid*="ad_name"] input` | data-testid | -- | |
| 3 | Heuristic proximity | Label "Ad name" near `<input>` | heuristic | -- | |

**Mock fixture:** No dedicated ad-level mock fixture exists. This field is tested only if the ad creation step appears in the campaign/adset fixtures.

**Risk Assessment:** LOW. Standard text input pattern.

---

### ad.creative.destination_url

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad.creative.destination_url` |
| **Expected Element** | `<input type="text">` or `<input type="url">` |
| **Injection Position** | AFTER |
| **Extraction Method** | `input.value`, React Fiber fallback |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `input[aria-label*="Website URL"], input[aria-label*="website URL"]` | aria-label | -- | |
| 2 | data-testid match | `[data-testid*="destination-url"] input, [data-testid*="website-url"] input` | data-testid | -- | |
| 3 | Heuristic proximity | Label "Website URL" near `<input>` | heuristic | -- | |

**Mock fixture:** No dedicated ad-level mock fixture.

**Risk Assessment:** LOW-MEDIUM. Meta may use "Destination" or "URL" without "Website" prefix.

---

### ad.creative.cta_type

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad.creative.cta_type` |
| **Expected Element** | Dropdown / custom select |
| **Injection Position** | AFTER |
| **Extraction Method** | `HTMLSelectElement.value`, `aria-selected="true"` option text, element textContent, React Fiber |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `[aria-label*="Call to action"], [aria-label*="call to action"]` | aria-label | -- | |
| 2 | data-testid match | `[data-testid*="cta"], [data-testid*="call-to-action"]` | data-testid | -- | |
| 3 | Text content | `<span>` containing "Call to action" | text-content | -- | |

**Mock fixture:** No dedicated ad-level mock fixture.

**Risk Assessment:** MEDIUM. CTA dropdown is a custom component in Meta's UI.

---

### ad.creative.page_id

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad.creative.page_id` |
| **Expected Element** | Page selector dropdown |
| **Injection Position** | AFTER |
| **Extraction Method** | `data-page-id` / `data-id` attribute, `HTMLSelectElement.value`, `aria-selected` option text, React Fiber for `PageSelector`/`PagePicker`/`FacebookPage` |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | aria-label match | `[aria-label*="Facebook Page"], [aria-label*="facebook page"]` | aria-label | -- | |
| 2 | data-testid match | `[data-testid*="page-selector"], [data-testid*="facebook-page"]` | data-testid | -- | |
| 3 | Text content | `<span>` containing "Facebook Page" | text-content | -- | |

**Mock fixture:** No dedicated ad-level mock fixture.

**Risk Assessment:** MEDIUM. Meta may label this "Identity" or "Page" without "Facebook Page" text.

---

## Meta Ads Manager -- Publish Button

| Attribute | Value |
|:----------|:------|
| **Field Path** | `publish_button` / `creation_intercept` |
| **Expected Element** | `<button>` |
| **Injection Position** | OVERLAY |

| # | Strategy | Selector / Pattern | Method | Pass/Fail | Notes |
|:-:|:---------|:-------------------|:-------|:---------:|:------|
| 1 | Submit button | `button[type="submit"]` | aria-label | -- | Most pages have a submit button. |
| 2 | data-testid match | `[data-testid*="publish"] button, [data-testid*="submit"] button` | data-testid | -- | |
| 3 | Text content | `<button>` containing "Publish" | text-content | -- | |
| 4 | Text content | `<button>` containing "Next" | text-content | -- | For multi-step flows. |

**Mock fixture match:** Both campaign and adset fixtures have `<button type="submit" data-testid="publish-button">`. Strategies 1, 2, 3/4 match.

**Risk Assessment:** LOW. Submit buttons are standard.

---

## Google Ads -- Campaign Level

### campaign.name

| Attribute | Value |
|:----------|:------|
| **Field Path** | `campaign.name` |
| **Expected Element** | `<input>` inside `<material-input>` custom element |
| **Injection Position** | AFTER |
| **Extraction Method** | `readSingleValue` with `pierceShadowForInput` for Material components |

| # | Strategy (selector chain, tried in order) | Pass/Fail | Notes |
|:-:|:------------------------------------------|:---------:|:------|
| 1 | `material-input[debugid="campaign-name"] input` | -- | Primary. Relies on `debugid` attribute. |
| 2 | `material-input[debugid="ad-name"] input` | -- | Alternate debugid. |
| 3 | `input[name="campaign-name"]` | -- | Standard name attribute. |
| 4 | `input[aria-label*="Campaign name" i]` | -- | Case-insensitive aria-label. |
| 5 | `input[aria-label*="campaign name" i]` | -- | Redundant with #4 (both case-insensitive). |
| 6 | `.campaign-name-section input` | -- | Class-based heuristic. |

**Mock fixture match:** Mock uses `<material-input debugid="campaign-name">` with `<input aria-label="Campaign name" name="campaign-name">`. Selectors 1, 3, 4, 5 all match.

**Risk Assessment:** LOW. The `debugid` attribute is a Google Ads-specific internal attribute that is well-documented and stable. Multiple fallbacks provide resilience.

---

### campaign.type

| Attribute | Value |
|:----------|:------|
| **Field Path** | `campaign.type` |
| **Expected Element** | Radiogroup or listbox |
| **Injection Position** | AFTER |
| **Extraction Method** | `readSingleValue` + special handling for `[data-campaigntype][aria-checked="true"]` |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `[debugid="campaign-type-selector"]` | -- | Primary. |
| 2 | `.campaign-type-selector [role="listbox"]` | -- | |
| 3 | `.campaign-type-section [role="radiogroup"]` | -- | |
| 4 | `[data-campaigntype]` | -- | Matches any element with this attribute. |
| 5 | `.campaign-subtype-selector` | -- | For sub-type selection. |

**Special extraction in getCampaignType():** After standard read, also tries `[data-campaigntype][aria-checked="true"]` and reads `data-campaigntype` attribute or textContent.

**Mock fixture match:** Mock uses `<div debugid="campaign-type-selector" role="radiogroup">` with children having `data-campaigntype` and `aria-checked`. Selectors 1, 4 match.

**Risk Assessment:** MEDIUM. Google Ads campaign type selection varies between Smart and Standard modes. The wizard flow may show this as a card selection, dropdown, or radio group depending on account type.

---

### campaign.budget_value

| Attribute | Value |
|:----------|:------|
| **Field Path** | `campaign.budget_value` |
| **Expected Element** | `<input>` inside `<material-input>` |
| **Injection Position** | AFTER |
| **Extraction Method** | `readSingleValue` with currency stripping, parsed to float |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `material-input[debugid="budget-input"] input` | -- | Primary. |
| 2 | `input[aria-label*="Budget" i]` | -- | |
| 3 | `input[aria-label*="budget" i]` | -- | Redundant with #2. |
| 4 | `.budget-section input[type="number"]` | -- | |
| 5 | `.budget-section input[type="text"]` | -- | |
| 6 | `.budget-input input` | -- | |

**Mock fixture match:** Mock uses `<material-input debugid="budget-input">` with `<input type="number" aria-label="Budget">`. Selectors 1, 2, 4 match.

**Risk Assessment:** LOW. Well-covered by multiple strategies.

---

### campaign.bidding_strategy

| Attribute | Value |
|:----------|:------|
| **Field Path** | `campaign.bidding_strategy` |
| **Expected Element** | Listbox / dropdown |
| **Injection Position** | AFTER |
| **Extraction Method** | `readSingleValue` + special handling for `[debugid="bidding-strategy-selector"] [aria-selected="true"]` and `data-biddingstrategy` attribute |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `[debugid="bidding-strategy-selector"]` | -- | Primary. |
| 2 | `.bidding-strategy-section [role="listbox"]` | -- | |
| 3 | `.bidding-section .selected-strategy` | -- | |
| 4 | `[data-biddingstrategy]` | -- | |
| 5 | `.bidding-type-selector` | -- | |

**Mock fixture match:** Mock uses `<div debugid="bidding-strategy-selector" role="listbox">` with `<div data-biddingstrategy="MAXIMIZE_CONVERSIONS" class="selected-strategy">`. Selectors 1, 2, 3, 4 all match.

**Risk Assessment:** MEDIUM. Bidding strategy UI varies by campaign type (Search vs Display vs Video). Smart campaigns may not show this selector at all.

---

### campaign.geo_targets

| Attribute | Value |
|:----------|:------|
| **Field Path** | `campaign.geo_targets` |
| **Expected Element** | List of selected location items |
| **Injection Position** | AFTER |
| **Shadow DOM** | Yes |
| **Extraction Method** | `readArrayValue` with shadow DOM piercing |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `.location-targeting-panel .selected-location` | -- | Primary. |
| 2 | `.location-targeting .location-item` | -- | |
| 3 | `.geo-targets-section .target-item` | -- | |
| 4 | `.locations-section .selected-item` | -- | |
| 5 | `[debugid="location-targeting"] .location-row` | -- | |

**Mock fixture match:** Mock uses `.location-targeting-panel` with `.selected-location.location-item.location-row` children, plus `debugid="location-targeting"`. Selectors 1, 2, 5 all match.

**Risk Assessment:** HIGH. Google Ads location targeting uses Material autocomplete components that may render inside Shadow DOM. The mock does NOT simulate Shadow DOM at all. The real UI likely uses different class names for location items.

---

### campaign.languages

| Attribute | Value |
|:----------|:------|
| **Field Path** | `campaign.languages` |
| **Expected Element** | Chips / selected items |
| **Injection Position** | AFTER |
| **Extraction Method** | `readArrayValue` |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `.language-targeting-section .selected-language` | -- | Primary. |
| 2 | `.language-section .language-item` | -- | |
| 3 | `[debugid="language-selector"] .selected-item` | -- | |
| 4 | `.languages-section .chip` | -- | |
| 5 | `.language-targeting .mat-chip` | -- | |

**Mock fixture match:** Mock uses `.language-targeting-section.languages-section` with `.selected-language.selected-item.mat-chip` children. Selectors 1, 3, 4, 5 match.

**Risk Assessment:** MEDIUM. Class names are speculative; Google Ads may use different component structures.

---

### campaign.brand_safety

| Attribute | Value |
|:----------|:------|
| **Field Path** | `campaign.brand_safety` |
| **Expected Element** | Excluded category chips |
| **Injection Position** | AFTER |
| **Extraction Method** | `readArrayValue` |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `.content-exclusion-section .excluded-category` | -- | Primary. |
| 2 | `.brand-safety-section .excluded-item` | -- | |
| 3 | `[debugid="content-exclusions"] .exclusion-item` | -- | |
| 4 | `.content-exclusions .selected-exclusion` | -- | |
| 5 | `.brand-safety .mat-chip` | -- | |

**Mock fixture match:** Mock uses `.content-exclusion-section.brand-safety-section` with `.excluded-category.excluded-item.exclusion-item.mat-chip` children. Selectors 1, 2, 3, 5 match.

**Risk Assessment:** MEDIUM-HIGH. Content exclusion section may not be visible by default; it might require expanding an "Additional settings" panel.

---

### campaign.start_date

| Attribute | Value |
|:----------|:------|
| **Field Path** | `campaign.start_date` |
| **Expected Element** | `<input>` inside `<material-input>` |
| **Injection Position** | AFTER |
| **Extraction Method** | `readSingleValue` |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `material-input[debugid="start-date"] input` | -- | Primary. |
| 2 | `input[aria-label*="Start date" i]` | -- | |
| 3 | `.start-date-section input` | -- | |
| 4 | `.schedule-section input[data-type="start"]` | -- | |
| 5 | `.date-range-picker input:first-of-type` | -- | |

**Mock fixture match:** Mock uses `<material-input debugid="start-date">` with `<input aria-label="Start date">`. Selectors 1, 2, 3 match.

**Risk Assessment:** LOW-MEDIUM.

---

### campaign.end_date

| Attribute | Value |
|:----------|:------|
| **Field Path** | `campaign.end_date` |
| **Expected Element** | `<input>` inside `<material-input>` |
| **Injection Position** | AFTER |
| **Extraction Method** | `readSingleValue` |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `material-input[debugid="end-date"] input` | -- | Primary. |
| 2 | `input[aria-label*="End date" i]` | -- | |
| 3 | `.end-date-section input` | -- | |
| 4 | `.schedule-section input[data-type="end"]` | -- | |
| 5 | `.date-range-picker input:last-of-type` | -- | |

**Mock fixture match:** Same pattern as start_date. Selectors 1, 2, 3 match.

**Risk Assessment:** LOW-MEDIUM.

---

## Google Ads -- Ad Group Level

### ad_group.name

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad_group.name` |
| **Expected Element** | `<input>` inside `<material-input>` |
| **Injection Position** | AFTER |
| **Extraction Method** | `readSingleValue` |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `material-input[debugid="ad-group-name"] input` | -- | Primary. |
| 2 | `input[aria-label*="Ad group name" i]` | -- | |
| 3 | `input[name="ad-group-name"]` | -- | |
| 4 | `.ad-group-name-section input` | -- | |

**Mock fixture:** No ad group step in the Google wizard fixture. This field is untested in mocks.

**Risk Assessment:** LOW. Standard pattern, but untested in mocks.

---

### ad_group.cpc_bid

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad_group.cpc_bid` |
| **Expected Element** | `<input>` (numeric) |
| **Injection Position** | AFTER |
| **Extraction Method** | `readSingleValue` with currency stripping, parsed to float |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `material-input[debugid="default-bid"] input` | -- | Primary. |
| 2 | `input[aria-label*="Default bid" i]` | -- | |
| 3 | `input[aria-label*="Max CPC" i]` | -- | |
| 4 | `.bid-section input[type="number"]` | -- | |
| 5 | `.bid-section input[type="text"]` | -- | |
| 6 | `.default-bid input` | -- | |

**Mock fixture:** Not present in Google wizard fixture. Untested.

**Risk Assessment:** LOW-MEDIUM. Standard input pattern.

---

## Google Ads -- Ad Level

### ad.headlines

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad.headlines` |
| **Expected Element** | Multiple `<input>` elements (RSA headlines) |
| **Injection Position** | AFTER |
| **isArray** | true |
| **Extraction Method** | `readArrayValue` |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `material-input[debugid*="headline"] input` | -- | Primary. Wildcard on debugid. |
| 2 | `input[aria-label*="Headline" i]` | -- | |
| 3 | `.headline-input input` | -- | |
| 4 | `.ad-creative-section .headline input` | -- | |
| 5 | `.rsa-headline input` | -- | |

**Mock fixture:** Not present in Google wizard fixture. The wizard fixture stops at campaign settings (step 3); ad creation is step 5.

**Risk Assessment:** MEDIUM. RSA headline inputs may use Shadow DOM.

---

### ad.descriptions

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad.descriptions` |
| **Expected Element** | Multiple `<input>` or `<textarea>` elements |
| **Injection Position** | AFTER |
| **isArray** | true |
| **Extraction Method** | `readArrayValue` |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `material-input[debugid*="description"] input` | -- | |
| 2 | `textarea[aria-label*="Description" i]` | -- | |
| 3 | `input[aria-label*="Description" i]` | -- | |
| 4 | `.description-input input` | -- | |
| 5 | `.ad-creative-section .description input` | -- | |
| 6 | `.rsa-description textarea` | -- | |

**Mock fixture:** Not present. Untested.

**Risk Assessment:** MEDIUM. May use `<textarea>` instead of `<input>`.

---

### ad.final_url

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad.final_url` |
| **Expected Element** | `<input>` for URL |
| **Injection Position** | AFTER |
| **Extraction Method** | `readSingleValue` |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `material-input[debugid="final-url"] input` | -- | |
| 2 | `input[aria-label*="Final URL" i]` | -- | |
| 3 | `input[name="final-url"]` | -- | |
| 4 | `.final-url-section input` | -- | |
| 5 | `.url-section input[type="url"]` | -- | |
| 6 | `.url-section input[type="text"]` | -- | |

**Mock fixture:** Not present. Untested.

**Risk Assessment:** LOW-MEDIUM. Standard URL input.

---

### ad.display_path

| Attribute | Value |
|:----------|:------|
| **Field Path** | `ad.display_path` |
| **Expected Element** | Multiple `<input>` elements (path1, path2) |
| **Injection Position** | AFTER |
| **isArray** | true |
| **Extraction Method** | `readArrayValue` |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `material-input[debugid*="display-path"] input` | -- | |
| 2 | `input[aria-label*="Display path" i]` | -- | |
| 3 | `input[aria-label*="Path" i]` | -- | Very broad -- could match URL path inputs. |
| 4 | `.display-path-section input` | -- | |
| 5 | `.path-section input` | -- | |

**Mock fixture:** Not present. Untested.

**Risk Assessment:** MEDIUM. Strategy 3 (`aria-label*="Path"`) is dangerously broad.

---

## Google Ads -- Publish Button

| Attribute | Value |
|:----------|:------|
| **Field Path** | `publish_button` |
| **Injection Position** | OVERLAY |

| # | Strategy (selector chain) | Pass/Fail | Notes |
|:-:|:--------------------------|:---------:|:------|
| 1 | `button[type="submit"]` | -- | |
| 2 | `[data-test="create-button"]` | -- | |
| 3 | `.bottom-section button.primary` | -- | |
| 4 | `awsm-app-bar button.primary` | -- | App bar submit button. |

**Mock fixture match:** Mock uses `<button type="submit" class="mat-button primary" data-test="create-button">`. Selectors 1, 2, 3 match.

**Risk Assessment:** LOW.

---

## Selector Telemetry Coverage

The selector telemetry module (`src/utils/selector-telemetry.ts`) provides:

- **Ring buffer storage** in `chrome.storage.local` with max 100 entries
- **In-memory batching** with 5-second flush interval or 10-entry threshold
- **Success/failure counters** tracked per session and persisted
- **Health stats API** via `getSelectorHealth()` returning:
  - Total lookups, success count, failure count, success rate
  - Top 10 failing fields (sorted by failure count)
  - Last 5 failures

**Integration points:**
- Meta: `findFieldElement()` in `meta-selectors.ts` calls `recordSelectorLookup()` for every field lookup
- Google: `extractAllFieldValues()` in `google-fields.ts` calls `recordSelectorLookup()` for every field

**Telemetry data captured per lookup:**
- `selector` -- the selector chain or strategy description
- `platform` -- "meta" or "google_ads"
- `fieldPath` -- e.g., "campaign.name"
- `timestamp` -- ISO string
- `found` -- boolean
- `strategy` -- which strategy resolved (or "all_failed" / "error")

**Gaps identified:**
1. **Meta telemetry does not record WHICH strategy succeeded.** It records "resolved" on success but does not indicate whether strategy 1, 2, or 3 was used. This makes it harder to detect when primary selectors start failing and fallbacks are being used.
2. **Google telemetry records strategy as "shadow-dom" or "query-chain"** but not the specific selector that matched.
3. **No alert threshold.** The telemetry tracks failures but does not trigger alerts when failure rates exceed a threshold. Consider adding a warning when success rate drops below 80%.
4. **No per-strategy breakdown.** To diagnose selector drift, we need to know the success rate of each individual strategy, not just the overall field success rate.

**Recommendations for newly discovered patterns to track:**
- Track the `aria-label` text that was actually found (to detect label text changes before full failure)
- Track whether Shadow DOM piercing was required (for Google Ads)
- Track the `data-testid` values found (Meta may add/change test IDs)
- Track element tag name and attributes of matched elements (to detect DOM structure changes)
- Track wizard step (Google Ads) to correlate field availability with navigation state

---

## Mock Fixture vs. Real DOM Analysis

### Meta Ads Manager Fixtures

**Campaign creation fixture** (`meta-campaign-creation.html`):
- Covers 5 fields: `campaign.name`, `campaign.objective`, `campaign.budget_type`, `campaign.budget_value`, `campaign.cbo_enabled`
- Includes React Fiber simulation with `__reactFiber$` keys
- Uses realistic `aria-label`, `data-testid`, `role` attributes
- **Gap:** Does not cover ad-level fields (ad.name, ad.creative.*)

**Ad set creation fixture** (`meta-adset-creation.html`):
- Covers 7 fields: `ad_set.name`, `ad_set.targeting.geo_locations`, `ad_set.targeting.age_range`, `ad_set.targeting.genders`, `ad_set.targeting.languages`, `ad_set.placements`, `ad_set.schedule.start_date`, `ad_set.schedule.end_date`
- Includes React Fiber simulation
- **Gap:** Does not cover `ad_set.targeting.custom_audiences` (no fixture at all)

**Critical differences likely vs. real Meta UI:**

| Aspect | Mock | Real (expected) |
|:-------|:-----|:-----------------|
| CSS class names | Uses meaningful names (`.budget-section`, `.chip`) | Uses obfuscated/hashed class names (`._3-90`, `._42ft`) |
| React Fiber keys | Simulated with `__reactFiber$mock*` | Real keys are `__reactFiber$` + random suffix |
| Obfuscated classes | Some included (`._3-90`, `._42ft`, `._5ptz`) | More extensive obfuscation |
| Shadow DOM | Not used | Not expected (React, not Web Components) |
| Dynamic loading | All elements present on page load | Elements may load asynchronously / lazily |
| A/B test variations | Not simulated | Common; UI structure may vary between users |
| Advantage+ branding | Uses current "Advantage+" text | May change without notice |

### Google Ads Fixture

**Campaign wizard fixture** (`google-campaign-wizard.html`):
- Covers 9 fields: `campaign.name`, `campaign.type`, `campaign.budget_value`, `campaign.bidding_strategy`, `campaign.geo_targets`, `campaign.languages`, `campaign.brand_safety`, `campaign.start_date`, `campaign.end_date`
- Shows stepper UI with multiple completed steps
- Uses `<material-input>` custom elements with `debugid` attributes
- **Gap:** Does not cover ad group fields, ad creative fields, or the ad step of the wizard

**Critical differences likely vs. real Google Ads UI:**

| Aspect | Mock | Real (expected) |
|:-------|:-----|:-----------------|
| `<material-input>` | Plain custom element with child `<input>` | May render `<input>` inside Shadow DOM |
| `debugid` attributes | Present and stable | Google-internal attribute; generally stable but not guaranteed |
| Shadow DOM | Not simulated | Used by some Material components |
| Wizard navigation | All fields on one page | Fields split across wizard steps; only current step DOM exists |
| Smart vs Standard | Not distinguished | Smart campaigns have completely different UI flow |
| Angular state | Not simulated | Angular component state available via `ng.probe()` |

---

## Edge Cases to Test

### Meta Ads Manager

- [ ] **A/B test variations:** Meta frequently tests different UI layouts for campaign creation. Check if the objective selector uses cards, radio buttons, or a different layout. Verify that `aria-label` text is consistent.
- [ ] **Advantage+ rebrand:** The CBO toggle may change branding from "Advantage+ campaign budget" to something else. Check the current aria-label text.
- [ ] **Collapsed sections:** Some targeting sections (detailed targeting, connections) may be collapsed by default and need clicking to expand before selectors can find elements.
- [ ] **Custom audiences dialog:** Custom audience selection opens a modal/dialog overlay -- selectors need to target elements WITHIN the dialog, not behind it.
- [ ] **Multi-ad-account:** Users with multiple ad accounts may see an account picker that delays the campaign creation UI loading.
- [ ] **Different languages:** If the user's Facebook is set to a non-English language, aria-label values will be in that language. The selectors assume English text.
- [ ] **Async loading:** Meta Ads Manager loads sections lazily. Selectors may fail if called before the section's DOM is rendered.
- [ ] **Advantage+ Shopping campaigns:** These have a completely different creation flow with fewer fields.
- [ ] **Screen sizes:** At narrow viewports (< 1200px), Meta may render a single-column layout. Check that selectors still find elements.

### Google Ads

- [ ] **Smart campaigns vs Standard:** Smart campaign wizard has a simplified UI with different fields. Campaign type selection may not even appear.
- [ ] **Performance Max campaigns:** Different creation flow with asset groups instead of ad groups.
- [ ] **Multi-step wizard navigation:** Fields only exist in the DOM when their wizard step is active. Budget field is not in the DOM during the "Ad groups" step.
- [ ] **Shadow DOM in Material components:** Some `<material-input>` components render their `<input>` inside a Shadow Root. The `pierceShadowForInput` function handles this, but only if the shadow root is open (not closed).
- [ ] **Different screen sizes:** Google Ads responsive layout may change component structure at different breakpoints (1920x1080, 1366x768, 1024x768).
- [ ] **Different languages:** `debugid` attributes should be language-independent, but `aria-label` values will be localized.
- [ ] **Expert mode vs Smart mode:** Users in "Smart mode" see a completely different interface. The extension should detect this and either adapt or skip extraction.
- [ ] **Recommendation overlays:** Google Ads shows recommendation banners/cards that may push content or overlay form fields.
- [ ] **Expanded/collapsed sections:** "Additional settings" in Google Ads (network settings, devices, ad schedule) are collapsed by default.
- [ ] **New campaign subtypes:** Google regularly adds new campaign subtypes (e.g., Demand Gen, Video action) with different wizard flows.

### Cross-Platform

- [ ] **Browser zoom levels:** Test at 100%, 125%, 150% zoom
- [ ] **Multiple tabs:** Verify selectors work when multiple ad platform tabs are open
- [ ] **Extension version conflicts:** Ensure no conflicts with other ad-management browser extensions (e.g., Meta Pixel Helper, Google Ads Tag Assistant)

---

## Known Risk Assessment

### HIGH Risk Selectors (likely to fail on real UI)

1. **`ad_set.targeting.custom_audiences`** -- No selector registry entry, no mock fixture. The getter falls back to direct document query with speculative selectors.
2. **`campaign.geo_targets` (Google)** -- All selectors use class names (`.location-targeting-panel`, `.selected-location`) that are speculative. Shadow DOM is flagged but not tested in mocks. The real Google Ads location targeting uses a Material autocomplete component with complex DOM.
3. **`ad.display_path` (Google)** -- Strategy 3 uses `[aria-label*="Path"]` which is dangerously broad and will likely match other inputs.

### MEDIUM-HIGH Risk Selectors

4. **`campaign.budget_value` (Meta)** -- The `type="text"` constraint in strategy 1 may not match if Meta uses `type="number"`.
5. **`campaign.brand_safety` (Google)** -- Content exclusion section may be hidden/collapsed by default.
6. **`ad_set.targeting.geo_locations` (Meta)** -- The `[aria-label*="Location"]` selector is very broad.
7. **All Google Ads ad-level fields** (headlines, descriptions, final_url, display_path) -- No mock fixtures exist. These fields appear only in the ad creation wizard step which is not represented in fixtures.
8. **All Google Ads ad-group-level fields** (ad_group.name, ad_group.cpc_bid) -- No mock fixtures.

### MEDIUM Risk Selectors

9. **`campaign.objective` (Meta)** -- Meta A/B tests objective UI. React Fiber component name `/Objective|ObjectiveSelector/i` is speculative.
10. **`campaign.type` (Google)** -- Different wizard flows for Smart vs Standard.
11. **`campaign.bidding_strategy` (Google)** -- Varies by campaign type.
12. **`ad.creative.page_id` (Meta)** -- No mock fixture; label may be "Identity" instead of "Facebook Page".
13. **`ad.creative.cta_type` (Meta)** -- No mock fixture.

### LOW Risk Selectors

14. All name inputs (`campaign.name`, `ad_set.name`, `ad.name`, `ad_group.name`) -- Standard text inputs with `aria-label` matching.
15. Publish buttons -- Standard `button[type="submit"]`.
16. Schedule dates -- Standard date inputs.

---

## Manual Testing Instructions

### Prerequisites

- Chrome browser (latest stable)
- Extension built and loaded as unpacked from `packages/extension/dist/`
- Test ad accounts for both Meta Ads Manager and Google Ads
- Chrome DevTools open (F12)

### Meta Ads Manager Testing

1. **Log in** to [https://adsmanager.facebook.com/](https://adsmanager.facebook.com/) with a test account
2. Click **"Create"** to start the campaign creation flow
3. **For each field in the tables above:**
   a. Open Chrome DevTools > Elements panel
   b. Copy the primary CSS selector from the table
   c. Press Ctrl+F in the Elements panel and paste the selector
   d. Check if it matches the expected element
   e. If it matches, mark the field as PASS
   f. If it does NOT match, try each fallback selector in order
   g. Document which selector (if any) matched and what the actual DOM looks like

4. **Campaign level fields** -- Test during the "Campaign" step of creation
5. **Ad set level fields** -- Navigate to the "Ad Set" step
6. **Ad level fields** -- Navigate to the "Ad" step

7. **React Fiber verification:**
   a. In DevTools Console, run: `Object.keys(document.querySelector('input[aria-label*="Campaign name"]')).filter(k => k.startsWith('__reactFiber'))`
   b. Confirm a fiber key is returned
   c. Run: `document.querySelector('input[aria-label*="Campaign name"]')[Object.keys(document.querySelector('input[aria-label*="Campaign name"]')).find(k => k.startsWith('__reactFiber'))].memoizedProps`
   d. Verify that `memoizedProps.value` contains the campaign name

### Google Ads Testing

1. **Log in** to [https://ads.google.com/](https://ads.google.com/) with a test account
2. Click **"+ New campaign"** to start the campaign creation wizard
3. **Select a goal** (e.g., "Sales" or "Website traffic")
4. **Select "Search" campaign type**
5. **For each field in the tables above:**
   a. When you reach the wizard step containing the field, open DevTools
   b. Test each selector in the chain
   c. For Shadow DOM fields, check if `material-input` elements have a `.shadowRoot`
   d. Document results

6. **Test Smart campaign flow:**
   a. Create a new campaign and select "Smart campaign" if available
   b. Document which fields are present/missing vs Standard campaign

7. **Shadow DOM check:**
   a. In DevTools Console: `document.querySelector('material-input[debugid="campaign-name"]')?.shadowRoot`
   b. If non-null, the input is inside Shadow DOM and needs piercing

### Recording Results

For each field, update the Pass/Fail column in the tables above:
- **PASS** -- Primary selector matches, value extraction works
- **FALLBACK** -- Primary selector fails but a fallback works (document which one)
- **FAIL** -- No selector matches; document the actual DOM structure in Notes
- **N/A** -- Field not present in the current wizard step

---

## Summary

- **Total Fields:** 33 (18 Meta + 15 Google)
- **Total Selector Strategies:** 124 (56 Meta + 68 Google)
- **Fields Covered by Mock Fixtures:** 22 of 33 (67%)
- **Fields NOT Covered by Any Mock Fixture:** 11

### Uncovered Fields (No Mock Fixture)

| Field Path | Platform | Risk |
|:-----------|:---------|:-----|
| `ad_set.targeting.custom_audiences` | Meta | HIGH |
| `ad.name` | Meta | LOW |
| `ad.creative.destination_url` | Meta | LOW-MEDIUM |
| `ad.creative.cta_type` | Meta | MEDIUM |
| `ad.creative.page_id` | Meta | MEDIUM |
| `ad_group.name` | Google | LOW |
| `ad_group.cpc_bid` | Google | LOW-MEDIUM |
| `ad.headlines` | Google | MEDIUM |
| `ad.descriptions` | Google | MEDIUM |
| `ad.final_url` | Google | LOW-MEDIUM |
| `ad.display_path` | Google | MEDIUM |

### Overall Risk Assessment

**Before manual testing, the estimated risk breakdown is:**

| Risk Level | Count | Fields |
|:-----------|:-----:|:-------|
| HIGH | 3 | custom_audiences (Meta), geo_targets (Google), display_path strategy 3 (Google) |
| MEDIUM-HIGH | 5 | budget_value type constraint (Meta), brand_safety collapsed (Google), geo_locations broad (Meta), all untested Google ad/ad-group fields |
| MEDIUM | 8 | objective A/B (Meta), campaign.type Smart (Google), bidding_strategy (Google), page_id (Meta), cta_type (Meta), headlines (Google), descriptions (Google), display_path (Google) |
| LOW-MEDIUM | 8 | Various date and URL fields |
| LOW | 9 | Name inputs, publish buttons |

**Estimated pass rate on real platforms (pre-testing):** 60-75%. This estimate is based on:
- Strong primary selectors (aria-label) for ~60% of fields
- Untested ad-level and ad-group-level fields (~33% of total) add uncertainty
- Shadow DOM and A/B test risks for the remaining fields

**Recommendation:** If manual testing confirms a pass rate below 70%, a Phase 2.75 hardening sprint should be scheduled to:
1. Add mock fixtures for all uncovered fields
2. Test with real Shadow DOM components
3. Add multiple new fallback strategies
4. Implement the `MutationObserver` pattern for async-loading fields

---

**Selectors Tested:** 0 / 33
**Passing:** TBD
**Failing:** TBD
**Blockers:** TBD (awaiting manual testing)
