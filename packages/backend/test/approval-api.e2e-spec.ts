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

describe('Approval Request API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let buyerExtensionToken: string;
  let buyerId: string;
  let approverId: string;
  let approverToken: string;
  let organizationId: string;
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

    // Create test organization
    const org = await prisma.organization.create({
      data: {
        name: 'Approval Test Org',
        slug: 'approval-test-org',
        plan: 'enterprise',
        settings: {},
      },
    });
    organizationId = org.id;

    // Create admin approver
    const approverEmail = `approver-${Date.now()}@test.com`;
    const approver = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: approverEmail,
        name: 'Test Approver',
        role: 'admin',
        teamIds: [],
      },
    });
    approverId = approver.id;
    approverToken = createLocalToken(approverId, approverEmail);

    // Create buyer with extension token
    buyerExtensionToken = 'buyer-approval-token-' + Date.now();
    const buyer = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `buyer-approval-${Date.now()}@test.com`,
        name: 'Test Buyer',
        role: 'buyer',
        teamIds: [],
        extensionToken: buyerExtensionToken,
      },
    });
    buyerId = buyer.id;

    // Create rule with second_approver enforcement
    const ruleSet = await prisma.ruleSet.create({
      data: {
        organizationId: org.id,
        name: 'Approval Test Rule Set',
        active: true,
      },
    });

    const rule = await prisma.rule.create({
      data: {
        ruleSetId: ruleSet.id,
        name: 'Second Approver Rule',
        platform: 'meta',
        entityLevel: 'campaign',
        ruleType: 'budget_enforcement',
        enforcement: 'second_approver',
        condition: {
          field: 'campaign.budget_value',
          operator: 'greater_than',
          value: 100000,
        },
        uiConfig: {
          injectionPoint: 'budget_section',
          style: 'warning',
          message: 'Budget over $100k requires approval',
          category: 'APPROVAL',
        },
      },
    });
    ruleId = rule.id;
  });

  afterAll(async () => {
    // Clean up in dependency order
    await prisma.approvalRequest.deleteMany({ where: { organizationId } });
    await prisma.rule.deleteMany({ where: { ruleSet: { organizationId } } });
    await prisma.ruleSet.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.close();
  });

  // ─── POST /api/v1/extension/approval/request ───────────────────────────

  describe('POST /api/v1/extension/approval/request', () => {
    let requestId: string;

    it('should create an approval request from extension', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/extension/approval/request')
        .set('X-Extension-Token', buyerExtensionToken)
        .send({
          ruleId,
          approverId,
          campaignSnapshot: {
            name: 'High Budget Campaign',
            budget: 150000,
            objective: 'CONVERSIONS',
          },
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.buyerId).toBe(buyerId);
      expect(response.body.approverId).toBe(approverId);
      expect(response.body.ruleId).toBe(ruleId);
      expect(response.body.status).toBe('pending');
      expect(response.body.entitySnapshot).toEqual({
        name: 'High Budget Campaign',
        budget: 150000,
        objective: 'CONVERSIONS',
      });
      requestId = response.body.id;
    });

    it('should reject request without extension token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/extension/approval/request')
        .send({
          ruleId,
          approverId,
          campaignSnapshot: { name: 'test' },
        })
        .expect(401);
    });

    it('should reject if approver does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/extension/approval/request')
        .set('X-Extension-Token', buyerExtensionToken)
        .send({
          ruleId,
          approverId: '00000000-0000-0000-0000-000000000000',
          campaignSnapshot: { name: 'test' },
        })
        .expect(404);
    });

    it('should reject if approver is not admin/super_admin', async () => {
      // Create a buyer user (not admin)
      const buyerApprover = await prisma.user.create({
        data: {
          organizationId,
          email: `buyer-approver-${Date.now()}@test.com`,
          name: 'Buyer Approver',
          role: 'buyer',
          teamIds: [],
        },
      });

      await request(app.getHttpServer())
        .post('/api/v1/extension/approval/request')
        .set('X-Extension-Token', buyerExtensionToken)
        .send({
          ruleId,
          approverId: buyerApprover.id,
          campaignSnapshot: { name: 'test' },
        })
        .expect(400);

      await prisma.user.delete({ where: { id: buyerApprover.id } });
    });

    it('should reject if buyer tries to approve their own request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/extension/approval/request')
        .set('X-Extension-Token', buyerExtensionToken)
        .send({
          ruleId,
          approverId: buyerId,
          campaignSnapshot: { name: 'test' },
        })
        .expect(400);
    });

    it('should reject if rule does not exist', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/extension/approval/request')
        .set('X-Extension-Token', buyerExtensionToken)
        .send({
          ruleId: '00000000-0000-0000-0000-000000000000',
          approverId,
          campaignSnapshot: { name: 'test' },
        })
        .expect(404);
    });

    afterAll(async () => {
      if (requestId) {
        await prisma.approvalRequest.deleteMany({
          where: { id: requestId },
        });
      }
    });
  });

  // ─── GET /api/v1/extension/approval/requests/:id ───────────────────────

  describe('GET /api/v1/extension/approval/requests/:id', () => {
    let requestId: string;

    beforeAll(async () => {
      const created = await prisma.approvalRequest.create({
        data: {
          organizationId,
          buyerId,
          approverId,
          ruleId,
          entitySnapshot: { name: 'Polling Test Campaign' },
          status: 'approval_pending',
        },
      });
      requestId = created.id;
    });

    afterAll(async () => {
      await prisma.approvalRequest.deleteMany({ where: { id: requestId } });
    });

    it('should get approval request for polling', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/extension/approval/requests/${requestId}`)
        .set('X-Extension-Token', buyerExtensionToken)
        .expect(200);

      expect(response.body.id).toBe(requestId);
      expect(response.body.status).toBe('pending');
    });

    it('should reject without extension token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/extension/approval/requests/${requestId}`)
        .expect(401);
    });

    it('should return 404 for non-existent request', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/extension/approval/requests/00000000-0000-0000-0000-000000000000')
        .set('X-Extension-Token', buyerExtensionToken)
        .expect(404);
    });
  });

  // ─── GET /api/v1/admin/approval/requests ────────────────────────────────

  describe('GET /api/v1/admin/approval/requests', () => {
    beforeAll(async () => {
      // Create multiple approval requests
      await prisma.approvalRequest.createMany({
        data: [
          {
            organizationId,
            buyerId,
            approverId,
            ruleId,
            entitySnapshot: { name: 'Request 1' },
            status: 'approval_pending',
          },
          {
            organizationId,
            buyerId,
            approverId,
            ruleId,
            entitySnapshot: { name: 'Request 2' },
            status: 'approved',
            resolvedAt: new Date(),
          },
          {
            organizationId,
            buyerId,
            approverId,
            ruleId,
            entitySnapshot: { name: 'Request 3' },
            status: 'rejected',
            resolvedAt: new Date(),
          },
        ],
      });
    });

    afterAll(async () => {
      await prisma.approvalRequest.deleteMany({
        where: { organizationId, buyerId },
      });
    });

    it('should list all approval requests for approver', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/approval/requests')
        .set('Authorization', `Bearer ${approverToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by status: pending', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/approval/requests?status=pending')
        .set('Authorization', `Bearer ${approverToken}`)
        .expect(200);

      expect(response.body.every((r: any) => r.status === 'pending')).toBe(true);
    });

    it('should filter by status: approved', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/approval/requests?status=approved')
        .set('Authorization', `Bearer ${approverToken}`)
        .expect(200);

      expect(response.body.every((r: any) => r.status === 'approved')).toBe(true);
    });

    it('should filter by status: rejected', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/approval/requests?status=rejected')
        .set('Authorization', `Bearer ${approverToken}`)
        .expect(200);

      expect(response.body.every((r: any) => r.status === 'rejected')).toBe(true);
    });

    it('should reject request without auth', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/approval/requests')
        .expect(401);
    });

    it('should reject viewer role', async () => {
      const viewerEmail = `viewer-approval-${Date.now()}@test.com`;
      await prisma.user.create({
        data: {
          organizationId,
          email: viewerEmail,
          name: 'Test Viewer',
          role: 'viewer',
          teamIds: [],
        },
      });
      const viewerToken = createLocalToken('viewer-uid', viewerEmail);

      await request(app.getHttpServer())
        .get('/api/v1/admin/approval/requests')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });
  });

  // ─── PUT /api/v1/admin/approval/requests/:id ────────────────────────────

  describe('PUT /api/v1/admin/approval/requests/:id', () => {
    let pendingRequestId: string;

    beforeEach(async () => {
      const created = await prisma.approvalRequest.create({
        data: {
          organizationId,
          buyerId,
          approverId,
          ruleId,
          entitySnapshot: { name: 'Update Test Campaign' },
          status: 'approval_pending',
        },
      });
      pendingRequestId = created.id;
    });

    afterEach(async () => {
      await prisma.approvalRequest.deleteMany({
        where: { id: pendingRequestId },
      });
    });

    it('should approve an approval request', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/admin/approval/requests/${pendingRequestId}`)
        .set('Authorization', `Bearer ${approverToken}`)
        .send({
          status: 'approved',
          comment: 'Budget justified for high-value campaign',
        })
        .expect(200);

      expect(response.body.status).toBe('approved');
      expect(response.body.comment).toBe('Budget justified for high-value campaign');
      expect(response.body.resolvedAt).toBeTruthy();
    });

    it('should reject an approval request', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/admin/approval/requests/${pendingRequestId}`)
        .set('Authorization', `Bearer ${approverToken}`)
        .send({
          status: 'rejected',
          comment: 'Budget too high without clear ROI plan',
        })
        .expect(200);

      expect(response.body.status).toBe('rejected');
      expect(response.body.comment).toBe('Budget too high without clear ROI plan');
      expect(response.body.resolvedAt).toBeTruthy();
    });

    it('should reject if user is not the assigned approver', async () => {
      // Create another admin
      const otherAdminEmail = `other-admin-${Date.now()}@test.com`;
      const otherAdmin = await prisma.user.create({
        data: {
          organizationId,
          email: otherAdminEmail,
          name: 'Other Admin',
          role: 'admin',
          teamIds: [],
        },
      });
      const otherAdminToken = createLocalToken(otherAdmin.id, otherAdminEmail);

      await request(app.getHttpServer())
        .put(`/api/v1/admin/approval/requests/${pendingRequestId}`)
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .send({ status: 'approved' })
        .expect(403);

      await prisma.user.delete({ where: { id: otherAdmin.id } });
    });

    it('should reject if request already resolved', async () => {
      // First approval
      await request(app.getHttpServer())
        .put(`/api/v1/admin/approval/requests/${pendingRequestId}`)
        .set('Authorization', `Bearer ${approverToken}`)
        .send({ status: 'approved' })
        .expect(200);

      // Try to update again
      await request(app.getHttpServer())
        .put(`/api/v1/admin/approval/requests/${pendingRequestId}`)
        .set('Authorization', `Bearer ${approverToken}`)
        .send({ status: 'rejected' })
        .expect(400);
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/admin/approval/requests/${pendingRequestId}`)
        .send({ status: 'approved' })
        .expect(401);
    });

    it('should reject invalid status', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/admin/approval/requests/${pendingRequestId}`)
        .set('Authorization', `Bearer ${approverToken}`)
        .send({ status: 'invalid' })
        .expect(400);
    });
  });

  // ─── DELETE /api/v1/extension/approval/requests/:id ────────────────────

  describe('DELETE /api/v1/extension/approval/requests/:id', () => {
    let pendingRequestId: string;

    beforeEach(async () => {
      const created = await prisma.approvalRequest.create({
        data: {
          organizationId,
          buyerId,
          approverId,
          ruleId,
          entitySnapshot: { name: 'Cancel Test Campaign' },
          status: 'approval_pending',
        },
      });
      pendingRequestId = created.id;
    });

    afterEach(async () => {
      await prisma.approvalRequest.deleteMany({
        where: { id: pendingRequestId },
      });
    });

    it('should cancel a pending approval request', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/extension/approval/requests/${pendingRequestId}`)
        .set('X-Extension-Token', buyerExtensionToken)
        .expect(200);

      expect(response.body.deleted).toBe(true);

      // Verify it was soft-deleted (status changed to rejected)
      const updated = await prisma.approvalRequest.findUnique({
        where: { id: pendingRequestId },
      });
      expect(updated?.status).toBe('rejected');
      expect(updated?.comment).toBe('Cancelled by buyer');
    });

    it('should reject cancelling already resolved request', async () => {
      // Approve first
      await prisma.approvalRequest.update({
        where: { id: pendingRequestId },
        data: {
          status: 'approved',
          resolvedAt: new Date(),
        },
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/extension/approval/requests/${pendingRequestId}`)
        .set('X-Extension-Token', buyerExtensionToken)
        .expect(400);
    });

    it('should reject without extension token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/extension/approval/requests/${pendingRequestId}`)
        .expect(401);
    });

    it('should return 404 for non-existent request', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/extension/approval/requests/00000000-0000-0000-0000-000000000000')
        .set('X-Extension-Token', buyerExtensionToken)
        .expect(404);
    });
  });
});
