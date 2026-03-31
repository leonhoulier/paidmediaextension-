import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';

/**
 * Extension Token Service
 *
 * Handles token lifecycle:
 * - Token generation with expiry (90 days)
 * - Token refresh (when within 7 days of expiry)
 * - Token revocation
 * - Token validation (checks revoked_at and expires_at)
 */
@Injectable()
export class ExtensionTokenService {
  private readonly logger = new Logger(ExtensionTokenService.name);

  /** Token validity period: 90 days */
  private readonly TOKEN_VALIDITY_DAYS = 90;

  /** Refresh threshold: 7 days before expiry */
  private readonly REFRESH_THRESHOLD_DAYS = 7;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a new extension token with expiry
   */
  async generateToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.TOKEN_VALIDITY_DAYS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        extensionToken: token,
        tokenExpiresAt: expiresAt,
        tokenRevokedAt: null, // Clear any previous revocation
      },
    });

    this.logger.log(`Generated new token for user ${userId}, expires at ${expiresAt.toISOString()}`);

    return { token, expiresAt };
  }

  /**
   * Refresh an existing token
   *
   * Validates the old token, then generates a new one.
   * Returns error if old token is expired or revoked.
   */
  async refreshToken(oldToken: string): Promise<{ token: string; expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({
      where: { extensionToken: oldToken },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    // Check if token is revoked
    if (user.tokenRevokedAt) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Check if token is expired
    if (user.tokenExpiresAt && user.tokenExpiresAt < new Date()) {
      throw new UnauthorizedException('Token has expired');
    }

    // Generate new token
    const { token, expiresAt } = await this.generateToken(user.id);

    this.logger.log(`Refreshed token for user ${user.id}, new expiry: ${expiresAt.toISOString()}`);

    return { token, expiresAt };
  }

  /**
   * Revoke a user's extension token
   */
  async revokeToken(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        tokenRevokedAt: new Date(),
      },
    });

    this.logger.log(`Revoked token for user ${userId}`);
  }

  /**
   * Validate a token
   *
   * Checks if token exists, is not revoked, and has not expired.
   * Returns user info if valid, throws UnauthorizedException if invalid.
   */
  async validateToken(token: string): Promise<{
    userId: string;
    organizationId: string;
    expiresAt: Date | null;
    shouldRefresh: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { extensionToken: token },
      select: {
        id: true,
        organizationId: true,
        tokenExpiresAt: true,
        tokenRevokedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    // Check revocation
    if (user.tokenRevokedAt) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Check expiry
    if (user.tokenExpiresAt && user.tokenExpiresAt < new Date()) {
      throw new UnauthorizedException('Token has expired');
    }

    // Determine if token should be refreshed soon
    const shouldRefresh = this.shouldRefreshToken(user.tokenExpiresAt);

    return {
      userId: user.id,
      organizationId: user.organizationId,
      expiresAt: user.tokenExpiresAt,
      shouldRefresh,
    };
  }

  /**
   * Check if a token should be refreshed
   *
   * Returns true if token expires within 7 days.
   */
  private shouldRefreshToken(expiresAt: Date | null): boolean {
    if (!expiresAt) return false;

    const daysUntilExpiry =
      (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    return daysUntilExpiry <= this.REFRESH_THRESHOLD_DAYS;
  }
}
