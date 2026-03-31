# Meta Ads Manager 2026 — Live DOM Selector Map

**Date:** February 8, 2026
**Source:** Live scan of `adsmanager.facebook.com` via Chrome MCP tools
**Account:** act_123085282410066 (campaign edit mode)
**Purpose:** Replace broken selectors in `meta-selectors.ts` and `meta-fields.ts`

---

## Executive Summary

**The current selector strategy is fundamentally broken.** Our scan of Meta's live 2026 Ads Manager reveals:

- **Zero `data-testid` on form fields** — only 3 on the entire page (all navigation headers: `nav-header-ADGROUP`, `nav-header-CAMPAIGN`, `nav-header-CAMPAIGN_GROUP`)
- **Zero `aria-label` on text inputs** — campaign name, ad set name, ad name, budget, dates all lack aria-label
- **No `role="radiogroup"`** — objectives use `role="row"` with `role="gridcell"` children
- **No native `<select>` elements** — all dropdowns are `<div role="combobox">`

The primary selector attributes that DO work in 2026:

| Attribute | Reliability | Coverage |
|:--|:--|:--|
| `placeholder` | HIGH | All text inputs (names, budget, dates, URLs) |
| `role="combobox"` | HIGH | All dropdowns (budget type, buying type, CTA, pages) |
| `role="switch"` | HIGH | All toggles (CBO, A/B test, partnership ad) |
| `input[type="radio"]` + sibling text | MEDIUM | Objectives, conversion location, placements mode |
| Section heading text proximity | MEDIUM | Targeting fields (age, gender, languages) |
| `aria-label` | LOW | Only on switches ("On/off", "Off") and some comboboxes ("Instagram account") |

---

## Field-by-Field Selector Map

### Campaign Level

#### 1. `campaign.name`

| Aspect | Current (broken) | Live 2026 DOM |
|:--|:--|:--|
| Primary selector | `input[aria-label*="Campaign name"]` | `input[placeholder="Enter your campaign name here..."]` |
| data-testid | `[data-testid*="campaign-name"]` | **NONE** |
| aria-label | Expected present | **NULL** |
| Element type | `<input>` | `<input type="text" role="combobox">` |
| Additional | — | Has `role="combobox"`, obfuscated CSS classes |

**Recommended selector chain:**
1. `input[placeholder="Enter your campaign name here..."]`
2. `input[role="combobox"]` (within Campaign name section)
3. Heuristic: input near heading "Campaign name"

---

#### 2. `campaign.objective`

| Aspect | Current (broken) | Live 2026 DOM |
|:--|:--|:--|
| Primary selector | `[data-testid*="objective"]` | **NONE** — no data-testid |
| Secondary | `[role="radiogroup"]` | **WRONG** — no radiogroup exists |
| Element structure | Expected radio cards | `[role="row"]` containing `[role="gridcell"]` + `input[type="radio"]` |
| Values available | aria-selected, aria-checked | `input.checked` on radio, sibling heading text for label |

**Live DOM structure per objective:**
```
[role="row"]
  [role="gridcell"]
    input[type="radio"] (checked=true/false, NO aria-label, NO name)
  [role="heading" aria-level="4"]
    "Traffic" | "Awareness" | "Engagement" | "Leads" | "App promotion" | "Sales"
```

**Recommended selector chain:**
1. `[role="row"]:has(input[type="radio"]:checked) [role="heading"]` — get checked objective text
2. Walk all `[role="row"]` children within "Campaign objective" section
3. Heuristic: find `input[type="radio"]` near heading "Campaign objective"

---

#### 3. `campaign.budget_type`

| Aspect | Current (broken) | Live 2026 DOM |
|:--|:--|:--|
| Primary selector | `[aria-label*="Budget type"]` | **NONE** — no aria-label |
| data-testid | `[data-testid*="budget-type"]` | **NONE** |
| Element type | Expected `<select>` | `<div role="combobox">` |
| Current value | — | Text content: "Lifetime budget" or "Daily budget" |

