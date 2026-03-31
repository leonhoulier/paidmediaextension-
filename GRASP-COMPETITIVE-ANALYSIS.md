# Grasp Competitive Analysis — Meta Ads Field Mapping & Architecture

**Date:** February 8, 2026
**Source:** Grasp Chrome Extension v26.203.2 + app.grasp.gg/available-guidelines/facebook
**Purpose:** Inform DLG extension selector strategy and rule catalog

---

## 1. Key Architectural Insight: Grasp Does NOT Use DOM Selectors for Meta

Grasp's approach on Meta is **fundamentally different** from DLG's current DOM selector strategy:

| Aspect | Grasp (v26) | DLG (current) |
|:--|:--|:--|
| Field extraction | Facebook internal `require()` modules + React Context selectors | CSS selectors (aria-label, data-testid) + React Fiber |
| `querySelector` calls in Meta script | **3** (only for buttons) | **124** selector strategies across 18 fields |
| Data source | In-memory state (Redux-like selectors) | DOM elements |
| Stability | High (internal APIs change less often) | Low (DOM/CSS changes frequently) |
| Risk | Facebook could block `require()` | Facebook could change any CSS class |

### How Grasp Reads Meta Ads Data

Grasp injects `eval.js` into MAIN world which exposes:

- `window.FindReact(element, levels)` — gets React component state
- `window.FindContexts(element)` — extracts React Context values
- `window.FindFacebookContextSelector(contexts, selectorName)` — calls FB's own Redux selectors
- `window.FindPath(element, keys)` — deep property traversal via React Fiber

Their Facebook data extraction uses FB's internal selectors:
```
callSelector(contexts, "selectedCampaignGroupsSelector")  → campaign data
callSelector(contexts, "campaignsForSelectedCampaignGroupsSelector")  → adset data
callSelector(contexts, "selectedCampaignGroupIDsSelector")  → selected IDs
callSelector(contexts, "adgroupsForSelectedCampaignGroupsSelector")  → ad data
```

And Facebook's internal module system:
```
require("AdsAPICampaignGroupRecordUtils").getObjective(...)
require("AdsCampaignStructureSelectors").getFlatTreeItemsSelector()
require("AdsGraphAPI").get("AdsDraftFragmentDataManager")
require("AdsDraftFragmentDataManager")
require("AdsPECrepePackages")
require("adsPECurrentDraftIDSelector")
require("adsCFMaybeCampaignGroupRecordSelector")
```

They also call `FacebookClearExtensionDetection()` which disables Meta's browser extension detection.

### UI Framework

- **Vue 3 + Quasar** (not Shadow DOM)
- Uses Vue `Teleport` to inject components at specific DOM locations
- CSS injected globally (no Shadow DOM isolation)

---

## 2. Grasp's Meta Guidelines Catalog (88 Rules)

### Media Plan (5 rules)

| Rule | Description | Level |
|:--|:--|:--|
| Link to Media Plan | Requires linking campaign to a Media Plan | Campaign |
| Link to entity from Media Plan | Requires linking entity to a Media Plan | Adset |
| Link to entity from Media Plan | Requires linking entity to a Media Plan | Ad |
| Enforce budget | Budget must match the selected campaign in media plan | — |
| Enforce dates | Dates must be in range per media plan campaign | Adset |

### Budget (12 rules)

| Rule | Description | Level |
|:--|:--|:--|
| Enforce lifetime/total budget | Requires setting a lifetime budget | — |
| Enforce daily budget | Requires setting a daily budget | — |
| Cap budget | Warning if budget exceeds threshold | — |
| Cap daily budget | Warning if daily budget exceeds threshold | — |
| Campaign spending limit | Requires setting a campaign spending limit | Campaign |
| Adset budget = Campaign spending limit | Total adset budgets must equal campaign spend limit | Adset |
| Confirm adset budget | Re-enter adset budget to confirm | Adset |
| Confirm campaign spending limit | Re-enter campaign spending limit to confirm | Campaign |
| Confirm campaign budget | Re-enter campaign budget to confirm | Campaign |
| Enforce campaign budget (CBO) | Requires setting a campaign budget (CBO) | — |
| Delivery type | Requires setting a specific Delivery Type | — |

### Naming (7 rules)

| Rule | Description | Level |
|:--|:--|:--|
| Naming | Name must follow pre-defined template | Campaign |
| Naming | Name must follow pre-defined template | Adset |
| Naming | Name must follow pre-defined template | Ad |
| Naming | Name must follow pre-defined template | Audience |
| Naming | Name must follow pre-defined template | InstantForm |
| Change Adset name | Must change default adset name | Adset |
| Change Ad name | Must change default ad name | Ad |

