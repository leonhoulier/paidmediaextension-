import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get the organization and account
  const org = await prisma.organization.findFirst();
  const account = await prisma.adAccount.findFirst({
    where: {
      platformAccountId: '1639086456168798',
    },
  });

  if (!org || !account) {
    console.error('Organization or account not found');
    process.exit(1);
  }

  // Create a rule set for this account
  const ruleSet = await prisma.ruleSet.upsert({
    where: {
      id: '00000000-0000-0000-0000-000000000001',
    },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      organizationId: org.id,
      name: 'Léon Meta Test Rules',
      description: 'Test rules for Léon\'s Meta account',
      accountIds: [account.id],
      teamIds: [],
      buyerIds: [],
      active: true,
      version: 1,
    },
  });

  // Rule 1: Naming Convention
  await prisma.rule.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      ruleSetId: ruleSet.id,
      name: 'Campaign Naming Convention',
      description: 'Campaigns must follow the naming template: [Country]_[Objective]_[Date]',
      platform: 'meta',
      entityLevel: 'campaign',
      ruleType: 'naming_convention',
      enforcement: 'warning',
      condition: {
        field: 'campaign.name',
        operator: 'matches_pattern',
        value: '^[A-Z]{2}_[A-Za-z]+_\\d{8}$',
      },
      uiConfig: {
        injectionPoint: 'campaign_name',
        message: 'Campaign name should follow format: FR_Awareness_20260207',
        style: 'warning_banner',
        category: 'META - CAMPAIGN',
        priority: 1,
      },
      priority: 1,
      enabled: true,
      version: 1,
    },
  });

  // Rule 2: Budget Enforcement
  await prisma.rule.upsert({
    where: { id: '00000000-0000-0000-0000-000000000012' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000012',
      ruleSetId: ruleSet.id,
      name: 'Lifetime Budget Required',
      description: 'All campaigns must use lifetime budget',
      platform: 'meta',
      entityLevel: 'campaign',
      ruleType: 'budget_enforcement',
      enforcement: 'blocking',
      condition: {
        field: 'campaign.budget_type',
        operator: 'equals',
        value: 'lifetime',
      },
      uiConfig: {
        injectionPoint: 'budget_section',
        message: 'You must set a lifetime budget (not daily)',
        style: 'error_banner',
        category: 'META - CAMPAIGN',
        priority: 2,
      },
      priority: 2,
      enabled: true,
      version: 1,
    },
  });

  // Rule 3: France Targeting
  await prisma.rule.upsert({
    where: { id: '00000000-0000-0000-0000-000000000013' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000013',
      ruleSetId: ruleSet.id,
      name: 'Target France Only',
      description: 'Ad sets must target France',
      platform: 'meta',
      entityLevel: 'ad_set',
      ruleType: 'targeting_constraint',
      enforcement: 'warning',
      condition: {
        field: 'ad_set.targeting.geo_locations.countries',
        operator: 'must_include',
        value: ['FR'],
      },
      uiConfig: {
        injectionPoint: 'targeting_location',
        message: 'Recommended: Target France for this campaign',
        style: 'warning_banner',
        category: 'META - AD SET',
        priority: 1,
      },
      priority: 1,
      enabled: true,
      version: 1,
    },
  });

  console.log('✅ Created 3 test rules for Meta account act_1639086456168798');
  console.log('\nRules created:');
  console.log('  1. Campaign Naming Convention (warning)');
  console.log('  2. Lifetime Budget Required (blocking)');
  console.log('  3. Target France Only (warning)');
  console.log('\n📱 Now configure your extension with this token:');

  const buyer = await prisma.user.findFirst({
    where: { organizationId: org.id, role: 'buyer' },
  });

  console.log('  Token:', buyer?.extensionToken);
  console.log('  Org:', org.name);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
