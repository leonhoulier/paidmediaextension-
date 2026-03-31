import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Standardized error response shape returned by all API endpoints.
 *
 * Example:
 * ```json
 * {
 *   "error": "User not found: alice@example.com",
 *   "code": "NOT_FOUND",
 *   "details": { "path": "/api/v1/admin/users/abc123" }
 * }
 * ```
 */
export interface ApiErrorResponse {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

/**
 * Map from HTTP status code to a machine-readable error code string.
 */
function httpStatusToCode(status: number): string {
  const codeMap: Record<number, string> = {
    [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
    [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
    [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
    [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
    [HttpStatus.CONFLICT]: 'CONFLICT',
    [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
    [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
    [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
    [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
  };
  return codeMap[status] ?? `HTTP_${status}`;
}

/**
 * Global HTTP exception filter for consistent error response format.
 *
 * Every error response from the API will use the standardized shape:
 * `{ error: string, code: string, details?: Record<string, unknown> }`
 *
 * This filter catches all exceptions (HttpException and unhandled errors)
 * and normalizes them into this shape.
 */
@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let errorMessage: string;
    let code: string;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = httpStatusToCode(status);
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        const rawMessage = responseObj['message'];

        // NestJS validation pipe returns message as string[]
        if (Array.isArray(rawMessage)) {
          errorMessage = rawMessage.join('; ');
          details = {
            validation_errors: rawMessage,
            path: request.url,
          };
        } else {
          errorMessage =
            typeof rawMessage === 'string'
              ? rawMessage
              : exception.message;
          details = { path: request.url };
        }
      } else {
        errorMessage = exception.message;
        details = { path: request.url };
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL_SERVER_ERROR';
      errorMessage = 'Internal server error';
      details = { path: request.url };

      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const responseBody: ApiErrorResponse = {
      error: errorMessage,
      code,
      ...(details ? { details } : {}),
    };

    response.status(status).json(responseBody);
  }
}