**Recommended selector chain:**
1. `[role="combobox"]` within Budget section (find heading "Budget", then nearest combobox)
2. Text content check for "Lifetime budget" or "Daily budget"

---

#### 4. `campaign.budget_value`

| Aspect | Current (broken) | Live 2026 DOM |
|:--|:--|:--|
| Primary selector | `input[aria-label*="Budget"][type="text"]` | **NONE** — no aria-label |
| data-testid | `[data-testid*="budget-value"]` | **NONE** |
| Element type | input[type="text"] | `<input type="text" placeholder="Please enter amount">` |
| Value format | Needs currency stripping | Plain number: "5.00" |

**Recommended selector chain:**
1. `input[placeholder="Please enter amount"]`
2. Heuristic: `input[type="text"]` near heading "Budget" (not the combobox)

---

#### 5. `campaign.cbo_enabled`

| Aspect | Current (broken) | Live 2026 DOM |
|:--|:--|:--|
| Primary selector | Compound aria-label "Advantage" + "campaign budget" | **NOT VISIBLE** on this campaign |
| Notes | CBO toggle only appears on campaigns with multiple ad sets or when Advantage+ is offered |

**Recommended selector chain:**
1. `[role="switch"]` near heading containing "Advantage campaign budget"
2. `[role="switch"]` near heading containing "Campaign budget optimization"
3. Check `aria-checked` attribute for state

---

#### 6. `campaign.buying_type` (NEW)

| Aspect | Live 2026 DOM |
|:--|:--|
| Section | "Campaign details" |
| Element | `<div role="combobox">` with text "Auction" |
| aria-label | **NULL** |

**Recommended selector:**
1. `[role="combobox"]` within "Campaign details" section (first combobox after heading)

---

#### 7. `campaign.special_ad_categories` (NEW)

| Aspect | Live 2026 DOM |
|:--|:--|
| Section | "Special Ad Categories" |
| Element | `<div role="combobox" id="js_ee" aria-expanded="false" aria-haspopup="listbox">` |
| Placeholder text | "Declare category if applicable" |

**Recommended selector:**
1. `[role="combobox"][aria-haspopup="listbox"]` near heading "Special Ad Categories"
2. Combobox containing "Declare category" text

---

#### 8. `campaign.a_b_test` (NEW)

| Aspect | Live 2026 DOM |
|:--|:--|
| Section | "A/B test" |
| Element | `<input type="checkbox" role="switch" aria-label="Off">` |
| State | `aria-checked="false"` |

**Recommended selector:**
1. `[role="switch"]` within section headed "A/B test"

---

#### 9. Campaign Status

| Aspect | Live 2026 DOM |
|:--|:--|
| Location | Top bar, right side |
| Element | `<div role="switch" aria-label="On/off" aria-checked="true">` |
| Status text | "In draft" displayed as sibling text |

**Recommended selector:**
1. `[role="switch"][aria-label="On/off"]` (top bar)
2. Status text from sibling/parent elements

---

### Ad Set Level

#### 10. `ad_set.name`

| Aspect | Current (broken) | Live 2026 DOM |
|:--|:--|:--|
| Primary selector | `input[aria-label*="Ad set name"]` | **NONE** — no aria-label |
| Element | — | `<input type="text" role="combobox" placeholder="Enter your ad set name here...">` |

**Recommended selector:**
1. `input[placeholder="Enter your ad set name here..."]`

---

#### 11. `ad_set.conversion_location` (NEW — maps to conversion radios)

| Aspect | Live 2026 DOM |
|:--|:--|
| Section | "Conversion" → "Conversion location" |
| Elements | Radio inputs within `<label>` elements |
| Radio values (accessible names) | `"WEBSITE"`, `"MOBILE_APP"`, `"MESSENGER"`, `"IG_PROFILE_AND_FB_PAGE"`, `"PHONE_CALL"` |

