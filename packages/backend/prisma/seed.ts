import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

/**
 * Generate a 64-character hex extension token
 */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

async function main(): Promise<void> {
  console.log('Seeding database...');

  // ─── Organizations ──────────────────────────────────────────────────────
  const acme = await prisma.organization.create({
    data: {
      name: 'DLG',
      slug: 'dlg',
      plan: 'enterprise',
      settings: {
        defaultEnforcement: 'warning',
        maxBudget: 500000,
        requireApprovalAbove: 50000,
      },
    },
  });

  const globalMedia = await prisma.organization.create({
    data: {
      name: 'GlobalMedia Inc',
      slug: 'globalmedia-inc',
      plan: 'pro',
      settings: {
        defaultEnforcement: 'blocking',
        maxBudget: 1000000,
      },
    },
  });

  console.log(`Created organizations: ${acme.name}, ${globalMedia.name}`);

  // ─── Teams ──────────────────────────────────────────────────────────────
  const createTeams = async (orgId: string): Promise<{ id: string; name: string }[]> => {
    const teams = [
      { name: 'US Social', description: 'US social media campaigns team' },
      { name: 'EMEA Search', description: 'European search campaigns team' },
      { name: 'APAC Programmatic', description: 'Asia Pacific programmatic team' },
    ];

    const created = [];
    for (const team of teams) {
      const t = await prisma.team.create({
        data: {
          organizationId: orgId,
          name: team.name,
          description: team.description,
          memberIds: [],
        },
      });
      created.push(t);
    }
    return created;
  };

  const acmeTeams = await createTeams(acme.id);
  const globalMediaTeams = await createTeams(globalMedia.id);
  console.log(`Created ${acmeTeams.length + globalMediaTeams.length} teams`);

  // ─── Users ──────────────────────────────────────────────────────────────
  const createUsers = async (
    orgId: string,
    orgSlug: string,
    teams: { id: string; name: string }[],
  ): Promise<{ id: string; email: string; role: string }[]> => {
    interface SeedUser {
      email: string;
      name: string;
      role: 'admin' | 'super_admin' | 'buyer';
      teamIds: string[];
      extensionToken?: string;
    }

    const users: SeedUser[] = [
      // 2 admins
      {
        email: `admin1@${orgSlug}.com`,
        name: 'Alice Admin',
        role: 'admin',
        teamIds: [teams[0].id],
      },
      {
        email: `admin2@${orgSlug}.com`,
        name: 'Bob Admin',
        role: 'super_admin',
        teamIds: [],
      },
      // 3 buyers
      {
        email: `buyer1@${orgSlug}.com`,
        name: 'Charlie Buyer',
        role: 'buyer',
        teamIds: [teams[0].id],
        extensionToken: generateToken(),
      },
      {
        email: `buyer2@${orgSlug}.com`,
        name: 'Diana Buyer',
        role: 'buyer',
        teamIds: [teams[1].id],
        extensionToken: generateToken(),
      },
      {
        email: `buyer3@${orgSlug}.com`,
        name: 'Ethan Buyer',
        role: 'buyer',
        teamIds: [teams[2].id],
        extensionToken: generateToken(),
      },
    ];

    const created = [];
    for (const user of users) {
      const u = await prisma.user.create({
        data: {
          organizationId: orgId,
          email: user.email,
          name: user.name,
          role: user.role,
          teamIds: user.teamIds,
          extensionToken: user.extensionToken ?? null,
        },
      });
      created.push(u);
    }

    // Update team memberIds
    for (const team of teams) {
      const members = created.filter((u) => {
        const userDef = users.find((uu) => uu.email === u.email);
        return userDef ? userDef.teamIds.includes(team.id) : false;
      });
      if (members.length > 0) {
        await prisma.team.update({
          where: { id: team.id },
          data: { memberIds: members.map((m) => m.id) },
        });
      }
    }

    return created;
  };

  const acmeUsers = await createUsers(acme.id, 'dlg', acmeTeams);
  const globalMediaUsers = await createUsers(
    globalMedia.id,
    'globalmedia-inc',
    globalMediaTeams,
  );
  console.log(`Created ${acmeUsers.length + globalMediaUsers.length} users`);

  // ─── Ad Accounts ────────────────────────────────────────────────────────
  const createAdAccounts = async (
    orgId: string,
  ): Promise<{ id: string; platform: string; platformAccountId: string }[]> => {
    const accounts = [
      {
        platform: 'meta' as const,
        platformAccountId: 'act_123456',
        accountName: 'Main Meta Account',
        market: 'US',
        region: 'NA',
      },
      {
        platform: 'meta' as const,
        platformAccountId: 'act_789012',
        accountName: 'EMEA Meta Account',
        market: 'FR',
        region: 'EMEA',
      },
      {
        platform: 'google_ads' as const,
        platformAccountId: '123-456-7890',
        accountName: 'Primary Google Ads',
        market: 'US',
        region: 'NA',
      },
      {
        platform: 'google_ads' as const,
        platformAccountId: '987-654-3210',
        accountName: 'APAC Google Ads',
        market: 'JP',
        region: 'APAC',
      },
    ];

    const created = [];
    for (const account of accounts) {
      const a = await prisma.adAccount.create({
        data: {
          organizationId: orgId,
          platform: account.platform,
          platformAccountId: account.platformAccountId,
          accountName: account.accountName,
          market: account.market,
          region: account.region,
          active: true,
        },
      });
      created.push(a);
    }
    return created;
  };

  const acmeAccounts = await createAdAccounts(acme.id);
  const globalMediaAccounts = await createAdAccounts(globalMedia.id);
  console.log(
    `Created ${acmeAccounts.length + globalMediaAccounts.length} ad accounts`,
  );

  // ─── Rule Sets ──────────────────────────────────────────────────────────
  const createRulesForOrg = async (
    orgId: string,
    accounts: { id: string; platform: string; platformAccountId: string }[],
    _teams: { id: string; name: string }[],
  ): Promise<void> => {
    const metaAccounts = accounts.filter((a) => a.platform === 'meta');
    const googleAccounts = accounts.filter((a) => a.platform === 'google_ads');

    // Rule Set 1: Global Meta Rules
    const metaRuleSet = await prisma.ruleSet.create({
      data: {
        organizationId: orgId,
        name: 'Global Meta Rules',
        description: 'Rules applied to all Meta ad accounts',
        accountIds: metaAccounts.map((a) => a.id),
        teamIds: [],
        buyerIds: [],
        active: true,
        version: 1,
      },
    });

    // Rule Set 2: Global Google Ads Rules
    const googleRuleSet = await prisma.ruleSet.create({
      data: {
        organizationId: orgId,
        name: 'Global Google Ads Rules',
        description: 'Rules applied to all Google Ads accounts',
        accountIds: googleAccounts.map((a) => a.id),
        teamIds: [],
        buyerIds: [],
        active: true,
        version: 1,
      },
    });

    // Rule Set 3: Cross-platform brand safety
    const brandSafetyRuleSet = await prisma.ruleSet.create({
      data: {
        organizationId: orgId,
        name: 'Brand Safety Rules',
        description: 'Brand safety rules for all platforms',
        accountIds: accounts.map((a) => a.id),
        teamIds: [],
        buyerIds: [],
        active: true,
        version: 1,
      },
    });

    // ─── Rules ────────────────────────────────────────────────────────

    // Rule 1: Campaign naming convention (Meta)
    const namingRule = await prisma.rule.create({
      data: {
        ruleSetId: metaRuleSet.id,
        name: 'Campaign Name Convention',
        description: 'Campaign name must follow the standard naming template',
        platform: 'meta',
        entityLevel: 'campaign',
        ruleType: 'naming_convention',
        enforcement: 'blocking',
        condition: {
          field: 'campaign.name',
          operator: 'matches_template',
          value: { templateId: 'auto' },
        },
        uiConfig: {
          injectionPoint: 'name_field',
          style: 'naming_template_preview',
          message: 'The name must follow the template below:',
          category: 'META - CAMPAIGN',
          priority: 1,
        },
        priority: 1,
        enabled: true,
        version: 1,
      },
    });

    // Create naming template for rule 1
    await prisma.namingTemplate.create({
      data: {
        ruleId: namingRule.id,
        segments: [
          {
            label: 'Region',
            type: 'enum',
            separator: '_',
            required: true,
            allowedValues: ['NA', 'EMEA', 'APAC', 'LATAM'],
          },
          {
            label: 'Country',
            type: 'enum',
            separator: '_',
            required: true,
            allowedValues: ['US', 'UK', 'FR', 'DE', 'JP', 'AU', 'BR'],
          },
          {
            label: 'Category',
            type: 'enum',
            separator: '_',
            required: true,
            allowedValues: ['Brand', 'Performance', 'Retargeting', 'Prospecting'],
          },
          {
            label: 'Campaign Description',
            type: 'free_text',
            separator: '_',
            required: true,
            pattern: '^[A-Za-z0-9\\-]+$',
          },
          {
            label: 'Date',
            type: 'date',
            separator: '_',
            required: true,
            format: 'YYYYMMDD',
          },
          {
            label: 'Unique ID',
            type: 'auto_generated',
            separator: '_',
            required: true,
            autoGenerator: 'uuid_short',
          },
        ],
        separator: '_',
        example: 'NA_US_Brand_SummerSale_20260201_a1b2c3',
      },
    });

    // Rule 2: Enforce lifetime budget (Meta)
    await prisma.rule.create({
      data: {
        ruleSetId: metaRuleSet.id,
        name: 'Enforce Lifetime Budget',
        description: 'All campaigns must use lifetime budget with min $100, max $100k',
        platform: 'meta',
        entityLevel: 'campaign',
        ruleType: 'budget_enforcement',
        enforcement: 'blocking',
        condition: {
          operator: 'and',
          conditions: [
            {
              field: 'campaign.budget_type',
              operator: 'equals',
              value: 'lifetime',
            },
            {
              field: 'campaign.budget_value',
              operator: 'in_range',
              value: { min: 100, max: 100000 },
            },
          ],
        },
        uiConfig: {
          injectionPoint: 'budget_section',
          style: 'error_banner',
          message: 'You must set a lifetime budget between $100 and $100,000',
          requireConfirmation: true,
          confirmationMessage: 'Re-type the budget to confirm',
          category: 'META - CAMPAIGN',
          priority: 2,
        },
        priority: 2,
        enabled: true,
        version: 1,
      },
    });

    // Rule 3: Must target US (Meta Ad Set)
    await prisma.rule.create({
      data: {
        ruleSetId: metaRuleSet.id,
        name: 'Must Target USA',
        description: 'All ad sets must target the United States',
        platform: 'meta',
        entityLevel: 'ad_set',
        ruleType: 'targeting_constraint',
        enforcement: 'blocking',
        condition: {
          field: 'ad_set.targeting.geo_locations.countries',
          operator: 'must_include',
          value: ['US'],
        },
        uiConfig: {
          injectionPoint: 'targeting_location',
          style: 'error_banner',
          message: 'You must select only the following location: "United States"',
          category: 'META - AD SET',
          priority: 1,
        },
        priority: 3,
        enabled: true,
        version: 1,
      },
    });

    // Rule 4: Must target France (Meta Ad Set - EMEA accounts)
    await prisma.rule.create({
      data: {
        ruleSetId: metaRuleSet.id,
        name: 'Must Target France',
        description: 'EMEA ad sets must target France',
        platform: 'meta',
        entityLevel: 'ad_set',
        ruleType: 'targeting_constraint',
        enforcement: 'warning',
        condition: {
          field: 'ad_set.targeting.geo_locations.countries',
          operator: 'must_only_be',
          value: ['FR'],
        },
        uiConfig: {
          injectionPoint: 'targeting_location',
          style: 'error_banner',
          message: 'You must select only the following location: "France"',
          category: 'META - AD SET',
          priority: 2,
        },
        priority: 4,
        enabled: true,
        version: 1,
      },
    });

    // Rule 5: Brand safety exclusions (all platforms)
    await prisma.rule.create({
      data: {
        ruleSetId: brandSafetyRuleSet.id,
        name: 'Brand Safety Exclusions',
        description: 'Must exclude Sexual, Weapons, and Gambling categories',
        platform: 'all',
        entityLevel: 'ad_set',
        ruleType: 'brand_safety',
        enforcement: 'blocking',
        condition: {
          field: 'ad_set.brand_safety.excluded_categories',
          operator: 'must_include',
          value: ['Sexual', 'Weapons', 'Gambling'],
        },
        uiConfig: {
          injectionPoint: 'brand_safety_section',
          style: 'error_banner',
          message:
            'You must exclude all of the following sensitive categories: "Sexual" | "Weapons" | "Gambling"',
          category: 'BRAND SAFETY',
          priority: 1,
        },
        priority: 5,
        enabled: true,
        version: 1,
      },
    });

    // Rule 6: Google Ads campaign naming convention
    const googleNamingRule = await prisma.rule.create({
      data: {
        ruleSetId: googleRuleSet.id,
        name: 'Google Campaign Name Convention',
        description: 'Google Ads campaign names must follow template',
        platform: 'google_ads',
        entityLevel: 'campaign',
        ruleType: 'naming_convention',
        enforcement: 'blocking',
        condition: {
          field: 'campaign.name',
          operator: 'matches_template',
          value: { templateId: 'auto' },
        },
        uiConfig: {
          injectionPoint: 'name_field',
          style: 'naming_template_preview',
          message: 'The campaign name must follow the template below:',
          category: 'GOOGLE ADS - CAMPAIGN',
          priority: 1,
        },
        priority: 6,
        enabled: true,
        version: 1,
      },
    });

    // Create naming template for Google rule
    await prisma.namingTemplate.create({
      data: {
        ruleId: googleNamingRule.id,
        segments: [
          {
            label: 'Market',
            type: 'enum',
            separator: '_',
            required: true,
            allowedValues: ['US', 'UK', 'FR', 'DE', 'JP'],
          },
          {
            label: 'Campaign Type',
            type: 'enum',
            separator: '_',
            required: true,
            allowedValues: ['Search', 'Display', 'Shopping', 'Video', 'PMax'],
          },
          {
            label: 'Description',
            type: 'free_text',
            separator: '_',
            required: true,
          },
          {
            label: 'Date',
            type: 'date',
            separator: '',
            required: true,
            format: 'YYYYMMDD',
          },
        ],
        separator: '_',
        example: 'US_Search_BrandTerms_20260201',
      },
    });

    // Rule 7: Google Ads budget enforcement
    await prisma.rule.create({
      data: {
        ruleSetId: googleRuleSet.id,
        name: 'Budget Range Enforcement',
        description: 'Campaign budget must be between $100 and $100,000',
        platform: 'google_ads',
        entityLevel: 'campaign',
        ruleType: 'budget_enforcement',
        enforcement: 'blocking',
        condition: {
          field: 'campaign.budget_value',
          operator: 'in_range',
          value: { min: 100, max: 100000 },
        },
        uiConfig: {
          injectionPoint: 'budget_section',
          style: 'error_banner',
          message: 'Campaign budget must be between $100 and $100,000',
          category: 'GOOGLE ADS - CAMPAIGN',
          priority: 2,
        },
        priority: 7,
        enabled: true,
        version: 1,
      },
    });

    // Rule 8: Enforce CBO (Meta campaign)
    await prisma.rule.create({
      data: {
        ruleSetId: metaRuleSet.id,
        name: 'Enforce Campaign Budget Optimization',
        description: 'Campaign must use CBO (Advantage+ Campaign Budget)',
        platform: 'meta',
        entityLevel: 'campaign',
        ruleType: 'bidding_strategy',
        enforcement: 'warning',
        condition: {
          field: 'campaign.cbo_enabled',
          operator: 'equals',
          value: true,
        },
        uiConfig: {
          injectionPoint: 'cbo_toggle',
          style: 'error_banner',
          message: 'You should enable Campaign Budget Optimization (Advantage+)',
          category: 'META - CAMPAIGN',
          priority: 3,
        },
        priority: 8,
        enabled: true,
        version: 1,
      },
    });

    // Rule 9: Google Ads location targeting
    await prisma.rule.create({
      data: {
        ruleSetId: googleRuleSet.id,
        name: 'Target US Only',
        description: 'Google Ads campaigns must target the United States',
        platform: 'google_ads',
        entityLevel: 'campaign',
        ruleType: 'targeting_constraint',
        enforcement: 'blocking',
        condition: {
          field: 'campaign.geo_targets',
          operator: 'must_include',
          value: ['US'],
        },
        uiConfig: {
          injectionPoint: 'targeting_location',
          style: 'error_banner',
          message: 'Campaign must target the United States',
          category: 'GOOGLE ADS - CAMPAIGN',
          priority: 3,
        },
        priority: 9,
        enabled: true,
        version: 1,
      },
    });

    // Rule 10: Schedule enforcement - must have end date (Meta)
    await prisma.rule.create({
      data: {
        ruleSetId: metaRuleSet.id,
        name: 'Require End Date',
        description: 'Ad sets must have an end date set',
        platform: 'meta',
        entityLevel: 'ad_set',
        ruleType: 'schedule_enforcement',
        enforcement: 'comment_required',
        condition: {
          field: 'ad_set.schedule.end_date',
          operator: 'is_set',
          value: true,
        },
        uiConfig: {
          injectionPoint: 'schedule_section',
          style: 'error_banner',
          message: 'Ad set must have an end date. Leave a comment if open-ended.',
          category: 'META - AD SET',
          priority: 3,
        },
        priority: 10,
        enabled: true,
        version: 1,
      },
    });

    // ─── New Rules 11-20 (expanded rule catalog) ───────────────────────

    // Rule 11: Spending Limit (spending_limit)
    await prisma.rule.create({
      data: {
        ruleSetId: metaRuleSet.id,
        name: 'Minimum Campaign Budget',
        description: 'Campaign budget must be at least $100',
        platform: 'meta',
        entityLevel: 'campaign',
        ruleType: 'spending_limit',
        enforcement: 'blocking',
        condition: {
          field: 'campaign.budget_value',
          operator: 'greater_than_or_equal',
          value: 100,
        },
        uiConfig: {
          injectionPoint: 'budget_section',
          style: 'error_banner',
          message: 'Campaign budget must be at least $100.',
          category: 'META - CAMPAIGN',
          priority: 2,
        },
        priority: 11,
        enabled: true,
        version: 1,
      },
    });

    // Rule 12: Special Ad Categories (special_ad_categories)
    await prisma.rule.create({
      data: {
        ruleSetId: metaRuleSet.id,
        name: 'Special Ad Categories Required',
        description: 'Campaigns in regulated industries must declare special ad categories',
        platform: 'meta',
        entityLevel: 'campaign',
        ruleType: 'special_ad_categories',
        enforcement: 'blocking',
        condition: {
          field: 'campaign.special_ad_categories',
          operator: 'is_set',
          value: true,
        },
        uiConfig: {
          injectionPoint: 'campaign_details',
          style: 'error_banner',
          message: 'Special ad categories must be declared for regulated industries.',
          category: 'META - CAMPAIGN',
          priority: 1,
        },
        priority: 12,
        enabled: true,
        version: 1,
      },
    });

    // Rule 13: Pixel / Conversion (pixel_conversion)
    await prisma.rule.create({
      data: {
        ruleSetId: metaRuleSet.id,
        name: 'Pixel Required',
        description: 'Ad sets must have a tracking pixel configured',
        platform: 'meta',
        entityLevel: 'ad_set',
        ruleType: 'pixel_conversion',
        enforcement: 'blocking',
        condition: {
          field: 'ad_set.pixel_id',
          operator: 'is_set',
          value: true,
        },
        uiConfig: {
          injectionPoint: 'tracking_section',
          style: 'error_banner',
          message: 'A tracking pixel must be configured.',
          category: 'META - AD SET',
          priority: 1,
        },
        priority: 13,
        enabled: true,
        version: 1,
      },
    });

    // Rule 14: Status Enforcement (status_enforcement)
    await prisma.rule.create({
      data: {
        ruleSetId: brandSafetyRuleSet.id,
        name: 'Create in Paused Status',
        description: 'New campaigns must be created in PAUSED status',
        platform: 'all',
        entityLevel: 'campaign',
        ruleType: 'status_enforcement',
        enforcement: 'blocking',
        condition: {
          field: 'campaign.status',
          operator: 'equals',
          value: 'PAUSED',
        },
        uiConfig: {
          injectionPoint: 'campaign_details',
          style: 'error_banner',
          message: 'New campaigns must be created in PAUSED status.',
          category: 'CAMPAIGN SETTINGS',
          priority: 1,
        },
        priority: 14,
        enabled: true,
        version: 1,
      },
    });

    // Rule 15: Identity Enforcement (identity_enforcement)
    await prisma.rule.create({
      data: {
        ruleSetId: metaRuleSet.id,
        name: 'Facebook Page Required',
        description: 'Ads must have a Facebook Page selected',
        platform: 'meta',
        entityLevel: 'ad',
        ruleType: 'identity_enforcement',
        enforcement: 'blocking',
        condition: {
          field: 'ad.facebook_page_id',
          operator: 'is_set',
          value: true,
        },
        uiConfig: {
          injectionPoint: 'identity_section',
          style: 'error_banner',
          message: 'A Facebook Page must be selected.',
          category: 'META - AD',
          priority: 1,
        },
        priority: 15,
        enabled: true,
        version: 1,
      },
    });

    // Rule 16: Tracking URL (tracking_url)
    await prisma.rule.create({
      data: {
        ruleSetId: brandSafetyRuleSet.id,
        name: 'UTM Tracking Required',
        description: 'Ad destination URLs must include UTM parameters',
        platform: 'all',
        entityLevel: 'ad',
        ruleType: 'tracking_url',
        enforcement: 'warning',
        condition: {
          field: 'ad.destination_url',
          operator: 'contains',
          value: 'utm_',
        },
        uiConfig: {
          injectionPoint: 'url_section',
          style: 'warning_banner',
          message: 'Destination URL should include UTM tracking parameters.',
          category: 'TRACKING',
          priority: 2,
        },
        priority: 16,
        enabled: true,
        version: 1,
      },
    });

    // Rule 17: Audience Control (audience_control)
    await prisma.rule.create({
      data: {
        ruleSetId: metaRuleSet.id,
        name: 'Custom Audience Required',
        description: 'Ad sets should use at least one custom audience',
        platform: 'meta',
        entityLevel: 'ad_set',
        ruleType: 'audience_control',
        enforcement: 'warning',
        condition: {
          field: 'ad_set.targeting.custom_audiences',
          operator: 'is_set',
          value: true,
        },
        uiConfig: {
          injectionPoint: 'targeting_audiences',
          style: 'warning_banner',
          message: 'Consider using custom audiences for better targeting.',
          category: 'META - AD SET',
          priority: 3,
        },
        priority: 17,
        enabled: true,
        version: 1,
      },
    });

    // Rule 18: Frequency Cap (frequency_cap)
    await prisma.rule.create({
      data: {
        ruleSetId: metaRuleSet.id,
        name: 'Frequency Cap Required',
        description: 'Ad sets should have a frequency cap to prevent ad fatigue',
        platform: 'meta',
        entityLevel: 'ad_set',
        ruleType: 'frequency_cap',
        enforcement: 'warning',
        condition: {
          field: 'ad_set.frequency_cap',
          operator: 'is_set',
          value: true,
        },
        uiConfig: {
          injectionPoint: 'delivery_section',
          style: 'warning_banner',
          message: 'Consider setting a frequency cap to prevent ad fatigue.',
          category: 'META - AD SET',
          priority: 3,
        },
        priority: 18,
        enabled: true,
        version: 1,
      },
    });

    // Rule 19: Bid Value (bid_value)
    await prisma.rule.create({
      data: {
        ruleSetId: metaRuleSet.id,
        name: 'Bid Cap Maximum',
        description: 'Bid cap must not exceed $50',
        platform: 'meta',
        entityLevel: 'ad_set',
        ruleType: 'bid_value',
        enforcement: 'blocking',
        condition: {
          field: 'ad_set.bid_cap',
          operator: 'less_than_or_equal',
          value: 50,
        },
        uiConfig: {
          injectionPoint: 'bidding_section',
          style: 'error_banner',
          message: 'Bid cap must not exceed $50.',
          category: 'META - AD SET',
          priority: 2,
        },
        priority: 19,
        enabled: true,
        version: 1,
      },
    });

    // Rule 20: Identity Enforcement - Facebook Page whitelist
    await prisma.rule.create({
      data: {
        ruleSetId: metaRuleSet.id,
        name: 'Approved Facebook Pages Only',
        description: 'Only approved Facebook Pages may be used for ads',
        platform: 'meta',
        entityLevel: 'ad',
        ruleType: 'identity_enforcement',
        enforcement: 'blocking',
        condition: {
          field: 'ad.facebook_page_id',
          operator: 'must_only_be',
          value: ['page_001', 'page_002'],
        },
        uiConfig: {
          injectionPoint: 'identity_section',
          style: 'error_banner',
          message: 'Only approved Facebook Pages may be used.',
          category: 'META - AD',
          priority: 1,
        },
        priority: 20,
        enabled: true,
        version: 1,
      },
    });
  };

  await createRulesForOrg(acme.id, acmeAccounts, acmeTeams);
  await createRulesForOrg(globalMedia.id, globalMediaAccounts, globalMediaTeams);
  console.log('Created rule sets and rules for both organizations');

  // Print extension tokens for testing
  const allBuyers = await prisma.user.findMany({
    where: { role: 'buyer', extensionToken: { not: null } },
    select: { email: true, extensionToken: true, organizationId: true },
  });

  console.log('\n--- Extension Tokens for Testing ---');
  for (const buyer of allBuyers) {
    console.log(`  ${buyer.email}: ${buyer.extensionToken}`);
  }

  console.log('\nSeeding complete!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
