import {
  Controller,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { PairService, PairExtensionResult } from './pair.service';
import { PairExtensionDto } from './dto/pair-extension.dto';

/**
 * Controller for extension pairing endpoints.
 *
 * Two pairing modes:
 * 1. POST /api/v1/extension/pair — Firebase-authenticated (email + org_slug)
 * 2. POST /api/v1/extension/pair-public — invite code only (no auth required)
 */
@Controller('api/v1/extension')
export class PairController {
  private readonly logger = new Logger(PairController.name);

  constructor(private readonly pairService: PairService) {}

  /**
   * POST /api/v1/extension/pair
   *
   * Firebase-authenticated pairing. Used when the user is logged into the
   * admin portal and pairs from there.
   */
  @Post('pair')
  @UseGuards(FirebaseAuthGuard)
  async pair(@Body() dto: PairExtensionDto): Promise<PairExtensionResult> {
    this.logger.debug(
      `Extension pairing request: email=${dto.email}, org_slug=${dto.org_slug}, has_invite=${!!dto.invite_code}`,
    );
    return this.pairService.pair(dto);
  }

  /**
   * POST /api/v1/extension/pair-public
   *
   * Public pairing endpoint. Accepts an invite code (extension token) directly
   * without Firebase auth. The invite code IS the authentication — it's a secret
   * token generated in the admin portal for each user.
   */
  @Post('pair-public')
  async pairPublic(
    @Body() body: { invite_code: string },
  ): Promise<PairExtensionResult> {
    if (!body.invite_code) {
      throw new BadRequestException('invite_code is required');
    }
    this.logger.debug(`Public extension pairing with invite code`);
    return this.pairService.pair({ invite_code: body.invite_code });
  }
}
