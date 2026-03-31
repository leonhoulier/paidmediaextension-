/**
 * Seeded test data constants.
 *
 * These values correspond to the data created by `prisma/seed.ts` for the
 * DLG organisation. IDs that are generated at seed time (UUIDs,
 * extension tokens) are looked up dynamically by `global-setup.ts` and
 * written to `.env.test` which Playwright loads at runtime.
 */

/** Admin portal base URL (Vite dev server) */
export const ADMIN_BASE_URL = 'http://localhost:5173';

/** Backend API base URL (NestJS) */
export const API_BASE_URL = 'http://localhost:3000';

/** Mock fixture server base URL */
export const FIXTURE_BASE_URL = 'http://localhost:8080';

/** Seeded DLG organisation */
export const DLG_ORG = {
  name: 'DLG',
  slug: 'dlg',
  plan: 'enterprise',
} as const;

/** Seeded admin user (used for admin portal mock auth and API auth) */
export const ADMIN_USER = {
  email: 'admin1@dlg.com',
  name: 'Alice Admin',
  role: 'admin',
  uid: 'local-dev-user',
} as const;

/** Generate the Bearer token the admin portal sends in local dev mode */
export function adminAuthToken(): string {
  const payload = JSON.stringify({
    uid: ADMIN_USER.uid,
    email: ADMIN_USER.email,
  });
  return Buffer.from(payload).toString('base64');
}

/** Seeded team names */
export const SEEDED_TEAMS = ['US Social', 'EMEA Search', 'APAC Programmatic'] as const;

/** Seeded ad accounts */
export const SEEDED_ACCOUNTS = [
  { platform: 'meta', platformAccountId: 'act_123456', accountName: 'Main Meta Account', market: 'US' },
  { platform: 'meta', platformAccountId: 'act_789012', accountName: 'EMEA Meta Account', market: 'FR' },
  { platform: 'google_ads', platformAccountId: '123-456-7890', accountName: 'Primary Google Ads', market: 'US' },
  { platform: 'google_ads', platformAccountId: '987-654-3210', accountName: 'APAC Google Ads', market: 'JP' },
] as const;

/** Number of rules seeded per organisation */
export const SEEDED_RULES_PER_ORG = 10;

/** Seeded rule names (DLG) */
export const SEEDED_RULE_NAMES = [
  'Campaign Name Convention',
  'Enforce Lifetime Budget',
  'Must Target USA',
  'Must Target France',
  'Brand Safety Exclusions',
  'Google Campaign Name Convention',
  'Budget Range Enforcement',
  'Enforce Campaign Budget Optimization',
  'Target US Only',
  'Require End Date',
] as const;
