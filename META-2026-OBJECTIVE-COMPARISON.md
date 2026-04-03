# Meta Ads Manager 2026 — Objective Field Comparison

**Date:** April 3, 2026
**Method:** Autonomous objective switching via Chrome DevTools MCP
**Objectives tested:** Awareness, Traffic (inferred), Engagement, Leads, Sales

---

## Campaign Panel — Fields by Objective

| Field | Awareness | Traffic | Engagement | Leads | Sales |
|-------|-----------|---------|------------|-------|-------|
| Campaign name | input | input | input | input | input |
| Buying type | combobox (editable) | combobox | combobox | button (locked) | button (locked) |
| Objective radios | expanded | expanded | expanded | collapsed button | collapsed button |
| Budget strategy | radio (CBO/Ad set) | radio | radio | radio (Adv+ on) | radio (Adv+ on) |
| Budget mode | combobox (Daily/Lifetime) | combobox | combobox | combobox | combobox |
| Budget value | input | input | input | input | input |
| Bid strategy | button (Highest volume) | button | button | button | button |
| A/B test | switch (Off) | switch | switch | switch | switch |
| Special Ad Categories | combobox | combobox | combobox | combobox | combobox |
| Advantage+ campaign | - | - | - | Adv+ leads campaign (On) | Adv+ sales campaign (On) |
| Advantage+ catalog ads | - | - | - | - | switch (Off) |
| Audience segment reporting | - | - | - | - | section |

## Ad Set Panel — Fields by Objective

| Field | Awareness | Traffic | Engagement | Leads | Sales |
|-------|-----------|---------|------------|-------|-------|
| Ad set name | input | input | input | input | input |
| **Conversion location** | - | Website/App/Messenger | **On your ad** | Website | Website |
| **Engagement type** | - | - | **Video views** (combobox) | - | - |
| **Performance goal** | Maximize reach | Maximize clicks | **Maximize ThruPlay** | Maximize conversions | Maximize conversions |
| Delivery type | - | Standard | - | Standard | Standard |
| **Dataset/Pixel** | - | - | - | - | **REQUIRED** |
| **Instant forms** | - | - | - | **SUGGESTED** | - |
| **Dynamic creative** | - | - | switch | switch | - |
| **Frequency control** | - | - | **checkbox** | - | - |
| **Value rules** | - | - | **"Create a rule set"** | - | - |
| Cost per result goal | - | - | **Bid textbox** | - | - |
| Facebook Page | combobox | combobox | - | combobox | combobox |
| Schedule (start/end) | date inputs | date inputs | date inputs | date inputs | date inputs |
| Audience controls | section | section | - | section | section |
| Advantage+ audience | - | - | section | - | - |
| Audience (suggest) | - | - | - | section | section |
| Targeting input | - | - | "Add demographics..." | - | - |
| Beneficiary/payer | switch | switch | switch | switch | switch |
| Placements | section | section | section | section | section |

## Unique Fields Per Objective

### Awareness
- Performance goal: "Maximize reach of ads" / "Maximize impressions" / "Maximize ad recall lift" / ThruPlay / 2-sec video
- Simplest campaign type — fewest ad set fields

### Traffic
- Conversion location: Website / App / Messenger / Instagram / WhatsApp / Phone call
- Performance goal: Maximize link clicks / landing page views

### Engagement (most unique fields)
- Engagement type combobox: "Video views" (unique)
- Conversion location: "On your ad" (unique option)
- Performance goal: "Maximize ThruPlay views"
- Frequency control checkbox (unique)
- Value rules section (unique)
- Cost per result goal / Bid textbox
- Targeting: "Add demographics, interests or behaviors" input

### Leads
- Advantage+ leads campaign toggle
- Instant forms suggestion
- Dynamic creative switch
- Conversion location limited to Website

### Sales
- Advantage+ sales campaign toggle
- Advantage+ catalog ads switch (unique)
- Audience segment reporting section (unique)
- Dataset/Pixel REQUIRED
- Conversion location: Website

## Summary

| Objective | Campaign-unique fields | Ad Set-unique fields | Total unique |
|-----------|----------------------|---------------------|-------------|
| Awareness | 0 | 0 | 0 (baseline) |
| Traffic | 0 | 1 (conversion radios) | 1 |
| Engagement | 0 | 5 (engagement type, frequency, value rules, bid, targeting) | 5 |
| Leads | 1 (Adv+ leads) | 2 (instant forms, dynamic creative) | 3 |
| Sales | 2 (Adv+ sales, catalog) | 1 (dataset required) | 3 |

**Total unique fields across all objectives: ~60+**
**Fields that need getters: ~15 new ones from this scan**
