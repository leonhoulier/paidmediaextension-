# Field Extraction Scorecard

**Date:** 2026-04-03
**URL:** `https://adsmanager.facebook.com/adsmanager/manage/campaigns/edit/standalone?act=123085282410066`
**Campaign:** New Traffic Campaign / New Traffic Ad Set / New Traffic Ad

---

## 1. Selector-Based Field Extraction (per-panel)

| Field Path | Selector | Campaign | Ad Set | Ad | Status |
|---|---|---|---|---|---|
| `campaign.name` | `input[placeholder*="campaign name" i]` | FOUND: `New Traffic Campaign` | not present | not present | PASS |
| `campaign.budget_value` | `input[placeholder*="enter amount" i]` | FOUND: `350.00` | not present | not present | PASS |
| `campaign.objective` | `[role="row"]:has(input[type="radio"]:checked)` > heading | FOUND: `Traffic` | not present | not present | PASS |
| `ad_set.name` | `input[placeholder*="ad set name" i]` | not present | FOUND: `New Traffic Ad Set` | not present | PASS |
| `ad_set.bid_amount` | `input[placeholder="X.XXX"]` | not present | FOUND (empty/disabled) | not present | PASS (field exists when relevant) |
| `ad.name` | `input[placeholder*="ad name" i]` | not present | not present | FOUND: `New Traffic Ad` | PASS |
| `ad.tracking.url_parameters` | `input[placeholder*="key1=value1" i]` | not present | not present | FOUND (empty) | PASS |

### Notes on selectors
- The `ad.name` input's actual placeholder is `"Enter your ad name here..."` -- the selector `input[placeholder*="ad name" i]` does NOT match this. However, it was still found via the combobox `[role="combobox"]` with value `"New Traffic Ad"`. The scorecard above reflects the combobox-based extraction.
- The `ad.tracking.url_parameters` input's actual placeholder is `"key1=value1&key2=value2"` -- the selector matches correctly.
- **IMPORTANT:** The `ad.name` selector `input[placeholder*="ad name" i]` actually matches an `<input>` nested inside the combobox, not a standalone input. The evaluate_script found it via the combobox's internal input with placeholder `"Enter your ad name here..."`. This matched because all name fields use `[role="combobox"]` with an internal `<input>`.

---

## 2. UI Element Counts (per-panel)

| Element | Campaign Panel | Ad Set Panel | Ad Panel |
|---|---|---|---|
| `[role="combobox"]` | 4 | 3 | 4 |
| `[role="switch"]` | 2 | 2 | 3 |

---

## 3. Governance Extension Components

| Component | Element ID | Has Shadow DOM |
|---|---|---|
| `validation-banner` | `gov-banner-ad_set.facebook_page` | Yes |
| `validation-banner` | `gov-banner-ad.partnership_ad` | Yes |
| `naming-preview` | `gov-naming-preview` | Yes |
| `validation-banner` | `gov-banner-campaign.name` | Yes |
| `validation-banner` | `gov-banner-campaign.budget_type` | Yes |
| `validation-banner` | `gov-banner-ad.name` | Yes |
| `validation-banner` | `gov-banner-ad.creative.page_id` | Yes |
| `sidebar` | `gov-sidebar` | Yes |
| `creation-blocker` | `gov-creation-blocker` | Yes |
| `campaign-score` | `gov-campaign-score` | Yes |

**Sidebar status:** Present, functional, rendered inside shadow DOM.
- 25 guidelines total: 11 passing, 12 failing, 2 unverified
- 48% compliant (on Ad panel)
- The sidebar selector `[data-gov-component="sidebar"]` works. Internal class is `.sidebar__summary`, not `.sidebar__header`.

---

## 4. Extension Body-Class Extraction Markers

These CSS classes on `<body>` confirm the extension successfully extracted each field:

