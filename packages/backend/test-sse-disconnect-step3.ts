import { PrismaService } from './src/prisma/prisma.service';

async function step3_VerifyReconnection() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  try {
    console.log('🧪 Test 4.2: SSE Reconnection - Step 3/4\n');
    console.log('📝 Verifying reconnection and message delivery...\n');

    // Get the rule to check its current version
    const rule = await prisma.rule.findFirst();

    if (!rule) {
      console.log('❌ No rule found.');
      return;
    }

    console.log(`✅ Current rule version in database: ${rule.version}\n`);

    console.log('📋 VERIFICATION CHECKLIST:\n');

    console.log('✅ Extension Service Worker Console:');
    console.log('   □ Shows "SSE connection established" (reconnected within 10s)');
    console.log('   □ Shows "SSE message received: undefined" (caught missed message)');
    console.log('   □ Shows "Force refreshing rules for account..." (cache invalidated)');
    console.log('   □ Shows "Fetched X rules, Y templates (version: ...)" (new version hash)\n');

    console.log('✅ Backend Logs (check the terminal where backend is running):');
    console.log('   □ Shows "Broadcasting rule update to 1 SSE clients"');
    console.log('   □ Shows "sse_broadcast_complete" with "successCount": 1\n');

    console.log('✅ Extension Popup:');
    console.log('   □ "SSE Connection → Status" = "Connected"');
    console.log('   □ "SSE Connection → Last Message" shows recent timestamp');
    console.log('   □ "SSE Connection → Messages Received" incremented by 1\n');

    console.log('📊 TEST RESULTS:\n');

    console.log('If all checkboxes above are ✅:');
    console.log('   ✅ Test 4.2 PASSED - SSE reconnection works correctly!\n');

    console.log('If any checkbox is ❌:');
    console.log('   ❌ Test 4.2 FAILED - Please review the failed items\n');

    console.log('📋 KEY METRICS TO RECORD:');
    console.log('   - Reconnection time: How many seconds after backend restart?');
    console.log('   - Message delivery: Was the missed message delivered?');
    console.log('   - No duplicates: Was the message only processed once?\n');

    console.log('🎉 Test 4.2 Complete!\n');

  } catch (error) {
    console.error('❌ Step 3 failed:', error);
  } finally {
    await prisma.onModuleDestroy();
  }
}

step3_VerifyReconnection();
