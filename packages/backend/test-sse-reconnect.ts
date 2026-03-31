import { PrismaService } from './src/prisma/prisma.service';
import { PubSubService } from './src/pubsub/pubsub.service';
import { ConfigService } from '@nestjs/config';

async function testSSEReconnect() {
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
    console.log('🧪 Test 4.2: SSE Connection Dropped & Recovery\n');

    // Step 1: Find or create test rule
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
          name: 'SSE Reconnect Test Rule',
          entityLevel: 'campaign',
          ruleType: 'field_validation',
          enforcement: 'warning',
          condition: { test: 'initial' },
        },
      });
    }

    console.log('📝 Step 1: Initial rule state');
    console.log(`   Rule ID: ${rule.id}`);
    console.log(`   Name: ${rule.name}`);
    console.log(`   Version: ${rule.version}\n`);

    // Step 2: User manually disconnects SSE
    console.log('📝 Step 2: MANUAL ACTION REQUIRED');
    console.log('   1. Open extension service worker console');
    console.log('   2. Note the current SSE connection status (should be "connected")');
    console.log('   3. In the backend terminal, press Ctrl+C to stop the backend');
    console.log('   4. Watch the extension console - it should show "SSE connection error"');
    console.log('   5. The extension will start reconnection attempts\n');

    console.log('⏸️  Press ENTER when you have stopped the backend...');
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve());
    });

    // Step 3: Update rule while backend is down
    console.log('\n📝 Step 3: Updating rule while backend is disconnected...');
    const updatedRule = await prisma.rule.update({
      where: { id: rule.id },
      data: {
        condition: { test: 'updated_during_disconnect', timestamp: Date.now() },
        version: rule.version + 1,
      },
    });
    console.log(`   ✅ Rule updated to version ${updatedRule.version} (in database)`);
    console.log(`   ⚠️  Note: SSE message will NOT be sent (backend is down)\n`);

    // Step 4: Publish Pub/Sub message (will succeed even if backend is down)
    console.log('📝 Step 4: Publishing to Pub/Sub emulator...');
    const ruleSet = await prisma.ruleSet.findUnique({
      where: { id: updatedRule.ruleSetId },
      include: { organization: { include: { adAccounts: true } } },
    });

    const accountIds = ruleSet!.accountIds.length > 0
      ? ruleSet!.accountIds
      : ruleSet!.organization.adAccounts.map(a => a.id);

    try {
      await pubsubService.publishRuleUpdate(accountIds.length > 0 ? accountIds : ['test-account']);
      console.log('   ✅ Published to Pub/Sub (emulator stores message for later delivery)\n');
    } catch (err: any) {
      console.log(`   ⚠️  Pub/Sub publish might fail: ${err.message}\n`);
    }

    // Step 5: User restarts backend
    console.log('📝 Step 5: MANUAL ACTION REQUIRED');
    console.log('   1. Restart the backend: pnpm dev');
    console.log('   2. Wait for backend to start (look for "Nest application successfully started")');
    console.log('   3. Watch the extension console for reconnection\n');

    console.log('⏸️  Press ENTER when backend has restarted...');
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve());
    });

    // Step 6: Verification
    console.log('\n📝 Step 6: Verify reconnection and catch-up');
    console.log('   Expected behavior:');
    console.log('   ✅ Extension console shows "SSE connection established" (within 10s)');
    console.log('   ✅ Extension console shows "SSE message received: undefined" (catches missed message)');
    console.log('   ✅ Extension console shows "Force refreshing rules..." (cache invalidated)');
    console.log('   ✅ Extension fetches updated rules with new version hash');
    console.log('   ✅ Backend logs show "Broadcasting rule update to 1 SSE clients"\n');

    console.log('📝 Step 7: Check extension popup');
    console.log('   1. Open extension popup');
    console.log('   2. Check "SSE Connection → Status" = "Connected"');
    console.log('   3. Check "SSE Connection → Last Message" shows recent timestamp');
    console.log('   4. Check "SSE Connection → Messages Received" incremented\n');

    console.log('✅ Test 4.2: SSE Reconnection Test Ready!');
    console.log('\n📊 Success Criteria:');
    console.log('   ✅ Extension detects disconnection (status changes to "error")');
    console.log('   ✅ Extension reconnects within 10s after backend restart');
    console.log('   ✅ Missed Pub/Sub message delivered after reconnection');
    console.log('   ✅ Extension cache invalidated and rules re-fetched');
    console.log('   ✅ No duplicate message delivery (sequence tracking works)');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.onModuleDestroy();
    process.exit(0);
  }
}

testSSEReconnect();