| Extracted Field | Body Class |
|---|---|
| `ad_set.beneficiary_payer` | `dlg-extracted-ad_set-beneficiary_payer` |
| `ad.partnership_ad` | `dlg-extracted-ad-partnership_ad` |
| `campaign.a_b_test` | `dlg-extracted-campaign-a_b_test` |
| `campaign.cbo_enabled` | `dlg-extracted-campaign-cbo_enabled` |
| `ad_set.facebook_page` | `dlg-extracted-ad_set-facebook_page` |
| `campaign.budget_type` | `dlg-extracted-campaign-budget_type` |
| `campaign.objective` | `dlg-extracted-campaign-objective` |
| `ad.creative.format` | `dlg-extracted-ad-creative-format` |
| `ad.name` | `dlg-extracted-ad-name` |

**Total fields extracted by extension:** 9

---

## 5. Governance Rule Validation Status

| Rule | Status | Body Class |
|---|---|---|
| `campaign.objective` | VALID | `gov-valid-campaign-objective` |
| `campaign.budget_type` | VALID | `gov-valid-campaign-budget_type` |
| `campaign.name` | VALID | `gov-valid-campaign-name` |
| `campaign.daily_budget` | VALID | `gov-valid-campaign-daily_budget` |
| `campaign.budget_value` | VALID | `gov-valid-campaign-budget_value` |
| `campaign.cbo_enabled` | VALID | `gov-valid-campaign-cbo_enabled` |
| `campaign.buying_type` | INVALID | `gov-invalid-campaign-buying_type` |
| `campaign.special_ad_categories` | INVALID | `gov-invalid-campaign-special_ad_categories` |
| `campaign.name` (naming rule) | INVALID | `gov-invalid-campaign-name` |
| `campaign.geo_targets` | UNKNOWN | `gov-unknown-campaign-geo_targets` |
| `ad_set.name` | VALID | `gov-valid-ad_set-name` |
| `ad_set.schedule.start_date` | VALID | `gov-valid-ad_set-schedule-start_date` |
| `ad_set.schedule.end_date` | VALID | `gov-valid-ad_set-schedule-end_date` |
| `ad_set.facebook_page` | VALID | `gov-valid-ad_set-facebook_page` |
| `ad_set.performance_goal` | INVALID | `gov-invalid-ad_set-performance_goal` |
| `ad_set.targeting.geo_locations.countries` | UNKNOWN | `gov-unknown-ad_set-targeting-geo_locations-countries` |
| `ad.name` | VALID | `gov-valid-ad-name` |
| `ad.partnership_ad` | INVALID | `gov-invalid-ad-partnership_ad` |
| `ad.tracking.url_parameters` | INVALID | `gov-invalid-ad-tracking-url_parameters` |
| `ad.creative.page_id` | INVALID | `gov-invalid-ad-creative-page_id` |

**Summary:** 11 valid, 7 invalid, 2 unknown

---

## 6. Ad Set Panel -- Additional Fields (from snapshot/deeper scan)

| Field | Value |
|---|---|
| Conversion location | Message destinations |
| Performance goal | Maximize number of link clicks |
| Facebook Page | Fraance.fr |
| Location | France |
| Budget reference | EUR 350.00 (lifetime, from campaign level) |
| Start date | Apr 3, 2026 |
| End date | May 3, 2026 |
| Advertiser | Fraance.fr |

---

## 7. Ad Panel -- Additional Fields (from snapshot)

| Field | Value |
|---|---|
| Ad name | New Traffic Ad (via combobox) |
| Partnership ad | Off |
| Facebook Page | Fraance.fr |
| Instagram profile | Use Facebook Page |
| URL parameters | (empty) |
| Creative format | Create ad (dropdown, no media set) |

---

## 8. Overall Verdict

| Category | Result |
|---|---|
| Core selector extraction (7 fields) | **7/7 PASS** -- all fields found on their expected panels |
| Cross-panel isolation | **PASS** -- campaign fields only on Campaign panel, ad set fields only on Ad Set, ad fields only on Ad |
| Governance sidebar | **PASS** -- present, shadow DOM, 25 guidelines rendered |
| Body-class extraction markers | **PASS** -- 9 fields confirmed extracted |
| Rule validation state | **PASS** -- 20 rules tracked (11 valid, 7 invalid, 2 unknown) |
| Governance UI components | **PASS** -- 10 shadow DOM components injected |

**OVERALL: PASS** -- Field extraction is working correctly across all three panels.
