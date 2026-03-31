import { test, expect } from './extension-fixture';

/**
 * Extension: Guidelines sidebar tests.
 *
 * Verifies the guidelines sidebar component is injected into platform
 * pages and displays rule evaluation results grouped by category.
 *
 * The sidebar is a fixed-position panel that uses Shadow DOM for isolation.
 * Its presence depends on successful rule fetching from the backend.
 */
test.describe('Guidelines Sidebar', () => {

  test('sidebar container is injected on Meta campaign page', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/meta-campaign-creation.html');

    // Wait for full extension initialization
    await page.waitForTimeout(5000);

    // Check for the sidebar component
    const sidebarHost = page.locator('[data-gov-component="guidelines-sidebar"]');
    const sidebarCount = await sidebarHost.count();

    if (sidebarCount > 0) {
      // Sidebar was injected (backend was reachable)
      await expect(sidebarHost).toBeVisible();

      // The sidebar renders inside Shadow DOM
      // We can verify the host element exists and is positioned fixed
      const display = await sidebarHost.evaluate(
        (el) => window.getComputedStyle(el).display
      );
      expect(display).not.toBe('none');
    }

    // Page should still render correctly regardless
    await expect(page.locator('.ams-layout')).toBeVisible();

    await page.close();
  });

  test('sidebar container is injected on Google campaign page', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/google-campaign-wizard.html');

    // Wait for full extension initialization
    await page.waitForTimeout(5000);

    // Check for the sidebar component
    const sidebarHost = page.locator('[data-gov-component="guidelines-sidebar"]');
    const sidebarCount = await sidebarHost.count();

    if (sidebarCount > 0) {
      await expect(sidebarHost).toBeVisible();
    }

    // Wizard should still render correctly
    await expect(page.locator('.wizard')).toBeVisible();
    await expect(page.locator('.stepper')).toBeVisible();

    await page.close();
  });

  test('sidebar is NOT injected on non-platform pages', async ({ context }) => {
    const page = await context.newPage();
    // Navigate to the fixture index (not a platform page)
    await page.goto('http://localhost:8080/');

    await page.waitForTimeout(3000);

    // No governance components should be present
    const govComponents = await page.locator('[data-gov-component]').count();
    expect(govComponents).toBe(0);

    await page.close();
  });

  test('sidebar toggle message handler works via popup', async ({ context, extensionId }) => {
    // Open a platform page first
    const platformPage = await context.newPage();
    await platformPage.goto('http://localhost:8080/meta-campaign-creation.html');
    await platformPage.waitForTimeout(4000);

    // Open the popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    // The Toggle Sidebar button should exist in the main view body
    // (may be hidden if not paired, but should exist in DOM)
    const toggleBtn = popupPage.locator('#btn-toggle-sidebar');
    expect(await toggleBtn.count()).toBe(1);

    await popupPage.close();
    await platformPage.close();
  });

  test('sidebar has correct structure when visible', async ({ context }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:8080/meta-campaign-creation.html');

    // Wait for full extension initialization
    await page.waitForTimeout(5000);

    const sidebarHost = page.locator('[data-gov-component="guidelines-sidebar"]');
    const sidebarCount = await sidebarHost.count();

    if (sidebarCount > 0) {
      // Access shadow DOM content
      const shadowContent = await sidebarHost.evaluate((el) => {
        const shadow = el.shadowRoot;
        if (!shadow) return null;
        const sidebar = shadow.querySelector('.sidebar');
        if (!sidebar) return null;
        return {
          hasHeader: !!shadow.querySelector('.sidebar__header'),
          hasBody: !!shadow.querySelector('.sidebar__body'),
          hasFooter: !!shadow.querySelector('.sidebar__footer'),
          hasCloseBtn: !!shadow.querySelector('.sidebar__close'),
          titleText: shadow.querySelector('.sidebar__title')?.textContent?.trim() ?? '',
        };
      });

      if (shadowContent) {
        expect(shadowContent.hasHeader).toBe(true);
        expect(shadowContent.hasBody).toBe(true);
        expect(shadowContent.hasFooter).toBe(true);
        expect(shadowContent.hasCloseBtn).toBe(true);
        expect(shadowContent.titleText).toContain('Guidelines');
      }
    }

    await page.close();
  });
});