**Recommended selector:**
1. `label:has(input[type="radio"]:checked)` within Conversion section — read radio accessible name
2. Individual: `input[type="radio"]` with parent label, value from label text or accessible name

---

#### 12. `ad_set.performance_goal` (NEW)

| Aspect | Live 2026 DOM |
|:--|:--|
| Section | Below Conversion |
| Element | `<div role="combobox">` with text "Maximize engagement with a post" |

**Recommended selector:**
1. `[role="combobox"]` in performance goal section

---

#### 13. `ad_set.bid_amount` (NEW)

| Aspect | Live 2026 DOM |
|:--|:--|
| Element | `<input type="text" placeholder="X.XXX">` |
| Location | Below performance goal |

**Recommended selector:**
1. `input[placeholder="X.XXX"]`

---

#### 14. `ad_set.delivery_type` (NEW)

| Aspect | Live 2026 DOM |
|:--|:--|
| Element | `<div role="combobox">` with text "Standard" |
| Location | Below bid amount |

**Recommended selector:**
1. `[role="combobox"]` with text "Standard" or "Accelerated"

---

#### 15. `ad_set.schedule.start_date`

| Aspect | Current (broken) | Live 2026 DOM |
|:--|:--|:--|
| Primary selector | `input[aria-label*="Start date"]` | **NONE** — no aria-label |
| Element | — | `<input type="text" placeholder="mm/dd/yyyy">` with value "Feb 8, 2026" |
| Location | Under "Schedule" → "Start date" heading |

**Recommended selector:**
1. `input[placeholder="mm/dd/yyyy"]` within "Start date" section (first occurrence)
2. Heuristic: input near heading "Start date"

---

#### 16. `ad_set.schedule.end_date`

| Aspect | Current (broken) | Live 2026 DOM |
|:--|:--|:--|
| Primary selector | `input[aria-label*="End date"]` | **NONE** — no aria-label |
| Element | — | `<input type="text" placeholder="mm/dd/yyyy">` with value "Feb 9, 2026" |
| Location | Under "Schedule" → "End date" heading |

**Recommended selector:**
1. Second `input[placeholder="mm/dd/yyyy"]` (after start date)
2. Heuristic: input near heading "End date"

---

#### 17. `ad_set.targeting.geo_locations`

| Aspect | Current | Live 2026 DOM |
|:--|:--|:--|
| Structure | Expected input with aria-label | **Summary text only** ("None added" or location list) with "Edit" button |
| Interactive state | Collapsed by default; must click "Edit" to see inputs |

**Recommended extraction:**
1. Find heading "Locations" → read sibling value text
2. After "Edit" click: search input with location-related placeholder
3. React Fiber fallback for geo data

---

#### 18. `ad_set.targeting.age_range`

| Aspect | Current | Live 2026 DOM |
|:--|:--|:--|
| Structure | Expected dropdown/input | **Summary text** "18 - 65+" with "Edit" button |
| Format | Two numbers separated by " - " |

**Recommended extraction:**
1. Find heading "Age" → read sibling/child text, parse "min - max+" format
2. After "Edit" click: two number inputs for min/max age

---

#### 19. `ad_set.targeting.genders`

| Aspect | Current | Live 2026 DOM |
|:--|:--|:--|
| Structure | Expected checkboxes/radio | **Summary text** "All genders" with "Edit" button |

**Recommended extraction:**
1. Find heading "Gender" → read sibling text ("All genders", "Men", "Women")

---

#### 20. `ad_set.targeting.languages`

| Aspect | Current | Live 2026 DOM |
|:--|:--|:--|
| Structure | Expected chip list | **Summary text** "All languages" with "Edit" button |

**Recommended extraction:**
1. Find heading "Languages" → read sibling text

---

#### 21. `ad_set.targeting.custom_audiences`

| Aspect | Current | Live 2026 DOM |
|:--|:--|:--|
| Element | `input[role="combobox" placeholder="Search existing audiences"]` |
| Location | Under Audience section |

