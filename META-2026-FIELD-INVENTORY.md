# Meta Ads Manager 2026 — Complete Field Inventory

**Last scan:** April 3, 2026
**Campaign type scanned:** Traffic (Manual)
**Account:** act_123085282410066

## Campaign Panel

| # | Field Path | Element | Selector | Value Found | Getter Status |
|---|-----------|---------|----------|-------------|---------------|
| 1 | campaign.name | input text | `input[placeholder*="campaign name" i]` | "New Traffic Campaign" | WORKING |
| 2 | campaign.objective | radio in [role="row"] | `[role="row"]:has(input[type="radio"]:checked)` heading | "Traffic" | WORKING |
| 3 | campaign.budget_value | input number | `input[placeholder*="enter amount" i]` | "350.00" | WORKING |
| 4 | campaign.buying_type | combobox | near "Buying type" heading | "Auction" | HAS GETTER |
| 5 | campaign.budget_type | combobox | near "Budget" heading | "Lifetime budget" | HAS GETTER |
| 6 | campaign.cbo_enabled | switch | near "Campaign budget" | aria-checked | HAS GETTER |
| 7 | campaign.a_b_test | switch | aria-label="Off" near "A/B test" | false | HAS GETTER |
| 8 | campaign.special_ad_categories | combobox | "Declare category if applicable" | (empty) | HAS GETTER |
| 9 | campaign.bid_strategy | text | near "Campaign bid strategy" | "Highest volume" | NEEDS GETTER |
| 10 | campaign.status | switch | aria-label="On/off" (top bar) | true | NEEDS GETTER |
| 11 | campaign.ad_scheduling | text | near "Ad scheduling" | "Run ads all the time" | NEEDS GETTER |

## Ad Set Panel

| # | Field Path | Element | Selector | Value Found | Getter Status |
|---|-----------|---------|----------|-------------|---------------|
| 12 | ad_set.name | input text | `input[placeholder*="ad set name" i]` | "New Traffic Ad Set" | HAS GETTER |
| 13 | ad_set.conversion_location | radio group | `input[type="radio"][name="js_ze"]` | "MESSENGER" (checked) | NEEDS GETTER |
| 14 | ad_set.message_destination | radio group | radios: automatic/manual | "manual destination" | NEEDS GETTER |
| 15 | ad_set.messaging_platforms | checkboxes | Messenger/Instagram/WhatsApp | Messenger=true | NEEDS GETTER |
| 16 | ad_set.performance_goal | combobox | "Maximize number of link clicks" | set | HAS GETTER |
| 17 | ad_set.bid_amount | input text | `input[placeholder="X.XXX"]` | (empty) | HAS GETTER |
| 18 | ad_set.schedule.start_date | input text | 1st `input[placeholder="mm/dd/yyyy"]` | "Apr 3, 2026" | HAS GETTER |
| 19 | ad_set.schedule.end_date | input text | 2nd `input[placeholder="mm/dd/yyyy"]` | "May 3, 2026" | HAS GETTER |
| 20 | ad_set.schedule.start_time | spinbuttons | hours/minutes/meridiem | set | NEEDS GETTER |
| 21 | ad_set.facebook_page | combobox/input | near "Facebook Page" | "Fraance.fr" | NEEDS GETTER |
| 22 | ad_set.targeting.audience_type | section | "Advantage+ audience" | (present) | NEEDS GETTER |
| 23 | ad_set.placements | section | "Advantage+ placements" / manual | "Advantage+" | HAS GETTER |
| 24 | ad_set.beneficiary_payer | switch | "The advertiser and payer are different" | false | HAS GETTER |
| 25 | ad_set.excluded_placements | text | "None" near "Excluded placements" | "None" | NEEDS GETTER |

## Ad Panel

