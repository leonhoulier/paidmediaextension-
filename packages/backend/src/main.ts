import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { SentryExceptionFilter } from './instrumentation/sentry-exception.filter';
import { initSentry } from './instrumentation/sentry';
import { initPostHog } from './instrumentation/posthog';
import { initFeatureFlags } from './instrumentation/feature-flags';

// Initialize production instrumentation before NestJS bootstraps
initSentry();
initPostHog();
initFeatureFlags();

/**
 * Bootstrap the NestJS application
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Enable global validation pipe with class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Enable Sentry exception filter (captures 5xx in Sentry before the HTTP filter responds)
  app.useGlobalFilters(new SentryExceptionFilter());

  // Enable global exception filter for standardized error responses
  // All errors return: { error: string, code: string, details?: object }
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  // Enable CORS for admin portal and extension
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Extension-Token',
    ],
    credentials: true,
  });

  // Graceful shutdown on SIGTERM (Cloud Run sends SIGTERM)
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application listening on port ${port}`);
  logger.log(`Health check available at GET /healthz`);
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', err);
  process.exit(1);
});