### Date (8 rules)

| Rule | Description | Level |
|:--|:--|:--|
| Enforce end date | Requires adding an end date | Adset |
| Start time | Requires setting a specific start time | Adset |
| End time | Requires setting a specific end time | Adset |
| Change default start date | Must change default start date | Adset |
| Change default start time | Must change default start time | Adset |
| Change default end date | Must change default end date | Adset |
| Change default end time | Must change default end time | Adset |
| Confirm dates | Re-write each date to confirm | Adset |

### Campaign (5 rules)

| Rule | Description | Level |
|:--|:--|:--|
| Campaign objective | Requires selecting the right objective | Campaign |
| Label template | Label must follow pre-defined template | Campaign |
| Special Ad Categories | Requires specific Special Ad Categories value | Campaign |
| Second approver | Forbids publishing until another team member approves | Campaign |
| Status | Requires setting a status | Campaign |

### Adset — Targeting & Settings (24 rules)

| Rule | Description | Level |
|:--|:--|:--|
| Performance Goal | Requires specific Performance Goal value | Adset |
| Billing Event | Requires selecting right billing event | Adset |
| Pixel Conversion Event | Requires specific Pixel Conversion Event | Adset |
| Same conversion event in all adsets | All adsets must have same conversion events | Adset |
| Bid value | Requires setting a max/target bid value | Adset |
| Frequency cap | Requires setting a frequency cap | Adset |
| GEO targeting | Must target pre-defined locations | Adset |
| GEO targeting exclusion | Must exclude pre-defined locations | Adset |
| Custom audience inclusion | Must target pre-defined custom audiences | Adset |
| Custom audience exclusion | Must exclude pre-defined custom audiences | Adset |
| Prevent Advantage+ audience | Must use original audience options | Adset |
| Must set a targeting | Prevents empty/default targeting | Adset |
| Prevent targeting expansion | Must disable targeting expansion | Adset |
| Use a saved audience | Must use a saved audience | Adset |
| Manual placements | Must select Manual placements | Adset |
| Automatic placements | Must select Automatic placements | Adset |
| Placements | Must target pre-defined placements | Adset |
| Number of placements | Min/max number of placements | Adset |
| Inventory Filter | Must select right inventory filter | Adset |
| Language | Must select specific languages | Adset |
| Gender | Must select specific genders | Adset |
| Age | Must select right age range | Adset |
| Must select an OS version | Must target OS version | Adset |
| Number of adsets | Min/max number of adsets | Adset |
| Status | Requires setting a status | Adset |
| Force duration | Min/max duration | Adset |
| Beneficiary | Must set right beneficiary | Adset |
| Payer | Must set right payer | Adset |
| Day scheduling | Must set day scheduling | Adset |
| Product set | Must select right product set | Adset |
| Limited spend to excluded placements | Prevent turning on this option | Adset |

### Ad (17 rules)

| Rule | Description | Level |
|:--|:--|:--|
| URL template | URL must follow pre-defined template | Ad |
| Tracking template | Tracking URL must follow template | Ad |
| Pixel | Must use a tracking pixel | Ad |
| Change default Page | Must change the default Facebook Page | Ad |
| Page | Must select a specific Facebook Page | Ad |
| Instagram account | Must select a specific Instagram account | Ad |
| Force partnership ad | Must set a partnership ad | Ad |
| Promo codes | Must toggle on/off promo codes | Ad |
| Click Preview URL | Must click the "Preview URL" button | Ad |
| Video duration | Min/max video duration | Ad |
| Video format | Must select specific video format (square/horizontal/vertical) | Ad |
| Flexible media | Must enable/disable flexible media | Ad |
| Post type | Must use existing post or create new | Ad |
| Call to action | Must select specific CTA | Ad |
| Number of Carousel cards | Specific number of cards in Carousel | Ad |
| View Tags template | View tags must follow template | Ad |
| Status | Must set a status | Ad |
| Turn off Advantage+ creative | Must turn off Advantage+ options | Ad |
| Track campaign name | Campaign name must be in tracking URL | Ad |
| Multi-advertiser ads | Must enable/disable multi-advertiser option | Ad |
| URL Validity | Verifies URL is valid | Ad |

---

## 3. Comparison: DLG vs Grasp Field Coverage

### Fields DLG Currently Extracts (18)

