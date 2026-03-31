/**
 * Application configuration factory for @nestjs/config
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  firebaseProjectId: string;
  googleCloudProject: string;
  pubsubEmulatorHost: string | undefined;
  allowLocalAuth: boolean;
  sentryDsn: string | undefined;
  posthogApiKey: string | undefined;
  posthogHost: string | undefined;
  splitioApiKey: string | undefined;
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://mbg_dev:dev_password_changeme@localhost:5432/media_buying_governance',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? 'local-dev',
  googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT ?? 'local-dev',
  pubsubEmulatorHost: process.env.PUBSUB_EMULATOR_HOST,
  allowLocalAuth: process.env.ALLOW_LOCAL_AUTH === 'true',
  sentryDsn: process.env.SENTRY_DSN,
  posthogApiKey: process.env.POSTHOG_API_KEY,
  posthogHost: process.env.POSTHOG_HOST,
  splitioApiKey: process.env.SPLITIO_API_KEY,
});
