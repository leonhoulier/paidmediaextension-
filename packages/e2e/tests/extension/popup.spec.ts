import { test, expect } from './extension-fixture';

/**
 * Extension: Popup UI tests.
 *
 * Verifies the popup loads and shows expected UI elements.
 * NOTE: The built popup.html in dist/ may not include all source features
 * (e.g., pairing view). Tests work with whatever is actually in the build.
 */
test.describe('Extension Popup', () => {

  test('popup page loads and shows header with title and version', async ({ context, extensionId }) => {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    // Wait for the popup JS to initialize
    await popupPage.waitForTimeout(3000);

    // Should show the title "Media Buying Governance"
    await expect(popupPage.locator('.popup__title')).toHaveText('Media Buying Governance');

    // Should show the version number
    const versionEl = popupPage.locator('#version');
    await expect(versionEl).toBeVisible();
    const versionText = await versionEl.textContent();
    expect(versionText).toMatch(/^v\d+/);

    await popupPage.close();
  });

  test('popup has admin portal link', async ({ context, extensionId }) => {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    // Footer should have admin portal link
    const adminLink = popupPage.locator('#admin-link');
    await expect(adminLink).toBeVisible();

    const href = await adminLink.getAttribute('href');
    expect(href).toContain('localhost:5173');

    await popupPage.close();
  });

  test('popup shows status fields for org and account', async ({ context, extensionId }) => {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    // Wait for initialization
    await popupPage.waitForTimeout(3000);

    // Verify key status elements exist in the DOM
    const structure = await popupPage.evaluate(() => {
      return {
        hasTitle: !!document.querySelector('.popup__title'),
        hasVersion: !!document.querySelector('#version'),
        hasBody: !!document.querySelector('#body'),
        hasOrgName: !!document.querySelector('#org-name'),
        hasAccountId: !!document.querySelector('#account-id'),
        hasAdminLink: !!document.querySelector('#admin-link'),
        hasRefreshBtn: !!document.querySelector('#btn-refresh'),
        hasToggleSidebar: !!document.querySelector('#btn-toggle-sidebar'),
      };
    });

    expect(structure.hasTitle).toBe(true);
    expect(structure.hasVersion).toBe(true);
    expect(structure.hasBody).toBe(true);
    expect(structure.hasOrgName).toBe(true);
    expect(structure.hasAccountId).toBe(true);
    expect(structure.hasAdminLink).toBe(true);
    expect(structure.hasRefreshBtn).toBe(true);
    expect(structure.hasToggleSidebar).toBe(true);

    await popupPage.close();
  });

  test('popup action buttons exist', async ({ context, extensionId }) => {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);

    // Wait for initialization
    await popupPage.waitForTimeout(3000);

    // Force Refresh button should contain "Force Refresh" text
    const refreshBtn = popupPage.locator('#btn-refresh');
    await expect(refreshBtn).toBeVisible();
    const refreshText = await refreshBtn.textContent();
    expect(refreshText).toContain('Force Refresh');

    // Toggle Sidebar button
    const toggleBtn = popupPage.locator('#btn-toggle-sidebar');
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toHaveText('Toggle Sidebar');

    await popupPage.close();
  });
});
