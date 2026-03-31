import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Response from pairing an extension
 */
export interface PairExtensionResult {
  extension_token: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}

/**
 * Service for pairing Chrome extensions with user accounts.
 *
 * Pairing flow:
 * 1. Extension sends email + org_slug (or invite_code)
 * 2. Service looks up the user and organization
 * 3. Generates or returns existing extension token
 * 4. Returns token + org info for the extension to store
 */
@Injectable()
export class PairService {
  private readonly logger = new Logger(PairService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pair an extension with a user account.
   */
  async pair(params: {
    invite_code?: string;
    email?: string;
    org_slug?: string;
  }): Promise<PairExtensionResult> {
    const { invite_code, email, org_slug } = params;

    // Must provide at least email or invite_code
    if (!email && !invite_code) {
      throw new BadRequestException(
        'Either email or invite_code must be provided',
      );
    }

    // If invite_code is provided, look up by invite code
    // For now, invite_code is the extension_token itself (simple pairing)
    if (invite_code) {
      return this.pairByInviteCode(invite_code);
    }

    // Otherwise, pair by email + optional org_slug
    if (email) {
      return this.pairByEmail(email, org_slug);
    }

    throw new BadRequestException('Invalid pairing request');
  }

  /**
   * Pair using an invite code (which is currently the extension token).
   * In the future this could be a separate invite mechanism.
   */
  private async pairByInviteCode(inviteCode: string): Promise<PairExtensionResult> {
    // Look up user by extension token
    const user = await this.prisma.user.findUnique({
      where: { extensionToken: inviteCode },
      include: { organization: true },
    });

    if (!user) {
      throw new NotFoundException('Invalid invite code');
    }

    this.logger.log(`Extension paired via invite code for user ${user.email}`);

    return {
      extension_token: user.extensionToken!,
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
      },
    };
  }

  /**
   * Pair using email and optional org slug.
   * Generates extension token if the user doesn't have one.
   */
  private async pairByEmail(
    email: string,
    orgSlug?: string,
  ): Promise<PairExtensionResult> {
    // Look up user by email
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user) {
      throw new NotFoundException(`User not found: ${email}`);
    }

    // If org_slug provided, verify it matches the user's organization
    if (orgSlug && user.organization.slug !== orgSlug) {
      throw new BadRequestException(
        `User ${email} does not belong to organization ${orgSlug}`,
      );
    }

    // Generate extension token if the user doesn't have one
    let extensionToken = user.extensionToken;
    if (!extensionToken) {
      extensionToken = randomBytes(32).toString('hex');
      await this.prisma.user.update({
        where: { id: user.id },
        data: { extensionToken },
      });
      this.logger.log(`Generated new extension token for user ${email}`);
    }

    this.logger.log(`Extension paired for user ${email} (org: ${user.organization.slug})`);

    return {
      extension_token: extensionToken,
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
      },
    };
  }
}
