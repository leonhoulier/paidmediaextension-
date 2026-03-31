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

/**
 * Helper to create a base64 local auth token
 */
function createLocalToken(uid: string, email: string): string {
  return Buffer.from(JSON.stringify({ uid, email })).toString('base64');
}

describe('Admin API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let organizationId: string;
  let adminEmail: string;

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

    // Create test organization and admin user
    const org = await prisma.organization.create({
      data: {
        name: 'Admin Test Org',
        slug: 'admin-test-org',
        plan: 'enterprise',
        settings: {},
      },
    });
    organizationId = org.id;

    adminEmail = `admin-test-${Date.now()}@test.com`;
    await prisma.user.create({
      data: {
        organizationId: org.id,
        email: adminEmail,
        name: 'Test Admin',
        role: 'admin',
        teamIds: [],
      },
    });

    adminToken = createLocalToken('admin-uid', adminEmail);
  });

  afterAll(async () => {
    // Clean up in dependency order
    await prisma.complianceEvent.deleteMany({ where: { organizationId } });
    await prisma.namingTemplate.deleteMany({
      where: { rule: { ruleSet: { organizationId } } },
    });
    await prisma.rule.deleteMany({ where: { ruleSet: { organizationId } } });
    await prisma.ruleSet.deleteMany({ where: { organizationId } });
    await prisma.adAccount.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.team.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.close();
  });

  // ─── Health Check ───────────────────────────────────────────────────────

  describe('GET /healthz', () => {
    it('should return ok', async () => {
      const response = await request(app.getHttpServer())
        .get('/healthz')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // ─── Admin Auth ─────────────────────────────────────────────────────────

  describe('Admin Auth', () => {
    it('should reject requests without auth header', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/accounts')
        .expect(401);
    });

    it('should reject requests with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/accounts')
        .set('Authorization', 'Bearer invalid')
        .expect(401);
    });
  });

  // ─── Accounts CRUD ──────────────────────────────────────────────────────

  describe('Accounts CRUD', () => {
    let accountId: string;

    it('should create an ad account', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          platform: 'meta',
          platformAccountId: 'act_admin_test',
          accountName: 'Admin Test Account',
          market: 'US',
          region: 'NA',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.accountName).toBe('Admin Test Account');
      accountId = response.body.id;
    });

    it('should list all accounts for the organization', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should get a single account', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/admin/accounts/${accountId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.id).toBe(accountId);
    });

    it('should update an account', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/admin/accounts/${accountId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ accountName: 'Updated Account Name' })
        .expect(200);

      expect(response.body.accountName).toBe('Updated Account Name');
    });

    it('should delete an account', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/admin/accounts/${accountId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.deleted).toBe(true);
    });
  });

  // ─── Teams CRUD ─────────────────────────────────────────────────────────

  describe('Teams CRUD', () => {
    let teamId: string;

    it('should create a team', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/teams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'New Test Team',
          description: 'A test team',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('New Test Team');
      teamId = response.body.id;
    });

    it('should list all teams', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/teams')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should update a team', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/admin/teams/${teamId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Team Name' })
        .expect(200);

      expect(response.body.name).toBe('Updated Team Name');
    });

    it('should delete a team', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/admin/teams/${teamId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  // ─── Users CRUD ─────────────────────────────────────────────────────────

  describe('Users CRUD', () => {
    let userId: string;

    it('should create a user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: `new-buyer-${Date.now()}@test.com`,
          name: 'New Buyer',
          role: 'buyer',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.role).toBe('buyer');
      // Buyer should get an extension token
      expect(response.body.extensionToken).toBeTruthy();
      userId = response.body.id;
    });

    it('should list users', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
    });

    it('should delete a user', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/admin/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  // ─── Rule Sets CRUD ─────────────────────────────────────────────────────

  describe('Rule Sets CRUD', () => {
    let ruleSetId: string;

    it('should create a rule set', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/rule-sets')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Rule Set',
          description: 'For testing',
          active: true,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      ruleSetId = response.body.id;
    });

    it('should list rule sets', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/rule-sets')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should update a rule set and increment version', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/admin/rule-sets/${ruleSetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Rule Set' })
        .expect(200);

      expect(response.body.name).toBe('Updated Rule Set');
      expect(response.body.version).toBe(2);
    });

    it('should delete a rule set', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/admin/rule-sets/${ruleSetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  // ─── Rules CRUD ─────────────────────────────────────────────────────────

  describe('Rules CRUD', () => {
    let ruleSetId: string;
    let ruleId: string;

    beforeAll(async () => {
      const ruleSet = await prisma.ruleSet.create({
        data: {
          organizationId,
          name: 'Rules Test Set',
          active: true,
        },
      });
      ruleSetId = ruleSet.id;
    });

    afterAll(async () => {
      await prisma.rule.deleteMany({ where: { ruleSetId } });
      await prisma.ruleSet.delete({ where: { id: ruleSetId } });
    });

    it('should create a rule', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ruleSetId,
          name: 'Test Budget Rule',
          entityLevel: 'campaign',
          ruleType: 'budget_enforcement',
          enforcement: 'warning',
          condition: {
            field: 'campaign.budget_value',
            operator: 'in_range',
            value: { min: 100, max: 50000 },
          },
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Test Budget Rule');
      ruleId = response.body.id;

      // Should have published to Pub/Sub
      expect(mockPubSubService.publishRuleUpdate).toHaveBeenCalled();
    });

    it('should list rules', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should get a single rule', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/admin/rules/${ruleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.id).toBe(ruleId);
    });

    it('should update a rule and increment version', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/admin/rules/${ruleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Budget Rule' })
        .expect(200);

      expect(response.body.name).toBe('Updated Budget Rule');
      expect(response.body.version).toBe(2);
    });

    it('should reject invalid rule data', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          // missing required fields
          name: 'Invalid Rule',
        })
        .expect(400);
    });
  });

  // ─── Naming Templates CRUD ──────────────────────────────────────────────

  describe('Naming Templates CRUD', () => {
    let ruleSetId: string;
    let ruleId: string;
    let templateId: string;

    beforeAll(async () => {
      const ruleSet = await prisma.ruleSet.create({
        data: {
          organizationId,
          name: 'Naming Test Set',
          active: true,
        },
      });
      ruleSetId = ruleSet.id;

      const rule = await prisma.rule.create({
        data: {
          ruleSetId,
          name: 'Naming Rule',
          platform: 'meta',
          entityLevel: 'campaign',
          ruleType: 'naming_convention',
          enforcement: 'blocking',
          condition: {
            field: 'campaign.name',
            operator: 'matches_template',
          },
          uiConfig: {},
        },
      });
      ruleId = rule.id;
    });

    afterAll(async () => {
      await prisma.namingTemplate.deleteMany({ where: { ruleId } });
      await prisma.rule.deleteMany({ where: { ruleSetId } });
      await prisma.ruleSet.delete({ where: { id: ruleSetId } });
    });

    it('should create a naming template', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/naming-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ruleId,
          segments: [
            { label: 'Region', type: 'enum', separator: '_', required: true },
            { label: 'Country', type: 'enum', separator: '_', required: true },
          ],
          separator: '_',
          example: 'NA_US',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      templateId = response.body.id;
    });

    it('should list naming templates', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/naming-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should update a naming template', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/admin/naming-templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ separator: '-' })
        .expect(200);

      expect(response.body.separator).toBe('-');
    });

    it('should delete a naming template', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/admin/naming-templates/${templateId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  // ─── Role-based Access ──────────────────────────────────────────────────

  describe('Role-based Access', () => {
    let viewerToken: string;

    beforeAll(async () => {
      const viewerEmail = `viewer-${Date.now()}@test.com`;
      await prisma.user.create({
        data: {
          organizationId,
          email: viewerEmail,
          name: 'Test Viewer',
          role: 'viewer',
          teamIds: [],
        },
      });
      viewerToken = createLocalToken('viewer-uid', viewerEmail);
    });

    it('should reject viewer from admin endpoints', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/accounts')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });

    it('should reject viewer from creating resources', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/teams')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'Unauthorized Team' })
        .expect(403);
    });
  });
});
