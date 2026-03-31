import { PrismaService } from './src/prisma/prisma.service';
import { PubSubService } from './src/pubsub/pubsub.service';
import { ConfigService } from '@nestjs/config';

async function step2_TriggerPublishFailure() {
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
    console.log('🧪 Test 4.3: Pub/Sub Publish Failure - Step 2/3\n');
    console.log('📝 Updating rule with Pub/Sub emulator stopped...\n');

    // Find first rule
    const rule = await prisma.rule.findFirst();

    if (!rule) {
      console.log('❌ No rule found.');
      return;
    }

    console.log(`✅ Found rule: ${rule.name} (version ${rule.version})`);

    // Update the rule
    const updatedRule = await prisma.rule.update({
      where: { id: rule.id },
      data: {
        condition: {
          ...(typeof rule.condition === 'object' ? rule.condition : {}),
          test: 'pubsub_failure_test',
          timestamp: Date.now()
        },
        version: rule.version + 1,
      },
    });

    console.log(`✅ Rule updated to version ${updatedRule.version}\n`);

    // Try to publish (this should fail and trigger retry logic)
    console.log('📝 Attempting to publish to Pub/Sub (emulator is down)...');
    console.log('⏱️  This will take ~14 seconds (3 retry attempts: 2s, 4s, 8s delays)\n');

    const startTime = Date.now();

    const ruleSet = await prisma.ruleSet.findUnique({
      where: { id: updatedRule.ruleSetId },
      include: { organization: { include: { adAccounts: true } } },
    });

    const accountIds = ruleSet!.accountIds.length > 0
      ? ruleSet!.accountIds
      : ruleSet!.organization.adAccounts.map(a => a.id);

    try {
      await pubsubService.publishRuleUpdate(accountIds.length > 0 ? accountIds : ['test-account']);
      console.log('⚠️  UNEXPECTED: Publish succeeded (emulator might still be running)');
    } catch (err: any) {
      const totalTime = Date.now() - startTime;
      console.log(`✅ Expected failure occurred after ${Math.round(totalTime / 1000)}s`);
      console.log(`   Error: ${err.message}\n`);
    }

    // Check if failure was stored in database
    console.log('📝 Checking pubsub_failures table...');
    const failures = await prisma.pubSubFailure.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (failures.length > 0) {
      const failure = failures[0];
      console.log('✅ Failure stored in database:');
      console.log(`   Topic: ${failure.topic}`);
      console.log(`   Attempts: ${failure.attempts}`);
      console.log(`   Last Error: ${failure.lastError.substring(0, 80)}...`);
      console.log(`   Created At: ${failure.createdAt.toISOString()}\n`);
    } else {
      console.log('⚠️  No failure found in database (might need to check implementation)\n');
    }

    console.log('📋 NEXT STEPS:');
    console.log('   1. Restart the Pub/Sub emulator:');
    console.log('      docker start <pubsub-container-id>');
    console.log('   2. Verify emulator is running:');
    console.log('      docker ps | grep pubsub  # Should show the container');
    console.log('   3. When emulator is running, run: npx ts-node test-pubsub-failure-step3.ts\n');

    console.log('💡 NOTE: In production, a background job would retry failed publishes every 5 minutes.');
    console.log('   For this test, we\'ll manually trigger the retry in Step 3.\n');

  } catch (error) {
    console.error('❌ Step 2 failed:', error);
  } finally {
    await prisma.onModuleDestroy();
  }
}

step2_TriggerPublishFailure();
