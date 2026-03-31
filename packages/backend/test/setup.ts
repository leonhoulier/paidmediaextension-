/**
 * Global test setup
 * Sets environment variables before tests run
 */
process.env.NODE_ENV = 'test';
process.env.ALLOW_LOCAL_AUTH = 'true';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://mbg_dev:dev_password_changeme@localhost:5432/media_buying_governance_test';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
