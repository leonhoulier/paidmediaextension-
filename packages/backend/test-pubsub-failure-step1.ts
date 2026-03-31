import { PrismaService } from './src/prisma/prisma.service';

async function step1_PrepareForPubSubFailure() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  try {
    console.log('🧪 Test 4.3: Pub/Sub Publish Failure - Step 1/3\n');
    console.log('📝 Preparing test environment...\n');

    // Find first rule
    const rule = await prisma.rule.findFirst();

    if (!rule) {
      console.log('❌ No rule found. Please create a rule first.');
      return;
    }

    console.log('✅ Test rule ready:');
    console.log(`   Rule ID: ${rule.id}`);
    console.log(`   Name: ${rule.name}`);
    console.log(`   Current Version: ${rule.version}\n`);

    // Check current failed publishes
    const existingFailures = await prisma.pubSubFailure.findMany({
      where: { resolvedAt: null },
    });

    console.log(`📊 Current unresolved Pub/Sub failures: ${existingFailures.length}\n`);

    console.log('📋 NEXT STEPS:');
    console.log('   1. Stop the Pub/Sub emulator:');
    console.log('      docker ps  # Find the pub/sub container');
    console.log('      docker stop <pubsub-container-id>');
    console.log('   2. Verify emulator is stopped:');
    console.log('      docker ps | grep pubsub  # Should show nothing');
    console.log('   3. When emulator is stopped, run: npx ts-node test-pubsub-failure-step2.ts\n');

    console.log('💡 TIP: To find the container ID:');
    console.log('   docker ps | grep pubsub');
    console.log('   Look for a container with "google/cloud-sdk" image\n');

  } catch (error) {
    console.error('❌ Step 1 failed:', error);
  } finally {
    await prisma.onModuleDestroy();
  }
}

step1_PrepareForPubSubFailure();
