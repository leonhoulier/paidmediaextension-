import { PrismaClient } from '@prisma/client';
import { PubSub } from '@google-cloud/pubsub';

const prisma = new PrismaClient();

async function testPubSubTelemetry() {
  try {
    // Find an existing organization
    const org = await prisma.organization.findFirst();
    if (!org) {
      console.log('No organization found - creating one...');
      const newOrg = await prisma.organization.create({
        data: {
          name: 'Test Org',
          slug: 'test-org',
        },
      });
      console.log('Created organization:', newOrg.id);
    }

    const orgId = org?.id || (await prisma.organization.findFirst())!.id;

    // Find an existing rule set or create one
    let ruleSet = await prisma.ruleSet.findFirst({ where: { organizationId: orgId } });
    if (!ruleSet) {
      ruleSet = await prisma.ruleSet.create({
        data: {
          organizationId: orgId,
          name: 'Test Rule Set',
          description: 'For testing Pub/Sub telemetry',
        },
      });
    }

    // Create a test rule
    const rule = await prisma.rule.create({
      data: {
        ruleSetId: ruleSet.id,
        name: 'Test Telemetry Rule',
        description: 'Testing Pub/Sub telemetry',
        entityLevel: 'campaign',
        ruleType: 'field_validation',
        enforcement: 'warning',
        condition: {
          fieldPath: 'campaign.name',
          operator: 'CONTAINS',
          value: 'test',
        },
      },
    });

    console.log('✅ Rule created:', rule.id);

    // Manually trigger Pub/Sub publish (simulating what RulesService would do)
    const pubsub = new PubSub({ projectId: 'local-dev' });
    const topic = pubsub.topic('rules-updated');
    
    const message = {
      version: Date.now().toString(),
      accountIdsAffected: ['test-account-123'],
      timestamp: new Date().toISOString(),
    };

    console.log('📤 Publishing to Pub/Sub...');
    const messageId = await topic.publishMessage({
      data: Buffer.from(JSON.stringify(message)),
      attributes: { eventType: 'rules_updated' },
    });

    console.log('✅ Published message ID:', messageId);
    console.log('👀 Check backend logs for telemetry output!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPubSubTelemetry();
