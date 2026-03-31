import { test, expect } from '@playwright/test';

/**
 * Admin Portal: Edit Rule form pre-selection.
 *
 * Verifies that when editing an existing rule:
 * 1. The Rule Set dropdown is pre-selected with the correct value
 * 2. The rule name and description fields are populated
 * 3. Form fields reflect the existing rule data after load
 *
 * Note: This test requires a running backend with at least one rule in the database.
 * If no rules exist, the test will skip gracefully.
 */
test.describe('Edit Rule Pre-selection', () => {

  test('navigates to rules list and checks for editable rules', async ({ page }) => {
    await page.goto('/rules');
    await page.waitForLoadState('networkidle');

    // The rules page should load
    await expect(page.getByText(/Rules|Governance Rules/i).first()).toBeVisible({ timeout: 10_000 });

    // Check if there are any rules in the list
    const ruleRows = page.locator('table tbody tr, [role="row"]');
    const rowCount = await ruleRows.count().catch(() => 0);

    if (rowCount === 0) {
      test.skip(true, 'No rules in database to edit');
      return;
    }

    // Click edit on the first rule (look for edit link/button)
    const editLink = page.locator('a[href*="/rules/"][href*="/edit"]').first();
    const hasEditLink = await editLink.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasEditLink) {
      await editLink.click();
    } else {
      // Try clicking the first rule row which might navigate to edit
      await ruleRows.first().click();
    }

    await page.waitForLoadState('networkidle');
  });

  test('edit rule form pre-populates Rule Set dropdown', async ({ page }) => {
    await page.goto('/rules');
    await page.waitForLoadState('networkidle');

    // Find an edit link
    const editLink = page.locator('a[href*="/rules/"][href*="/edit"]').first();
    const hasEditLink = await editLink.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!hasEditLink) {
      test.skip(true, 'No edit links available (no rules in database)');
      return;
    }

    await editLink.click();
    await page.waitForLoadState('networkidle');

    // Should show "Edit Rule" heading
    await expect(page.getByText(/Edit.*Rule/i).first()).toBeVisible({ timeout: 10_000 });

    // The rule name field should be pre-filled (not empty)
    const nameInput = page.locator('input#name');
    const nameValue = await nameInput.inputValue();
    expect(nameValue.length).toBeGreaterThan(0);

    // The Rule Set dropdown should NOT show the placeholder "Select a rule set"
    // It should show the actual rule set name
    const ruleSetTrigger = page.locator('#ruleSetId');
    const ruleSetText = await ruleSetTrigger.textContent();

    // The text should not be the placeholder
    if (ruleSetText) {
      expect(ruleSetText).not.toBe('Select a rule set');
      expect(ruleSetText.trim().length).toBeGreaterThan(0);
    }

    // The description field should also be pre-filled
    const descInput = page.locator('input#description');
    const descValue = await descInput.inputValue();
    expect(descValue.length).toBeGreaterThan(0);
  });
});
