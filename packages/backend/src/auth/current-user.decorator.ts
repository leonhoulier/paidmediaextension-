import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from './auth.types';
import { ExtensionTokenRequest } from './auth.types';

/**
 * Parameter decorator to extract the authenticated Firebase user from request
 *
 * @example
 * ```
 * @Get('/profile')
 * getProfile(@CurrentUser() user: AuthenticatedUser) {
 *   return user;
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);

/**
 * Parameter decorator to extract the extension token user from request
 *
 * @example
 * ```
 * @Get('/rules')
 * getRules(@CurrentExtensionUser() user: ExtensionTokenUser) {
 *   return user;
 * }
 * ```
 */
export const CurrentExtensionUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<ExtensionTokenRequest>();
    return request.extensionUser;
  },
);