| DLG Field | Grasp Equivalent | Gap |
|:--|:--|:--|
| campaign.name | Naming (Campaign) | ✅ Covered |
| campaign.objective | Campaign objective | ✅ Covered |
| campaign.budget_type | Enforce daily/lifetime budget | ✅ Covered |
| campaign.budget_value | Cap budget, Confirm budget | ✅ Covered |
| campaign.cbo_enabled | Enforce campaign budget (CBO) | ✅ Covered |
| ad_set.name | Naming (Adset) | ✅ Covered |
| ad_set.targeting.geo_locations | GEO targeting | ✅ Covered |
| ad_set.targeting.age_range | Age | ✅ Covered |
| ad_set.targeting.genders | Gender | ✅ Covered |
| ad_set.targeting.languages | Language | ✅ Covered |
| ad_set.placements | Manual/Automatic/Placements | ✅ Covered |
| ad_set.schedule.start_date | Start time | ✅ Covered |
| ad_set.schedule.end_date | End time, Enforce end date | ✅ Covered |
| ad_set.targeting.custom_audiences | Custom audience inclusion/exclusion | ✅ Covered |
| ad.name | Naming (Ad) | ✅ Covered |
| ad.creative.destination_url | URL template | ✅ Covered |
| ad.creative.cta_type | Call to action | ✅ Covered |
| ad.creative.page_id | Page, Change default Page | ✅ Covered |

### Fields Grasp Has That DLG Does NOT (Priority Additions)

**High Priority (common governance rules):**

| Grasp Field | Why It Matters |
|:--|:--|
| Campaign spending limit | Budget governance — limit total spend |
| Special Ad Categories | Legal compliance (housing, credit, politics) |
| Pixel/Conversion Event | Attribution accuracy |
| Bid value (max/target bid) | Cost control |
| Frequency cap | User experience / brand safety |
| Tracking URL template | UTM/attribution consistency |
| Pixel (tracking) | Ensures conversion tracking is set |
| Instagram account | Brand identity |
| Facebook Page | Brand identity |
| Campaign/Adset/Ad Status | Prevents accidental "Active" launch |

**Medium Priority (sophisticated governance):**

| Grasp Field | Why It Matters |
|:--|:--|
| Performance Goal | Optimization alignment |
| Billing Event | Cost model governance |
| Inventory Filter | Brand safety |
| Advantage+ audience prevention | Audience control |
| Targeting expansion prevention | Audience control |
| Saved audience requirement | Audience reuse |
| Number of adsets | Campaign structure |
| Duration enforcement | Flight date governance |
| Day scheduling | Dayparting requirements |
| Beneficiary / Payer | EU compliance (DSA) |
| Product set | Catalog campaign governance |

**Lower Priority (nice-to-have):**

| Grasp Field | Why It Matters |
|:--|:--|
| Video duration/format | Creative specifications |
| Flexible media toggle | Creative control |
| Post type (existing vs new) | Content reuse |
| Carousel card count | Creative structure |
| View Tags template | Verification/viewability |
| Multi-advertiser ads | Brand placement |
| Promo codes | Offer management |
| URL Validity | QA check |
| Partnership ad | Influencer compliance |
| Label template | Additional naming |
| Naming for Audience/InstantForm | Extended naming |
| Media Plan linking | Campaign management integration |

---

## 4. Recommendations for DLG

### Short-term: Adopt require() Strategy for Meta

Grasp's approach of using Facebook's internal `require()` modules and Redux-like selectors is significantly more reliable than DOM selectors. Consider:

1. Update eval-bridge.ts to expose `FindReact`, `FindContexts`, `FindFacebookContextSelector` helpers (same as Grasp's eval.js)
2. Use `require("AdsCampaignStructureSelectors").getFlatTreeItemsSelector()` to read the campaign tree
3. Use React Context selectors for field values instead of CSS selectors
4. Keep CSS selectors only for **injection points** (where to place banners), not for **data extraction**
5. Add `FacebookClearExtensionDetection()` to prevent Meta from detecting the extension

### Medium-term: Expand Rule Types

Add the top 10 missing Grasp rules to DLG's rule engine:
1. Campaign spending limit
2. Special Ad Categories
3. Pixel/Conversion Event
4. Tracking URL template
5. Bid value
6. Frequency cap
7. Status enforcement
8. Instagram account
9. Facebook Page selection
10. Inventory Filter

### Long-term: Platform Coverage

Grasp supports 56 platforms across 8 categories (social, search, programmatic DSP, video/CTV, retail media, ad servers, content management, and others — see GRASP-ARCHITECTURE-SPEC.md Section 9 for the full list). DLG's v2 roadmap already includes TikTok and Snapchat.
