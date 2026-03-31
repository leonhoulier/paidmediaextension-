import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { AccountsModule } from './accounts/accounts.module';
import { TeamsModule } from './teams/teams.module';
import { UsersModule } from './users/users.module';
import { RuleSetsModule } from './rule-sets/rule-sets.module';
import { RulesModule } from './rules/rules.module';
import { NamingTemplatesModule } from './naming-templates/naming-templates.module';
import { ComplianceDashboardModule } from './compliance/compliance-dashboard.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { RuleVersionsModule } from './rule-versions/rule-versions.module';

/**
 * Admin API module aggregating all admin CRUD resource modules
 */
@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    AccountsModule,
    TeamsModule,
    UsersModule,
    RuleSetsModule,
    RulesModule,
    NamingTemplatesModule,
    ComplianceDashboardModule,
    WebhooksModule,
    RuleVersionsModule,
  ],
})
export class AdminModule {}
