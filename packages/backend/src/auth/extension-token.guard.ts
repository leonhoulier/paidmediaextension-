import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExtensionTokenRequest, ExtensionTokenUser } from './auth.types';

/**
 * Guard that validates the X-Extension-Token header against the users table.
 * Extension tokens are scoped to a single buyer + organization.
 */
@Injectable()
export class ExtensionTokenGuard implements CanActivate {
  private readonly logger = new Logger(ExtensionTokenGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ExtensionTokenRequest>();
    // Accept token from header (regular API calls) or query param (SSE connections)
    const token =
      (request.headers['x-extension-token'] as string | undefined) ||
      (request.query.token as string | undefined);

    if (!token) {
      throw new UnauthorizedException('Missing X-Extension-Token header or token query parameter');
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { extensionToken: token },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid extension token');
      }

      // Update last active timestamp
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastActiveAt: new Date() },
      });

      const extensionUser: ExtensionTokenUser = {
        userId: user.id,
        email: user.email,
        organizationId: user.organizationId,
        teamIds: user.teamIds,
        name: user.name,
      };

      request.extensionUser = extensionUser;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error('Extension token validation failed', err);
      throw new UnauthorizedException('Extension token validation failed');
    }
  }
}
