# Meta Grasp Coverage Diff

Reference snapshot for comparing our Meta extractor against the locally installed Grasp extension.

- Grasp source used: local Chrome extension `gnncjalmnfmdilagegplkkckngolohof`
- Grasp version observed: `26.0323.8`
- Extraction helper: [`packages/e2e/scripts/grasp-facebook-inventory.mjs`](/Users/leonhoulier/projects/media-buying-governance/packages/e2e/scripts/grasp-facebook-inventory.mjs)

Run this any time to refresh the raw inventory:

```bash
node packages/e2e/scripts/grasp-facebook-inventory.mjs
```

## Important Caveat

Grasp does **not** give us a clean, human-readable DOM selector registry from the shipped bundle.
What it does give us is still useful:

- Meta editor routes
- field and section names used internally by Grasp
- getter and mutation capability names
- enough semantic coverage to identify fields we should support

This is good for **coverage planning** and **naming alignment**, but not yet a drop-in selector map.

## Grasp Signals We Can Reuse

### Routes

- `/adsmanager/manage/:level(campaigns|adsets|ads)/edit`
- `/adsmanager/manage/:level(campaigns|adsets|ads)/edit/standalone`
- `/adsmanager/manage/creation_package`
- `/adsmanager/manage/:level(campaigns)`
- `/adsmanager/manage/:level(adsets)`
- `/adsmanager/manage/:level(ads)`

### Facebook field buckets visible in the bundle

#### Campaign buckets

- `Campaigns.Name`
- `Campaigns.Budget`
- `Campaigns.BudgetType`
- `Campaigns.Scheduling`
- `Campaigns.SpendCap`

#### Ad set buckets

- `Adsets.Name`
- `Adsets.Audience`
- `Adsets.Budget`
- `Adsets.BudgetInput`
- `Adsets.FrequencyControl`
- `Adsets.GeoLocations`
- `Adsets.OptimizationGoal`
- `Adsets.Page`
- `Adsets.PlacementSection`
- `Adsets.ProductSet`
- `Adsets.Scheduling`
- `Adsets.StartTime`
- `Adsets.EndTime`

#### Ad buckets

- `Ads.Name`
- `Ads.Url`
- `Ads.CarouselUrl`
- `Ads.Cta`
- `Ads.Page`
- `Ads.InstagramAccount`
- `Ads.Format`
- `Ads.PostType`
- `Ads.PromoCode`
- `Ads.Partnership`
- `Ads.AdvantageCreative`
- `Ads.MultiAdvertiserAds`

### Getter and mutation names visible in the bundle

Selected examples:

- `getCampaignName`
- `getCampaignObjective`
- `getCampaignBudget`
- `getCampaignBuyingType`
- `getCampaignSpendCap`
- `getCampaignStatus`
- `getCurrentAdsetBudget`
- `getCurrentAdsetDates`
- `getCurrentUrls`
- `getCurrentUrlTags`
- `getCurrentViewTags`
- `setCampaignName`
- `setCampaignObjective`
- `setCampaignBudget`
- `setCampaignBudgetMode`
- `setCampaignBuyingType`
- `setCampaignCBO`
- `setCampaignSpendCap`
- `setCampaignStatus`
- `setCampaignToggleDayParting`
- `setAdsetBudgetAmount`
- `setAdsetBudgetMode`
- `setAdsetFrequencyControl`
- `setAdsetLocales`
- `setAdsetName`
- `setAdsetPageId`
- `setAdsetPerformanceGoal`
- `setAdsetSavedAudience`
- `setAdsetSchedule`
- `setAdsetTargetingLocations`
- `setAdUrl`
- `setAdCreativeUrl`
- `setAdCarouselUrl`
- `setAdInstagramId`
- `setAdName`
- `setAdPageId`
- `setUrlParameters`
- `setViewTags`

## Our Current Meta Extractor Coverage

Current field paths come from [`packages/extension/src/adapters/meta/meta-fields.ts`](/Users/leonhoulier/projects/media-buying-governance/packages/extension/src/adapters/meta/meta-fields.ts).