| # | Field Path | Element | Selector | Value Found | Getter Status |
|---|-----------|---------|----------|-------------|---------------|
| 26 | ad.name | input text | `input[placeholder*="ad name" i]` | "New Traffic Ad" | HAS GETTER |
| 27 | ad.partnership_ad | switch | near "Partnership ad" | false | HAS GETTER |
| 28 | ad.creative.page_id | combobox | in Identity section | "Fraance.fr" | HAS GETTER |
| 29 | ad.creative.instagram_account | combobox | "Use Facebook Page" | set | HAS GETTER |
| 30 | ad.creative.format | combobox | "Create ad" in Ad setup | set | NEEDS GETTER |
| 31 | ad.tracking.url_parameters | input text | `input[placeholder*="key1=value1" i]` | (empty) | HAS GETTER |
| 32 | ad.tracking.app_events | checkbox | "App events" | unchecked | NEEDS GETTER |
| 33 | ad.creative.chat_greeting | text | near "Greeting" | "Hi Leon!" | NEEDS GETTER |

## Fields That Appear Only With Different Campaign Types / Data

| # | Field Path | Appears When | Notes |
|---|-----------|-------------|-------|
| 34 | ad.creative.headline | Media uploaded | Text input for ad headline |
| 35 | ad.creative.primary_text | Media uploaded | Main ad body text |
| 36 | ad.creative.description | Media uploaded | Link description |
| 37 | ad.creative.cta_type | Media uploaded | CTA dropdown (Learn More, Shop Now, etc.) |
| 38 | ad.creative.destination_url | Traffic/Sales objective | Website URL input |
| 39 | ad_set.pixel_id | Sales/Leads objective | Pixel selection dropdown |
| 40 | ad_set.lead_form | Leads objective | Lead form selector |
| 41 | ad_set.catalog | Sales objective (catalog) | Product catalog selector |
| 42 | ad_set.product_set | Sales objective (catalog) | Product set selector |
| 43 | ad_set.dynamic_creative | When enabled | Dynamic creative toggle |
| 44 | ad.creative.carousel_cards | Carousel format | Array of cards |
| 45 | ad_set.optimization_goal | Varies by objective | Optimization dropdown |
| 46 | ad_set.attribution_setting | Advanced | Attribution window selector |
| 47 | campaign.spending_limit | Optional | Campaign spending limit input |

## Summary

- **Total fields discovered:** 47
- **With working getters:** ~15
- **With getters (needs verification):** ~10
- **Missing getters:** ~12
- **Require different campaign type/data:** ~14

## Next Steps

1. Verify all existing getters extract correctly
2. Add getters for missing fields (#9-11, #13-15, #20-22, #25, #30, #32-33)
3. Create campaigns with Sales/Leads objectives to discover fields #34-47
4. Upload media to discover creative fields #34-37
5. Add rules for every extractable field

## Dynamic Dropdown Options (expanded combobox radio lists)

These options only appear when a combobox is clicked/expanded. We extract the SELECTED value from the combobox text, not the expanded options.

### Performance Goal (varies by objective)
| Objective | Available Goals |
|-----------|----------------|
| Awareness | Maximize reach of ads, Maximize impressions, Maximize ad recall lift, Maximize ThruPlay views, Maximize 2-sec video plays |
| Traffic | Maximize link clicks, Maximize landing page views |
| Engagement | Maximize post engagement, Maximize video views |
| Leads | Maximize leads, Maximize conversion leads |
| Sales | Maximize conversions, Maximize value |

### Conversion Location (varies by objective)
| Objective | Available Locations |
|-----------|-------------------|
| Traffic | Website, App, Messenger, Instagram, WhatsApp, Phone call |
| Leads | Instant forms, Website, Messenger, Instagram |
| Sales | Website, App, Website+App |

### Bid Strategy
- Highest volume (default)
- Cost per result goal
- Bid cap
- ROAS goal (Sales only)

**Extraction approach:** Read combobox `.textContent` — no need to expand the dropdown.
