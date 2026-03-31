import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Use the first organization (DLG)
  const org = await prisma.organization.findFirst();

  if (!org) {
    console.error('No organization found. Run seed first.');
    process.exit(1);
  }

  // Add the real Meta account
  const account = await prisma.adAccount.upsert({
    where: {
      organizationId_platform_platformAccountId: {
        organizationId: org.id,
        platform: 'meta',
        platformAccountId: '1639086456168798',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      platform: 'meta',
      platformAccountId: '1639086456168798',
      accountName: 'Léon Houlier - Meta Ads',
      market: 'FR',
      region: 'EMEA',
      active: true,
    },
  });

  console.log('✅ Added Meta account:', account.accountName);
  console.log('   Account ID:', account.platformAccountId);
  console.log('   Organization:', org.name);

  // Get a buyer user to pair with
  const buyer = await prisma.user.findFirst({
    where: {
      organizationId: org.id,
      role: 'buyer',
    },
  });

  if (buyer) {
    console.log('\n📱 Extension Token for pairing:');
    console.log('   User:', buyer.email);
    console.log('   Token:', buyer.extensionToken);
    console.log('\n   Organization:', org.name);
    console.log('   Organization ID:', org.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