**Recommended selector:**
1. `input[placeholder="Search existing audiences"]`

---

#### 22. `ad_set.placements`

| Aspect | Current | Live 2026 DOM |
|:--|:--|:--|
| Structure | Summary view + expandable checkbox list |
| Mode radios | Two radios under "Placements" heading (manual vs advantage+) |
| Platform checkboxes | `input[type="checkbox"]` with sibling labels: Facebook, Instagram, Audience Network, Messenger, Threads |
| Placement checkboxes | Individual placements: Facebook Feed, Instagram feed, Instagram Stories, etc. |

**Recommended extraction:**
1. Check which radio is selected (manual vs advantage+)
2. Read all `input[type="checkbox"]` states within Placements section
3. Platform-level: Facebook, Instagram, Audience Network, Messenger, Threads
4. Placement-level: individual feed/stories/reels checkboxes

---

#### 23. `ad_set.beneficiary_payer` (NEW — EU DSA compliance)

| Aspect | Live 2026 DOM |
|:--|:--|
| Section | "Beneficiary and payer" |
| Selector | `<div role="combobox">` with text "Select a person or organization" |
| Toggle | `[role="switch" aria-label="The beneficiary and payer are different"]` |

**Recommended selector:**
1. `[role="combobox"]` near heading "Beneficiary and payer"
2. `[role="switch"]` with aria-label containing "beneficiary"

---

### Ad Level

#### 24. `ad.name`

| Aspect | Current (broken) | Live 2026 DOM |
|:--|:--|:--|
| Primary selector | `input[aria-label*="Ad name"]` | **NONE** — no aria-label |
| Element | — | `<input type="text" role="combobox" placeholder="Enter your ad name here...">` |

**Recommended selector:**
1. `input[placeholder="Enter your ad name here..."]`

---

#### 25. `ad.partnership_ad` (NEW)

| Aspect | Live 2026 DOM |
|:--|:--|
| Section | "Partnership ad" |
| Element | `<input type="checkbox" role="switch" aria-label="Off">` |
| State | `aria-checked="false"` |

**Recommended selector:**
1. `[role="switch"]` within "Partnership ad" section

---

#### 26. `ad.creative.page_id`

| Aspect | Current | Live 2026 DOM |
|:--|:--|:--|
| Primary selector | Expected aria-label | `<div role="combobox">` — **NO aria-label, NO accessible name** |
| Section | "Identity" |
| Current value | — | Inner text shows page name (e.g., "Fraance.fr") |

**Recommended selector:**
1. First `[role="combobox"]` within "Identity" section (no label — position-based)
2. `[role="combobox"]` that is NOT the Instagram account combobox

---

#### 27. `ad.creative.instagram_account` (NEW)

| Aspect | Live 2026 DOM |
|:--|:--|
| Element | `<div role="combobox" aria-label="Instagram account">` |
| This is rare! | **One of the few fields with a real aria-label** |

**Recommended selector:**
1. `[role="combobox"][aria-label="Instagram account"]` — reliable!

---

#### 28. `ad.creative.destination_url`

| Aspect | Current (broken) | Live 2026 DOM |
|:--|:--|:--|
| Primary selector | `input[aria-label*="Website URL"]` | **NONE** — no aria-label |
| Element | — | `<input type="text" placeholder="Enter the URL you want to promote">` |
| Section heading | — | "Website URL (required)" |

**Recommended selector:**
1. `input[placeholder="Enter the URL you want to promote"]`
2. Heuristic: input near heading "Website URL"

---

#### 29. `ad.creative.cta_type`

| Aspect | Current | Live 2026 DOM |
|:--|:--|:--|
| Structure | Expected aria-label | `<div role="combobox">` with accessible name "Select an item" |
| Current value | — | Inner text shows current CTA: "VIEW_INSTAGRAM_PROFILE" |
| Section | Under "Call to action" or "Browser add-ons" |

