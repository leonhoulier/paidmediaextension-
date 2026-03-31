import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PubSubService } from '../src/pubsub/pubsub.service';

/**
 * Mock PubSubService to avoid real Pub/Sub connections during tests
 */
const mockPubSubService = {
  onModuleInit: jest.fn(),
  publishRuleUpdate: jest.fn().mockResolvedValue(undefined),
};

describe('Extension API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let extensionToken: string;
  let organizationId: string;
  let adAccountId: string;
  let ruleId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PubSubService)
      .useValue(mockPubSubService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Seed test data
    const org = await prisma.organization.create({
      data: {
        name: 'Test Org',
        slug: 'test-org-ext',
        plan: 'pro',
        settings: {},
      },
    });
    organizationId = org.id;

    const team = await prisma.team.create({
      data: {
        organizationId: org.id,
        name: 'Test Team',
        memberIds: [],
      },
    });

    extensionToken = 'test-extension-token-' + Date.now();
    await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `buyer-ext-${Date.now()}@test.com`,
        name: 'Test Buyer',
        role: 'buyer',
        teamIds: [team.id],
        extensionToken,
      },
    });

    const account = await prisma.adAccount.create({
      data: {
        organizationId: org.id,
        platform: 'meta',
        platformAccountId: 'act_test_ext',
        accountName: 'Test Meta Account',
        market: 'US',
        region: 'NA',
        active: true,
      },
    });
    adAccountId = account.id;

    const ruleSet = await prisma.ruleSet.create({
      data: {
        organizationId: org.id,
        name: 'Test Rule Set',
        accountIds: [account.id],
        teamIds: [team.id],
        active: true,
      },
    });

    const rule = await prisma.rule.create({
      data: {
        ruleSetId: ruleSet.id,
        name: 'Test Rule',
        platform: 'meta',
        entityLevel: 'campaign',
        ruleType: 'budget_enforcement',
        enforcement: 'warning',
        condition: {
          field: 'campaign.budget_value',
          operator: 'in_range',
          value: { min: 100, max: 50000 },
        },
        uiConfig: {
          injectionPoint: 'budget_section',
          style: 'error_banner',
          message: 'Budget must be between $100 and $50,000',
          category: 'TEST - CAMPAIGN',
        },
        priority: 1,
        enabled: true,
      },
    });
    ruleId = rule.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.complianceEvent.deleteMany({
      where: { organizationId },
    });
    await prisma.rule.deleteMany({
      where: { ruleSet: { organizationId } },
    });
    await prisma.ruleSet.deleteMany({ where: { organizationId } });
    await prisma.adAccount.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.team.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.close();
  });

  // ─── GET /api/v1/rules ──────────────────────────────────────────────────

  describe('GET /api/v1/rules', () => {
    it('should return rules with valid extension token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/rules')
        .set('X-Extension-Token', extensionToken)
        .expect(200);

      expect(response.body).toHaveProperty('rules');
      expect(response.body).toHaveProperty('namingTemplates');
      expect(response.body).toHaveProperty('version');
      expect(Array.isArray(response.body.rules)).toBe(true);
      expect(response.body.rules.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter rules by platform', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/rules?platform=google_ads')
        .set('X-Extension-Token', extensionToken)
        .expect(200);

      // The test rule is meta only, so no google_ads rules
      expect(response.body.rules.length).toBe(0);
    });

    it('should reject request without extension token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rules')
        .expect(401);
    });

    it('should reject request with invalid extension token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rules')
        .set('X-Extension-Token', 'invalid-token')
        .expect(401);
    });
  });

  // ─── GET /api/v1/rules/version ──────────────────────────────────────────

  describe('GET /api/v1/rules/version', () => {
    it('should return version hash and lastUpdated', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/rules/version')
        .set('X-Extension-Token', extensionToken)
        .expect(200);

      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('lastUpdated');
      expect(typeof response.body.version).toBe('string');
    });
  });

  // ─── POST /api/v1/compliance/events ─────────────────────────────────────

  describe('POST /api/v1/compliance/events', () => {
    it('should create compliance events in batch', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/compliance/events')
        .set('X-Extension-Token', extensionToken)
        .send({
          events: [
            {
              adAccountId,
              platform: 'meta',
              entityLevel: 'campaign',
              entityName: 'NA_US_Brand_Test_20260201',
              ruleId,
              status: 'passed',
              fieldValue: '5000',
              expectedValue: '100-50000',
            },
            {
              adAccountId,
              platform: 'meta',
              entityLevel: 'campaign',
              entityName: 'NA_US_Brand_Test_20260201',
              ruleId,
              status: 'violated',
              fieldValue: '99',
              expectedValue: '100-50000',
            },
          ],
        })
        .expect(201);

      expect(response.body).toEqual({ created: 2 });
    });

    it('should reject empty events array', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/compliance/events')
        .set('X-Extension-Token', extensionToken)
        .send({ events: [] })
        .expect(400);
    });

    it('should reject events with invalid fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/compliance/events')
        .set('X-Extension-Token', extensionToken)
        .send({
          events: [
            {
              adAccountId: 'not-a-uuid',
              platform: 'invalid',
              entityLevel: 'campaign',
              entityName: 'test',
              ruleId,
              status: 'passed',
            },
          ],
        })
        .expect(400);
    });
  });

  // ─── POST /api/v1/compliance/comment ────────────────────────────────────

  describe('POST /api/v1/compliance/comment', () => {
    it('should create a comment event', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/compliance/comment')
        .set('X-Extension-Token', extensionToken)
        .send({
          ruleId,
          entityName: 'NA_US_Brand_CommentTest_20260201',
          comment: 'This campaign needs an open-ended schedule for always-on brand presence.',
        })
        .expect(201);

      expect(response.body).toHaveProperty('eventId');
      expect(typeof response.body.eventId).toBe('string');
    });

    it('should reject comment with missing fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/compliance/comment')
        .set('X-Extension-Token', extensionToken)
        .send({
          ruleId,
          // missing entityName and comment
        })
        .expect(400);
    });
  });
});
