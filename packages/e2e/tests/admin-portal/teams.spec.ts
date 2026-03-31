import { test, expect } from '@playwright/test';

/**
 * Admin Portal: Teams page smoke tests.
 *
 * Verifies the teams page loads with seeded teams, displays them in
 * a table, and shows member counts.
 */
test.describe('Teams Page', () => {

  test('shows seeded teams in a table', async ({ page }) => {
    await page.goto('/teams');

    await expect(page.getByRole('heading', { name: 'Teams', exact: true })).toBeVisible();

    // Wait for loading to finish
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // The table should be present with at least some teams
    const table = page.locator('table[role="table"]');
    await expect(table).toBeVisible();

    // Check that known seeded team names appear (use exact match to avoid
    // matching description cells that may start with similar text)
    await expect(page.getByRole('cell', { name: 'US Social', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'EMEA Search', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'APAC Programmatic', exact: true })).toBeVisible();

    // Verify column headers
    await expect(page.getByRole('columnheader', { name: 'Team Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Description' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Members' })).toBeVisible();
  });

  test('shows the correct team count', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // The card header shows "3 Teams" (3 teams seeded per org)
    const countText = page.locator('text=/3 Teams/');
    await expect(countText).toBeVisible();
  });

  test('each team shows member count badge', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // Each team should show "X members" badge
    const memberBadges = page.locator('text=/\\d+ members?/');
    await expect(memberBadges.first()).toBeVisible();

    // With 5 users per org distributed across 3 teams, there should be at least 3 badges
    const count = await memberBadges.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('Create Team button is visible', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    await expect(page.getByRole('button', { name: 'Create new team' })).toBeVisible();
  });
});
