import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest, AuthenticatedUser } from './auth.types';

/**
 * Guard that validates Firebase ID tokens from the Authorization: Bearer header.
 * In local dev mode (ALLOW_LOCAL_AUTH=true), accepts a simple JSON payload
 * encoded as base64 in place of a real Firebase token.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);
  private firebaseApp: admin.app.App | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const allowLocal = this.configService.get<boolean>('allowLocalAuth');
    if (!allowLocal) {
      this.initFirebase();
    }
  }

  private initFirebase(): void {
    if (admin.apps.length === 0) {
      this.firebaseApp = admin.initializeApp({
        projectId: this.configService.get<string>('firebaseProjectId'),
      });
    } else {
      this.firebaseApp = admin.apps[0] ?? null;
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);
    const allowLocal = this.configService.get<boolean>('allowLocalAuth');

    if (allowLocal) {
      return this.handleLocalAuth(request, token);
    }

    return this.handleFirebaseAuth(request, token);
  }

  /**
   * Local development auth bypass: token is base64-encoded JSON
   * Format: base64({ uid, email })
   */
  private async handleLocalAuth(
    request: AuthenticatedRequest,
    token: string,
  ): Promise<boolean> {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8')) as {
        uid?: string;
        email?: string;
      };

      if (!decoded.uid || !decoded.email) {
        throw new UnauthorizedException('Local auth token must contain uid and email');
      }

      // Look up user in database
      const user = await this.prisma.user.findUnique({
        where: { email: decoded.email },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const authUser: AuthenticatedUser = {
        uid: decoded.uid,
        email: user.email,
        organizationId: user.organizationId,
        role: user.role,
        name: user.name,
      };

      request.user = authUser;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error('Local auth failed', err);
      throw new UnauthorizedException('Invalid local auth token');
    }
  }

  /**
   * Production Firebase JWT verification
   */
  private async handleFirebaseAuth(
    request: AuthenticatedRequest,
    token: string,
  ): Promise<boolean> {
    try {
      if (!this.firebaseApp) {
        this.initFirebase();
      }

      const decodedToken = await admin.auth().verifyIdToken(token);

      // Look up user in database
      const user = await this.prisma.user.findUnique({
        where: { email: decodedToken.email ?? '' },
      });

      if (!user) {
        throw new UnauthorizedException('User not found in organization');
      }

      const authUser: AuthenticatedUser = {
        uid: decodedToken.uid,
        email: user.email,
        organizationId: user.organizationId,
        role: user.role,
        name: user.name,
      };

      request.user = authUser;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error('Firebase auth failed', err);
      throw new UnauthorizedException('Invalid Firebase token');
    }
  }
}
