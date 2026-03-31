import { PrismaService } from './src/prisma/prisma.service';
import { PubSubService } from './src/pubsub/pubsub.service';
import { ConfigService } from '@nestjs/config';

async function step2_UpdateRuleWhileDisconnected() {
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
    console.log('🧪 Test 4.2: SSE Reconnection - Step 2/4\n');
    console.log('📝 Updating rule while backend is disconnected...\n');

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
          test: 'updated_during_disconnect',
          timestamp: Date.now()
        },
        version: rule.version + 1,
      },
    });

    console.log(`✅ Rule updated to version ${updatedRule.version} (in database only)\n`);

    // Publish to Pub/Sub (will be queued in emulator)
    console.log('📝 Publishing to Pub/Sub emulator...');

    const ruleSet = await prisma.ruleSet.findUnique({
      where: { id: updatedRule.ruleSetId },
      include: { organization: { include: { adAccounts: true } } },
    });

    const accountIds = ruleSet!.accountIds.length > 0
      ? ruleSet!.accountIds
      : ruleSet!.organization.adAccounts.map(a => a.id);

    try {
      await pubsubService.publishRuleUpdate(accountIds.length > 0 ? accountIds : ['test-account']);
      console.log('✅ Message published to Pub/Sub emulator');
      console.log('   (Message is queued - will be delivered when backend restarts)\n');
    } catch (err: any) {
      console.log(`⚠️  Pub/Sub publish failed: ${err.message}`);
      console.log('   (This is expected if backend is stopped)\n');
    }

    console.log('📋 NEXT STEPS:');
    console.log('   1. Restart the backend: pnpm dev (in backend directory)');
    console.log('   2. Wait for "Nest application successfully started"');
    console.log('   3. Watch extension console for:');
    console.log('      - "SSE connection established" (should happen within 10s)');
    console.log('      - "SSE message received: undefined"');
    console.log('      - "Force refreshing rules..."');
    console.log('   4. After seeing reconnection, run: npx ts-node test-sse-disconnect-step3.ts\n');

  } catch (error) {
    console.error('❌ Step 2 failed:', error);
  } finally {
    await prisma.onModuleDestroy();
  }
}

step2_UpdateRuleWhileDisconnected();
