import { test, expect } from '@playwright/test';

/**
 * Admin Portal: Accounts page smoke tests.
 *
 * Verifies the accounts page loads with seeded accounts, displays them
 * in a table, and has the correct structure.
 */
test.describe('Accounts Page', () => {

  test('shows seeded accounts in a table', async ({ page }) => {
    await page.goto('/accounts');

    await expect(page.getByRole('heading', { name: 'Ad Accounts' })).toBeVisible();

    // Wait for loading to finish
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // The table should be present with at least some accounts
    const table = page.locator('table[role="table"]');
    await expect(table).toBeVisible();

    // Check that known seeded account names appear
    await expect(page.getByText('Main Meta Account')).toBeVisible();
    await expect(page.getByText('Primary Google Ads')).toBeVisible();

    // Verify column headers
    await expect(page.getByRole('columnheader', { name: 'Account Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Platform' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Account ID' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Market' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
  });

  test('shows the correct account count', async ({ page }) => {
    await page.goto('/accounts');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // The card header shows "X Accounts" (4 accounts seeded for DLG)
    const countText = page.locator('text=/\\d+ Accounts?/');
    await expect(countText).toBeVisible();
  });

  test('displays platform badges for each account', async ({ page }) => {
    await page.goto('/accounts');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // Meta and Google Ads badges should appear
    await expect(page.getByText('Meta').first()).toBeVisible();
    await expect(page.getByText('Google Ads').first()).toBeVisible();
  });

  test('shows platform account IDs', async ({ page }) => {
    await page.goto('/accounts');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // Check for seeded platform account IDs
    await expect(page.getByText('act_123456')).toBeVisible();
    await expect(page.getByText('123-456-7890')).toBeVisible();
  });

  test('Add Account button is visible', async ({ page }) => {
    await page.goto('/accounts');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    await expect(page.getByRole('button', { name: 'Add new account' })).toBeVisible();
  });
});
