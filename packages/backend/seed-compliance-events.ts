import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed compliance events for dashboard testing.
 * Generates events across multiple buyers, accounts, and rules
 * over the last 30 days with realistic pass/fail distributions.
 */
async function main(): Promise<void> {
  const orgId = '157a9b49-b65e-46e7-80b2-b1852a7e3563';

  // Get all buyers for this org
  const buyers = await prisma.user.findMany({
    where: { organizationId: orgId, role: 'buyer' },
  });

  // Get all ad accounts for this org
  const accounts = await prisma.adAccount.findMany({
    where: { organizationId: orgId },
  });

  // Get all rules for this org
  const rules = await prisma.rule.findMany({
    where: { ruleSet: { organizationId: orgId } },
    include: { ruleSet: true },
  });

  if (buyers.length === 0 || accounts.length === 0 || rules.length === 0) {
    console.log('No seed data found. Run the main seed first.');
    return;
  }

  console.log(`Seeding compliance events for ${orgId}...`);
  console.log(`  Buyers: ${buyers.length}, Accounts: ${accounts.length}, Rules: ${rules.length}`);

  const statuses = ['passed', 'violated', 'overridden', 'passed', 'passed', 'passed'] as const;
  const campaignNames = [
    'NA_US_Brand_SummerSale_20260115',
    'EMEA_FR_Performance_SpringLaunch_20260120',
    'NA_US_Retargeting_Q1Push_20260201',
    'APAC_JP_Brand_NewProduct_20260205',
    'NA_US_Prospecting_LeadGen_20260210',
    'EMEA_UK_Performance_ValentineDay_20260214',
  ];

  const events = [];
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  // Generate ~200 events spread over 30 days
  for (let i = 0; i < 200; i++) {
    const buyer = buyers[i % buyers.length];
    const account = accounts[i % accounts.length];
    // Match rule platform to account platform
    const matchingRules = rules.filter(
      (r) => r.platform === account.platform || r.platform === 'all',
    );
    if (matchingRules.length === 0) continue;

    const rule = matchingRules[i % matchingRules.length];
    const status = statuses[i % statuses.length];
    const campaignName = campaignNames[i % campaignNames.length];

    // Spread events over the last 30 days
    const daysAgo = Math.floor(Math.random() * 30);
    const hoursOffset = Math.floor(Math.random() * 24);
    const eventDate = new Date(now - daysAgo * 24 * 60 * 60 * 1000 - hoursOffset * 60 * 60 * 1000);

    events.push({
      organizationId: orgId,
      buyerId: buyer.id,
      adAccountId: account.id,
      platform: account.platform,
      entityLevel: rule.entityLevel,
      entityName: `${campaignName}_${i}`,
      ruleId: rule.id,
      status,
      fieldValue: status === 'violated' ? '50' : '5000',
      expectedValue: '100-50000',
      comment: status === 'overridden' ? 'Approved by manager' : null,
      createdAt: eventDate,
    });
  }

  // Batch insert
  const result = await prisma.complianceEvent.createMany({
    data: events,
  });

  console.log(`Created ${result.count} compliance events`);
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
