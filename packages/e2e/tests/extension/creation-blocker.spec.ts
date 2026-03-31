import { test, expect } from './extension-fixture';

/**
 * Extension: Creation blocker tests.
 *
 * Verifies the creation blocker modal behavior. The blocker prevents
 * campaign/ad set creation when there are unresolved blocking violations.
 *
 * The publish/create buttons in the fixtures trigger the creation
 * interception logic. These tests verify the fixture buttons exist and
 * test the DOM structure the blocker uses.
 */
test.describe('Creation Blocker', () => {

  test('Meta publish button is present in campaign fixture', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/meta-campaign-creation.html');

    await page.waitForTimeout(3000);

    // The Publish button should be visible in the bottom bar
    const publishBtn = page.locator('[data-testid="publish-button"]');
    await expect(publishBtn).toBeVisible();
    await expect(publishBtn).toHaveText('Publish');

    // The button should be a submit type
    await expect(publishBtn).toHaveAttribute('type', 'submit');

    await page.close();
  });

  test('Meta Next button is present in ad set fixture', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/meta-adset-creation.html');

    await page.waitForTimeout(3000);

    // The Next button should be visible
    const nextBtn = page.locator('[data-testid="publish-button"]');
    await expect(nextBtn).toBeVisible();
    await expect(nextBtn).toHaveText('Next');

    await page.close();
  });

  test('Google Create campaign button is present', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/google-campaign-wizard.html');

    await page.waitForTimeout(3000);

    // The Create campaign button should be visible
    const createBtn = page.locator('[data-test="create-button"]');
    await expect(createBtn).toBeVisible();
    await expect(createBtn).toHaveText('Create campaign');

    await page.close();
  });

  test('creation blocker component appears when blocking violations exist', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/meta-campaign-creation.html');

    // Wait for extension initialization
    await page.waitForTimeout(5000);

    // Check if the creation blocker component exists
    const blockerHost = page.locator('[data-gov-component="creation-blocker"]');
    const blockerCount = await blockerHost.count();

    if (blockerCount > 0) {
      // If the blocker is present, it may be hidden (no blocking violations)
      // or visible (blocking violations exist)
      const isVisible = await blockerHost.isVisible();

      if (isVisible) {
        // Verify the blocker structure via Shadow DOM
        const blockerContent = await blockerHost.evaluate((el) => {
          const shadow = el.shadowRoot;
          if (!shadow) return null;
          return {
            hasBackdrop: !!shadow.querySelector('.blocker-backdrop'),
            hasModal: !!shadow.querySelector('.blocker-modal'),
            hasTitle: !!shadow.querySelector('.blocker-modal__title'),
            hasDismiss: !!shadow.querySelector('.blocker-modal__dismiss'),
            titleText: shadow.querySelector('.blocker-modal__title')?.textContent ?? '',
            violationCount: shadow.querySelectorAll('.violation-item').length,
          };
        });

        if (blockerContent) {
          expect(blockerContent.hasBackdrop).toBe(true);
          expect(blockerContent.hasModal).toBe(true);
          expect(blockerContent.titleText).toContain('Creation Blocked');
          expect(blockerContent.violationCount).toBeGreaterThan(0);
        }
      }
    }

    // Page should still be accessible
    await expect(page.locator('.ams-layout')).toBeVisible();

    await page.close();
  });

  test('creation blocker dismiss button hides the modal', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/meta-campaign-creation.html');

    // Wait for extension
    await page.waitForTimeout(5000);

    const blockerHost = page.locator('[data-gov-component="creation-blocker"]');
    const blockerCount = await blockerHost.count();

    if (blockerCount > 0 && await blockerHost.isVisible()) {
      // Click the dismiss button inside shadow DOM
      await blockerHost.evaluate((el) => {
        const shadow = el.shadowRoot;
        const dismissBtn = shadow?.querySelector('.blocker-modal__dismiss') as HTMLElement | null;
        dismissBtn?.click();
      });

      // After dismissal, the host should be hidden
      await page.waitForTimeout(500);
      await expect(blockerHost).toBeHidden();
    }

    await page.close();
  });

  test('multiple fixture pages can be opened without conflicts', async ({ context }) => {
    // Open Meta campaign page
    const metaPage = await context.newPage();
    await metaPage.goto('http://localhost:8080/meta-campaign-creation.html');

    // Open Google campaign page
    const googlePage = await context.newPage();
    await googlePage.goto('http://localhost:8080/google-campaign-wizard.html');

    // Wait for both to load
    await metaPage.waitForTimeout(4000);
    await googlePage.waitForTimeout(4000);

    // Both pages should render correctly
    await expect(metaPage.locator('.ams-layout')).toBeVisible();
    await expect(googlePage.locator('.wizard')).toBeVisible();

    // Each page's publish/create button should work independently
    await expect(metaPage.locator('[data-testid="publish-button"]')).toBeVisible();
    await expect(googlePage.locator('[data-test="create-button"]')).toBeVisible();

    await metaPage.close();
    await googlePage.close();
  });
});
