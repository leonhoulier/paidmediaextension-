import { test, expect } from '@playwright/test';

/**
 * Admin Portal: Dashboard smoke tests.
 *
 * Verifies that the dashboard loads, displays stat cards with real data from
 * the seeded database, and provides working quick-action links.
 */
test.describe('Dashboard', () => {

  test('loads with stat cards showing data', async ({ page }) => {
    await page.goto('/dashboard');

    // Wait for the dashboard heading
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Wait for loading spinners to disappear (the dashboard uses Loader2 while fetching)
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // Verify the 4 stat cards are present. The stat cards are link elements
    // wrapping Card components. Use nth() to pick the right one when
    // multiple elements with the same href exist (sidebar nav + stat card).
    // The stat cards show the count text like "13 active of 13 total"
    await expect(page.getByText('Active Rules')).toBeVisible();
    await expect(page.getByText('Ad Accounts')).toBeVisible();
    // Verify stat card values are shown (these are unique to the stat cards)
    await expect(page.getByText(/\d+ active of \d+ total/).first()).toBeVisible();
    // Check that the Teams stat shows "3"
    await expect(page.getByText('3 active of 3 total')).toBeVisible();

    // The "Active Rules" card should show a number greater than 0
    // The card structure is: CardTitle "Active Rules" -> CardContent -> div.text-2xl
    const rulesCard = page.locator('a[href="/rules"]');
    const rulesCount = rulesCard.locator('.text-2xl');
    await expect(rulesCount).not.toHaveText('0');

    // The "Teams" card should show 3 (seeded teams per org)
    const teamsCard = page.locator('a[href="/teams"]');
    const teamsCount = teamsCard.locator('.text-2xl');
    await expect(teamsCount).toHaveText('3');
  });

  test('quick action cards are visible', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // Quick Actions section -- use heading roles to avoid matching nav items
    await expect(page.getByRole('heading', { name: 'Quick Actions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Create Rule' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Naming Template', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'View Compliance' })).toBeVisible();
  });

  test('stat card links navigate to correct pages', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // Click the "Active Rules" stat card (it's a link to /rules)
    await page.locator('a[href="/rules"]').first().click();
    await expect(page).toHaveURL(/\/rules$/);

    // Navigate back to dashboard
    await page.goto('/dashboard');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // Click "Ad Accounts" card
    await page.locator('a[href="/accounts"]').first().click();
    await expect(page).toHaveURL(/\/accounts$/);
  });
});
