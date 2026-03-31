import { Module } from '@nestjs/common';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { PairController } from './pair.controller';
import { PairService } from './pair.service';
import { RulesStreamController } from './rules-stream.controller';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Module for Chrome extension API endpoints.
 *
 * Includes:
 * - Rules API (GET /api/v1/rules) — extension token auth
 * - Compliance API (POST /api/v1/compliance/*) — extension token auth
 * - Approval API (POST /api/v1/extension/approval/*) — extension token auth + admin endpoints
 * - Pair API (POST /api/v1/extension/pair) — Firebase/local auth
 * - Rules Stream SSE (GET /api/v1/extension/rules-stream) — extension token auth
 */
@Module({
  imports: [AuthModule],
  controllers: [
    RulesController,
    ComplianceController,
    ApprovalController,
    PairController,
    RulesStreamController,
  ],
  providers: [RulesService, ComplianceService, ApprovalService, PairService],
})
export class ExtensionModule {}