| Our field path | Grasp signal | Coverage read |
| --- | --- | --- |
| `campaign.name` | `Campaigns.Name`, `getCampaignName`, `setCampaignName` | Strong concept match |
| `campaign.objective` | `getCampaignObjective`, `setCampaignObjective` | Strong concept match, but our live extraction is still wrong on some pages |
| `campaign.budget_type` | `Campaigns.BudgetType`, `setCampaignBudgetMode` | Strong concept match |
| `campaign.budget_value` | `Campaigns.Budget`, `getCampaignBudget`, `setCampaignBudget` | Strong concept match |
| `campaign.cbo_enabled` | `setCampaignCBO` | Concept match exists, getter not obvious in shipped bundle |
| `ad_set.name` | `Adsets.Name`, `setAdsetName` | Strong concept match |
| `ad_set.targeting.geo_locations` | `Adsets.GeoLocations`, `setAdsetTargetingLocations` | Strong concept match |
| `ad_set.targeting.geo_locations.countries` | `Adsets.GeoLocations`, `setAdsetTargetingLocations` | Derived field on our side, still conceptually aligned |
| `ad_set.targeting.age_range` | `setAdsetAges` | Strong concept match |
| `ad_set.targeting.genders` | `setAdsetGender` | Strong concept match |
| `ad_set.targeting.languages` | `setAdsetLocales`, `getLanguageValues` | Strong concept match |
| `ad_set.targeting.custom_audiences` | `Adsets.Audience`, `setAdsetSavedAudience` | Likely same problem space, needs hardening |
| `ad_set.placements` | `Adsets.PlacementSection`, `setAdsetAddPlacement`, `setAdsetRemovePlacement` | Strong concept match |
| `ad_set.schedule.start_date` | `Adsets.StartTime`, `Adsets.Scheduling`, `setAdsetSchedule` | Strong concept match |
| `ad_set.schedule.end_date` | `Adsets.EndTime`, `Adsets.Scheduling`, `setAdsetSchedule` | Strong concept match |
| `ad.name` | `Ads.Name`, `setAdName` | Strong concept match |
| `ad.creative.destination_url` | `Ads.Url`, `setAdUrl`, `setAdCreativeUrl` | Strong concept match |
| `ad.destination_url` | `Ads.Url`, `setAdUrl`, `setAdCreativeUrl` | Alias only on our side |
| `ad.creative.cta_type` | `Ads.Cta` | Strong concept match |
| `ad.creative.page_id` | `Ads.Page`, `setAdPageId` | Strong concept match |
| `ad.facebook_page_id` | `Ads.Page`, `setAdPageId` | Alias only on our side |

## Grasp Concepts We Do Not Yet Extract

These are the most useful Facebook concepts visible in Grasp that are not represented in our current extractor field list:

### Campaign level

- campaign buying type
- campaign status
- campaign spend cap
- campaign scheduling / day parting

### Ad set level

- ad set budget mode
- ad set budget amount
- ad set frequency control
- ad set performance goal / optimization goal
- ad set page id
- ad set product set
- ad set custom advantage audience / advantage audience control

### Ad level

- ad Instagram account id
- ad carousel URL
- ad URL parameters
- ad view tags
- ad creative format
- ad post type
- ad promo code
- ad partnership / branded content
- ad advantage creative
- ad multi-advertiser ads

## What This Means For Us

### Good news

- Our existing Meta field model already overlaps heavily with Grasp's Facebook field vocabulary.
- We are not missing the basic shape of the problem.
- Our current trouble is more about **selector accuracy, step awareness, and normalization** than field naming.

### Highest-value next additions

1. `ad_set.performance_goal`
2. `ad_set.frequency_control`
3. `campaign.buying_type`
4. `campaign.status`
5. `campaign.spend_cap`
6. `ad.instagram_account_id`
7. `ad.url_parameters`
8. `ad.view_tags`

### Highest-value hardening on already-covered fields

1. `campaign.objective`
2. `campaign.budget_type`
3. `ad_set.placements`
4. `ad_set.targeting.geo_locations`
5. `ad.creative.page_id`

Those are already conceptually validated by Grasp, and our live Meta runs show they are the places where extraction quality is still weakest.
