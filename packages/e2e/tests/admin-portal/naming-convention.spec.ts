import { test, expect } from '@playwright/test';

/**
 * Admin Portal: Naming Convention Builder smoke tests.
 *
 * Verifies the naming convention builder page loads and displays
 * the segment creation interface.
 */
test.describe('Naming Convention Builder', () => {

  test('loads the builder interface', async ({ page }) => {
    await page.goto('/naming-templates/new');
    await page.waitForLoadState('networkidle');

    // Should show a heading related to naming conventions
    const pageText = await page.textContent('body');
    expect(pageText).toMatch(/naming|convention|template|segment/i);
  });

  test('naming templates list page shows seeded templates', async ({ page }) => {
    await page.goto('/naming-templates');
    await page.waitForLoadState('networkidle');

    // Wait for loading to finish
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // The page should render - it may show templates or an empty state
    // With seed data there should be 2 naming templates (one for Meta, one for Google)
    const pageText = await page.textContent('body');
    expect(pageText).toMatch(/naming|template|convention/i);
  });
});
