import { PrismaService } from './src/prisma/prisma.service';
import { PubSubService } from './src/pubsub/pubsub.service';
import { ConfigService } from '@nestjs/config';

async function testE2EUpdate() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  const configService = {
    get: (key: string) => {
      if (key === 'googleCloudProject') return 'local-dev';
      if (key === 'pubsubEmulatorHost') return 'localhost:8085';
      return undefined;
    },
  } as ConfigService;

  const pubsubService = new PubSubService(configService, prisma);
  await pubsubService.onModuleInit();

  try {
    console.log('🧪 Test 4.1: End-to-End Rule Update Flow\n');

    // Step 1: Get existing rule or create one
    let rule = await prisma.rule.findFirst();
    if (!rule) {
      const org = await prisma.organization.findFirst();
      const ruleSet = await prisma.ruleSet.findFirst({ where: { organizationId: org!.id } });
      
      if (!ruleSet) {
        console.log('❌ No rule set found. Please create one first.');
        return;
      }

      rule = await prisma.rule.create({
        data: {
          ruleSetId: ruleSet.id,
          name: 'E2E Test Rule',
          entityLevel: 'campaign',
          ruleType: 'field_validation',
          enforcement: 'warning',
          condition: { test: 'initial' },
        },
      });
    }

    console.log('📝 Step 1: Found/created rule');
    console.log(`   Rule ID: ${rule.id}`);
    console.log(`   Name: ${rule.name}\n`);

    // Step 2: Update the rule
    console.log('📝 Step 2: Updating rule...');
    const updatedRule = await prisma.rule.update({
      where: { id: rule.id },
      data: {
        condition: { test: 'updated', timestamp: Date.now() },
        version: rule.version + 1,
      },
    });
    console.log(`   ✅ Rule updated to version ${updatedRule.version}\n`);

    // Step 3: Trigger Pub/Sub publish
    console.log('📝 Step 3: Publishing to Pub/Sub...');
    const startTime = Date.now();
    
    // Get affected accounts (all accounts for this rule's organization)
    const ruleSet = await prisma.ruleSet.findUnique({
      where: { id: updatedRule.ruleSetId },
      include: { organization: { include: { adAccounts: true } } },
    });

    const accountIds = ruleSet!.accountIds.length > 0 
      ? ruleSet!.accountIds 
      : ruleSet!.organization.adAccounts.map(a => a.id);

    await pubsubService.publishRuleUpdate(accountIds.length > 0 ? accountIds : ['test-account']);
    
    const publishLatency = Date.now() - startTime;
    console.log(`   ✅ Published to Pub/Sub (${publishLatency}ms)\n`);

    console.log('📝 Step 4: Check backend logs for SSE broadcast');
    console.log('   Look for: "Broadcasting rule update to X SSE clients"\n');

    console.log('📝 Step 5: Check extension console for message receipt');
    console.log('   1. Open extension service worker console');
    console.log('   2. Look for: "SSE message received: rules_updated"\n');

    console.log('📝 Step 6: Check extension popup telemetry');
    console.log('   1. Open extension popup');
    console.log('   2. Expand "Selector Health"');
    console.log('   3. Check SSE Connection → Messages Received should increment\n');

    console.log('✅ Rule update triggered successfully!');
    console.log(`\n⏱️  Total time: ${Date.now() - startTime}ms`);
    console.log('\n👀 Now check:');
    console.log('   1. Backend terminal for SSE broadcast logs');
    console.log('   2. Extension service worker console for message receipt');
    console.log('   3. Extension popup for telemetry update');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.onModuleDestroy();
  }
}

testE2EUpdate();
