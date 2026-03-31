import {
  Controller,
  Post,
  Body,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { PairService, PairExtensionResult } from './pair.service';
import { PairExtensionDto } from './dto/pair-extension.dto';

/**
 * Controller for extension pairing endpoint.
 *
 * POST /api/v1/extension/pair
 *
 * Uses FirebaseAuthGuard to verify the request is from an authenticated user
 * (in local dev mode, the base64 mock token is accepted).
 *
 * The extension sends email/invite_code to pair itself with a user account,
 * and receives an extension_token + organization info in response.
 */
@Controller('api/v1/extension')
@UseGuards(FirebaseAuthGuard)
export class PairController {
  private readonly logger = new Logger(PairController.name);

  constructor(private readonly pairService: PairService) {}

  /**
   * POST /api/v1/extension/pair
   *
   * Accepts: { invite_code?: string, email?: string, org_slug?: string }
   * Returns: { extension_token: string, organization: { id, name, slug } }
   */
  @Post('pair')
  async pair(@Body() dto: PairExtensionDto): Promise<PairExtensionResult> {
    this.logger.debug(
      `Extension pairing request: email=${dto.email}, org_slug=${dto.org_slug}, has_invite=${!!dto.invite_code}`,
    );
    return this.pairService.pair(dto);
  }
}