**Recommended selector:**
1. `[role="combobox"]` near heading "Call to action"
2. `[role="combobox"]` containing CTA enum values

---

#### 30. `ad.tracking.url_parameters` (NEW)

| Aspect | Live 2026 DOM |
|:--|:--|
| Section | "Tracking" → "URL parameters" |
| Element | `<input type="text" placeholder="key1=value1&key2=value2">` |

**Recommended selector:**
1. `input[placeholder*="key1=value1"]`

---

#### 31. `ad.tracking.website_events` (NEW)

| Aspect | Live 2026 DOM |
|:--|:--|
| Section | "Tracking" → "Website events" |
| Element | Checkbox for "App events" |

---

## Publish / Action Buttons

| Button | Live 2026 DOM |
|:--|:--|
| Publish | `<div role="button">` with text "Publish" — **NO data-testid** |
| Close | `<div role="button">` with text "Close" |
| Discard draft | `<div role="button">` with text "Discard draft" |

**Recommended selector for Publish intercept:**
1. `[role="button"]` containing text "Publish" (bottom bar)
2. Capture-phase click listener on ancestor

---

## Summary: Selector Strategy Migration

### What MUST change:

| Old Strategy | New Strategy | Fields Affected |
|:--|:--|:--|
| `aria-label` on inputs | `placeholder` attribute | All name fields, budget value, dates, URLs |
| `data-testid` | **Remove entirely** — none exist on form fields | All fields |
| `role="radiogroup"` | `[role="row"]:has(input[type="radio"])` | Objectives |
| `<select>` targeting | `[role="combobox"]` div elements | Budget type, buying type, CTA, pages |
| Direct value extraction | Summary text parsing + "Edit" expand | Targeting fields (age, gender, geo, languages) |

### New extraction priorities:

1. **`placeholder`-based** — most reliable for text inputs (7 fields)
2. **`role="combobox"` + section proximity** — for dropdowns (8 fields)
3. **`role="switch"` + section proximity** — for toggles (5 fields)
4. **Radio state + sibling heading text** — for radio selections (2 fields)
5. **Section heading proximity + value text parsing** — for collapsed targeting (4 fields)
6. **`aria-label`** — only for `Instagram account` combobox and switches
7. **React Fiber** — deep fallback for all fields

### Localization concern:

Placeholder text is locale-dependent. The current scan was done on a **German-locale** account ("Instagram-Beitrag" prefix on names). The placeholder strings appear to be in English regardless of locale, but this needs verification across French, Spanish, etc.

---

## Field Path Alignment

The extraction pipeline uses `toNestedObject()` to convert flat keys (e.g., `campaign.name`) into nested objects for `getNestedValue()` traversal. The paths in FIELD_GETTERS must exactly match the paths used in rule conditions.

### Currently mismatched paths:

| Rule Condition Path | FIELD_GETTERS Path | Issue |
|:--|:--|:--|
| `ad_set.daily_budget` | Not in FIELD_GETTERS | Missing getter |
| `ad_set.lifetime_budget` | Not in FIELD_GETTERS | Missing getter |
| `campaign.spending_limit` | Not in FIELD_GETTERS | Missing getter |
| `campaign.special_ad_categories` | Not in FIELD_GETTERS | Missing getter |
| `ad.creative.tracking_url` | Not in FIELD_GETTERS | Missing getter |
| `ad_set.frequency_cap` | Not in FIELD_GETTERS | Missing getter |
| `ad_set.pixel_id` | Not in FIELD_GETTERS | Missing getter |
| `ad_set.optimization_goal` | Not in FIELD_GETTERS | Missing getter |

### New getters needed:

Each new field from this scan needs a corresponding entry in both `META_FIELD_SELECTORS` and `FIELD_GETTERS`. The 88-field REQUIRE_FIELD_MAP is dead code (Facebook's internal modules no longer exposed) and should be removed or disabled.
