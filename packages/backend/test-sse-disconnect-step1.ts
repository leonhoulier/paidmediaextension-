import { PrismaService } from './src/prisma/prisma.service';

async function step1_PrepareRule() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();

  try {
    console.log('🧪 Test 4.2: SSE Reconnection - Step 1/4\n');
    console.log('📝 Preparing test rule...\n');

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

    console.log('📋 NEXT STEPS:');
    console.log('   1. Open extension service worker console (chrome://extensions → service worker)');
    console.log('   2. Verify SSE connection shows: "SSE connection established"');
    console.log('   3. Stop the backend: Go to backend terminal and press Ctrl+C');
    console.log('   4. Watch extension console for: "SSE connection error" and reconnection attempts');
    console.log('   5. When you see reconnection attempts, run: npx ts-node test-sse-disconnect-step2.ts\n');

  } catch (error) {
    console.error('❌ Step 1 failed:', error);
  } finally {
    await prisma.onModuleDestroy();
  }
}

step1_PrepareRule();
