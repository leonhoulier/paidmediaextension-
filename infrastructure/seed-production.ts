/**
 * Production Database Seeder
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates the initial organization and admin user for a fresh production
 * deployment. Does NOT create test data, rules, or compliance events.
 *
 * Usage:
 *   1. Connect to Cloud SQL via Cloud SQL Auth Proxy:
 *        cloud-sql-proxy PROJECT:us-central1:mbg-postgres &
 *
 *   2. Set DATABASE_URL:
 *        export DATABASE_URL="postgresql://mbg_app:PASSWORD@localhost:5432/media_buying_governance"
 *
 *   3. Run this script:
 *        npx ts-node infrastructure/seed-production.ts
 *
 *   4. Or with prompts disabled (CI mode):
 *        ORG_NAME="Acme Corp" ADMIN_EMAIL="admin@acme.com" ADMIN_NAME="Alice Admin" \
 *          npx ts-node infrastructure/seed-production.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as readline from 'readline';

const prisma = new PrismaClient();

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate a 64-character hex extension token for extension pairing.
 */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Slugify a name: lowercase, replace spaces/special chars with hyphens.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

/**
 * Prompt the user for input via stdin.
 */
function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const displayDefault = defaultValue ? ` (${defaultValue})` : '';

  return new Promise((resolve) => {
    rl.question(`${question}${displayDefault}: `, (answer) => {
      rl.close();
      const value = answer.trim() || defaultValue || '';
      resolve(value);
    });
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('');
  console.log('==========================================================');
  console.log('  Media Buying Governance — Production Database Seeder');
  console.log('==========================================================');
  console.log('');
  console.log('This will create your first organization and admin user.');
  console.log('No test data will be created.');
  console.log('');

  // ── Gather inputs (from env vars or interactive prompts) ──────────────

  const orgName =
    process.env.ORG_NAME ||
    (await prompt('Organization name', 'My Organization'));

  const orgSlug =
    process.env.ORG_SLUG ||
    (await prompt('Organization slug', slugify(orgName)));

  const orgPlan =
    (process.env.ORG_PLAN as 'free' | 'pro' | 'enterprise') ||
    (await prompt('Subscription plan (free/pro/enterprise)', 'pro')) as 'free' | 'pro' | 'enterprise';

  const adminEmail =
    process.env.ADMIN_EMAIL ||
    (await prompt('Admin email'));

  const adminName =
    process.env.ADMIN_NAME ||
    (await prompt('Admin full name'));

  // ── Validate ──────────────────────────────────────────────────────────

  if (!orgName || !adminEmail || !adminName) {
    console.error('\nError: Organization name, admin email, and admin name are required.');
    process.exit(1);
  }

  if (!['free', 'pro', 'enterprise'].includes(orgPlan)) {
    console.error(`\nError: Invalid plan "${orgPlan}". Must be free, pro, or enterprise.`);
    process.exit(1);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(adminEmail)) {
    console.error(`\nError: Invalid email address "${adminEmail}".`);
    process.exit(1);
  }

  console.log('');
  console.log('Creating resources with:');
  console.log(`  Organization: ${orgName} (${orgSlug})`);
  console.log(`  Plan:         ${orgPlan}`);
  console.log(`  Admin:        ${adminName} <${adminEmail}>`);
  console.log('');

  // ── Check for existing data ───────────────────────────────────────────

  const existingOrg = await prisma.organization.findUnique({
    where: { slug: orgSlug },
  });

  if (existingOrg) {
    console.error(`Error: Organization with slug "${orgSlug}" already exists (id: ${existingOrg.id}).`);
    console.error('If you want to re-seed, delete the existing organization first.');
    process.exit(1);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingUser) {
    console.error(`Error: User with email "${adminEmail}" already exists (id: ${existingUser.id}).`);
    process.exit(1);
  }

  // ── Create organization ───────────────────────────────────────────────

  const organization = await prisma.organization.create({
    data: {
      name: orgName,
      slug: orgSlug,
      plan: orgPlan,
      settings: {
        defaultEnforcement: 'warning',
      },
    },
  });

  console.log(`Created organization: ${organization.name} (id: ${organization.id})`);

  // ── Create admin user ─────────────────────────────────────────────────

  const extensionToken = generateToken();

  const adminUser = await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: adminEmail,
      name: adminName,
      role: 'super_admin',
      teamIds: [],
      extensionToken: extensionToken,
    },
  });

  console.log(`Created admin user: ${adminUser.name} <${adminUser.email}> (id: ${adminUser.id})`);

  // ── Output ────────────────────────────────────────────────────────────

  console.log('');
  console.log('==========================================================');
  console.log('  PRODUCTION SEED COMPLETE');
  console.log('==========================================================');
  console.log('');
  console.log('Organization:');
  console.log(`  ID:   ${organization.id}`);
  console.log(`  Name: ${organization.name}`);
  console.log(`  Slug: ${organization.slug}`);
  console.log(`  Plan: ${organization.plan}`);
  console.log('');
  console.log('Admin User:');
  console.log(`  ID:    ${adminUser.id}`);
  console.log(`  Email: ${adminUser.email}`);
  console.log(`  Name:  ${adminUser.name}`);
  console.log(`  Role:  ${adminUser.role}`);
  console.log('');
  console.log('Extension Pairing Token:');
  console.log(`  ${extensionToken}`);
  console.log('');
  console.log('IMPORTANT: Save the extension pairing token. The admin user');
  console.log('can use it to pair the Chrome extension with their account.');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Log in to the admin portal with the admin email above');
  console.log('  2. Firebase Auth must have this email registered (Google SSO)');
  console.log('  3. Use the extension token to pair the Chrome extension');
  console.log('  4. Create rule sets and rules via the admin portal');
  console.log('');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Production seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
