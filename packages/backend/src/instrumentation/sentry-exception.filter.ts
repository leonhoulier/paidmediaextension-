/**
 * Sentry Exception Filter — Backend (NestJS)
 *
 * Global exception filter that captures unhandled exceptions in Sentry
 * before the standard NestJS error response is sent to the client.
 *
 * This works alongside the existing GlobalHttpExceptionFilter — it captures
 * the error in Sentry and then re-throws so the existing filter handles
 * the HTTP response.
 */

import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { captureException } from './sentry';

/**
 * Filter that captures all non-4xx exceptions in Sentry.
 *
 * 4xx errors (client errors) are not sent to Sentry because they are
 * expected business-logic responses (validation, auth, not found).
 * Only 5xx errors and unhandled exceptions are captured.
 */
@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ method: string; url: string; user?: { uid?: string } }>();

    // Only capture 5xx / unhandled errors in Sentry (skip 4xx client errors)
    const isClientError =
      exception instanceof HttpException && exception.getStatus() < 500;

    if (!isClientError) {
      captureException(exception, {
        method: request?.method,
        url: request?.url,
        userId: request?.user?.uid,
      });

      this.logger.error(
        `Unhandled exception captured by Sentry: ${String(exception)}`,
      );
    }

    // Re-throw so the existing GlobalHttpExceptionFilter handles the response
    throw exception;
  }
}
