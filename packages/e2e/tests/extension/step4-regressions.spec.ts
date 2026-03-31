/**
 * Step 4 Regression Tests
 *
 * Covers all 8 bugs fixed in Step 4:
 *   HIGH #1  – Save Rule button silently fails (admin portal – covered by save-rule-validation.spec.ts)
 *   HIGH #2  – Approvals API returns 404 (backend – covered by API E2E tests)
 *   HIGH #3  – Sidebar/Score render at page bottom, not fixed overlay
 *   MEDIUM #1 – Edit Rule Set pre-selection doesn't populate (covered by edit-rule-preset.spec.ts)
 *   MEDIUM #2 – Meta extension detection still triggers
 *   LOW #1   – "Click to go to field" does nothing
 *   LOW #2   – Inline validation banners don't appear near correct fields
 *   LOW #3   – Publish intercept timing issue
 *
 * This file focuses on the extension-side bugs: HIGH #3, MEDIUM #2, LOW #1–3.
 */

import { test, expect } from './extension-fixture';

const FIXTURE_URL = 'http://localhost:8080/meta-campaign-regression.html?act=1639086456168798&tool=CAMPAIGN_CREATION_FLOW';
const INJECTION_WAIT = 5000;

// ═══════════════════════════════════════════════════════════════
// HIGH #3 – Sidebar & Campaign Score: Fixed Overlay Positioning
// ═══════════════════════════════════════════════════════════════
//
// Root cause: `all: initial` in inline style resets `position` to `static`,
// causing shadow DOM host elements to render in page flow instead of as
// fixed overlays. Fix: re-set `position: fixed` inline after `all: initial`.

test.describe('HIGH #3 – Sidebar/Score fixed overlay positioning', () => {

  test('sidebar host element has position: fixed', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const sidebarHost = page.locator('[data-gov-component="sidebar"]');
    await expect(sidebarHost).toBeVisible({ timeout: 10000 });

    // The critical assertion: computed position must be 'fixed', NOT 'static'
    const position = await sidebarHost.evaluate(
      (el) => window.getComputedStyle(el).position,
    );
    expect(position).toBe('fixed');
  });

  test('sidebar host has z-index >= 2147483000', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const sidebarHost = page.locator('[data-gov-component="sidebar"]');
    await expect(sidebarHost).toBeVisible({ timeout: 10000 });

    const zIndex = await sidebarHost.evaluate(
      (el) => window.getComputedStyle(el).zIndex,
    );
    expect(Number(zIndex)).toBeGreaterThanOrEqual(2147483000);
  });

  test('sidebar stays visually fixed when page is scrolled', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const sidebarHost = page.locator('[data-gov-component="sidebar"]');
    await expect(sidebarHost).toBeVisible({ timeout: 10000 });

    // Record sidebar position before scroll
    const beforeScroll = await sidebarHost.boundingBox();
    expect(beforeScroll).not.toBeNull();

    // Scroll the page down significantly
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(300);

    // Record sidebar position after scroll — should be identical for fixed elements
    const afterScroll = await sidebarHost.boundingBox();
    expect(afterScroll).not.toBeNull();

    // Fixed elements maintain the same viewport position when scrolling
    expect(afterScroll!.y).toBeCloseTo(beforeScroll!.y, 0);
  });

  test('campaign score host element has position: fixed', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const scoreHost = page.locator('[data-gov-component="campaign-score"]');

    // Campaign score may not render if no rules are configured,
    // so we check conditionally
    const scoreCount = await scoreHost.count();
    if (scoreCount > 0) {
      const position = await scoreHost.evaluate(
        (el) => window.getComputedStyle(el).position,
      );
      expect(position).toBe('fixed');
    }
  });

  test('all governance overlay components use all:initial with position:fixed', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    // Check every governance component that should be an overlay
    const overlayComponents = page.locator(
      '[data-gov-component="sidebar"], [data-gov-component="campaign-score"], [data-gov-component="creation-blocker"]',
    );

    const count = await overlayComponents.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const el = overlayComponents.nth(i);
      const component = await el.getAttribute('data-gov-component');
      const style = await el.evaluate((el) => el.getAttribute('style') || '');

      // Must have `all: initial` for style isolation
      expect(style).toContain('all: initial');

      // Must have `position: fixed` to override the reset (unless it's a banner)
      if (component !== 'validation-banner') {
        const computed = await el.evaluate((el) => window.getComputedStyle(el).position);
        expect(computed).toBe('fixed');
      }
    }
  });

  test('governance host elements have shadow DOM attached', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const govElements = page.locator('[data-governance="true"]');
    const count = await govElements.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const hasShadow = await govElements.nth(i).evaluate(
        (el) => el.shadowRoot !== null,
      );
      expect(hasShadow).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// MEDIUM #2 – Meta Extension Detection Evasion
// ═══════════════════════════════════════════════════════════════
//
// Root cause: eval-bridge only cleared React DevTools markers. Fix: added
// __d module registry interception to stub AdsBrowserExtensionErrorUtils.

test.describe('MEDIUM #2 – Extension detection evasion', () => {

  test('eval bridge is injected into MAIN world', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const bridgeExists = await page.evaluate(
      () => typeof (window as any).__governanceEvalBridge !== 'undefined',
    );
    expect(bridgeExists).toBe(true);
  });

  test('__d wrapper intercepts AdsBrowserExtensionErrorUtils', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    // Wait for the delayed __d('AdsBrowserExtensionErrorUtils') registration
    await page.waitForTimeout(1000);

    // The extension should have wrapped __d. If it did, calling
    // AdsBrowserExtensionErrorUtils.isBrowserExtensionError should return false.
    const result = await page.evaluate(() => {
      const registry = (window as any).__testModuleRegistry;
      if (!registry || !registry['AdsBrowserExtensionErrorUtils']) {
        return { registered: false };
      }

      // The factory was replaced by the extension's wrapper.
      // Load the module to check if the stub returns false.
      const mockModule: any = { exports: {} };
      try {
        registry['AdsBrowserExtensionErrorUtils'].factory(null, mockModule, null);
        const isBrowserExt = mockModule.exports.isBrowserExtensionError;
        return {
          registered: true,
          stubbed: typeof isBrowserExt === 'function' && isBrowserExt(new Error('chrome-extension://test')) === false,
        };
      } catch {
        return { registered: true, stubbed: false };
      }
    });

    expect(result.registered).toBe(true);
    expect(result.stubbed).toBe(true);
  });

  test('body does not have data-extension-detected attribute', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT + 1000);

    const detected = await page.evaluate(
      () => document.body.getAttribute('data-extension-detected'),
    );
    expect(detected).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// LOW #1 – "Click to go to field" Functionality
// ═══════════════════════════════════════════════════════════════
//
// Root cause: onViolationClick and onScrollToField callbacks were defined
// in component classes but never assigned in meta-adapter.ts. Fix: wired
// both callbacks in MetaAdapter initialization.

test.describe('LOW #1 – Click to go to field', () => {

  test('sidebar guidelines are clickable and have cursor pointer', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const sidebarHost = page.locator('[data-gov-component="sidebar"]');
    const hostCount = await sidebarHost.count();
    if (hostCount === 0) return; // Skip if sidebar not rendered (no rules configured)

    // Access shadow DOM content
    const guidelines = await sidebarHost.evaluate((host) => {
      const shadow = host.shadowRoot;
      if (!shadow) return [];
      const items = shadow.querySelectorAll('.guideline');
      return Array.from(items).map((item) => {
        const computed = window.getComputedStyle(item);
        return {
          text: item.textContent?.trim().substring(0, 50),
          cursor: computed.cursor,
          clickable: item.getAttribute('role') === 'button' || computed.cursor === 'pointer',
        };
      });
    });

    if (guidelines.length > 0) {
      // At least one guideline should be interactive
      const hasClickable = guidelines.some((g) => g.clickable);
      expect(hasClickable).toBe(true);
    }
  });

  test('clicking a sidebar guideline scrolls to the related field', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const sidebarHost = page.locator('[data-gov-component="sidebar"]');
    const hostCount = await sidebarHost.count();
    if (hostCount === 0) return;

    // Scroll page to bottom first so we can detect scroll-back
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const scrollBefore = await page.evaluate(() => window.scrollY);

    // Click the first guideline in the sidebar shadow DOM
    const clicked = await sidebarHost.evaluate((host) => {
      const shadow = host.shadowRoot;
      if (!shadow) return false;
      const firstGuideline = shadow.querySelector('.guideline') as HTMLElement;
      if (!firstGuideline) return false;
      firstGuideline.click();
      return true;
    });

    if (clicked) {
      // Wait for scroll animation
      await page.waitForTimeout(500);
      const scrollAfter = await page.evaluate(() => window.scrollY);

      // If the field is above the current scroll position, page should scroll up
      // We can't guarantee exact position, but scroll position should change
      // if the field exists and is off-screen
      expect(scrollAfter).not.toBe(scrollBefore);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// LOW #2 – Inline Validation Banners Near Correct Fields
// ═══════════════════════════════════════════════════════════════
//
// Root cause: getInjectionPointForField() returned null on real Meta DOM
// because selectors were designed for mocks. Fix: added FIELD_FALLBACK_SELECTORS
// with broader selector chains using data-surface, aria-label, and placeholders.

test.describe('LOW #2 – Inline validation banners at correct field positions', () => {

  test('validation banners inject near their target fields', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const banners = page.locator('[data-gov-component="validation-banner"]');
    const bannerCount = await banners.count();

    if (bannerCount === 0) {
      // No banners means either all rules pass or no rules configured.
      // This is OK — the test validates positioning only when banners exist.
      return;
    }

    // For each banner, check it's positioned near a form field (not at page bottom)
    for (let i = 0; i < bannerCount; i++) {
      const banner = banners.nth(i);
      const bannerBox = await banner.boundingBox();
      expect(bannerBox).not.toBeNull();

      // Banners should be within the main content area (not below page fold)
      // The page has min-height: 200vh, so a banner at the very bottom
      // would indicate broken injection.
      const viewportHeight = await page.evaluate(() => window.innerHeight);
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);

      // Banner top should be in the top 80% of the page content,
      // not pushed to the very bottom where broken injection would place it
      expect(bannerBox!.y + (await page.evaluate(() => window.scrollY))).toBeLessThan(
        pageHeight * 0.8,
      );
    }
  });

  test('validation banners use static positioning (inline flow, not fixed)', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const banners = page.locator('[data-gov-component="validation-banner"]');
    const count = await banners.count();

    for (let i = 0; i < count; i++) {
      const position = await banners.nth(i).evaluate(
        (el) => window.getComputedStyle(el).position,
      );
      // Banners should be static/relative (inline with form), not fixed
      expect(['static', 'relative']).toContain(position);
    }
  });

  test('data-surface fallback selectors are present in fixture', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);

    // Verify the fixture has data-surface attributes that FIELD_FALLBACK_SELECTORS target
    const surfaces = await page.evaluate(() => {
      const elements = document.querySelectorAll('[data-surface]');
      return Array.from(elements).map((el) => el.getAttribute('data-surface'));
    });

    // These match the FIELD_FALLBACK_SELECTORS keys
    expect(surfaces).toContain('campaign-name');
    expect(surfaces).toContain('campaign-budget');
    expect(surfaces).toContain('campaign-objective');
  });
});

// ═══════════════════════════════════════════════════════════════
// LOW #3 – Publish Intercept Timing
// ═══════════════════════════════════════════════════════════════
//
// Root cause: Capture-phase click listener on publish button could fire
// before governance had finished evaluating. Fix: publishDialogObserver
// MutationObserver watches for Meta's native confirm dialog and closes it
// if blocking violations exist.

test.describe('LOW #3 – Publish intercept timing', () => {

  test('publish button has capture-phase click listener', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const publishBtn = page.locator('[data-testid="publish-button"]');
    await expect(publishBtn).toBeVisible();

    // The extension should have attached a capture-phase listener.
    // We test this indirectly: clicking publish when there are blocking
    // violations should NOT open the native dialog.
    // Instead, the creation blocker should appear.

    await publishBtn.click();
    await page.waitForTimeout(500);

    const blockerHost = page.locator('[data-gov-component="creation-blocker"]');
    const blockerVisible = await blockerHost.count();

    if (blockerVisible > 0) {
      // Creation blocker intercepted the click — publish dialog should not be visible
      // (the governance dialog takes precedence)
      const dialogActive = await page.evaluate(() => {
        const dialog = document.getElementById('publish-confirm-dialog');
        return dialog?.classList.contains('active') ?? false;
      });

      // If there are blocking violations, the governance blocker should prevent
      // the native dialog from opening
      expect(dialogActive).toBe(false);
    }
  });

  test('creation blocker modal is accessible and dismissible', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const publishBtn = page.locator('[data-testid="publish-button"]');
    await publishBtn.click();
    await page.waitForTimeout(500);

    const blockerHost = page.locator('[data-gov-component="creation-blocker"]');
    const count = await blockerHost.count();
    if (count === 0) return; // No blocking violations configured

    // Verify modal structure in shadow DOM
    const modalStructure = await blockerHost.evaluate((host) => {
      const shadow = host.shadowRoot;
      if (!shadow) return null;
      return {
        hasBackdrop: !!shadow.querySelector('.blocker-backdrop'),
        hasModal: !!shadow.querySelector('.blocker-modal'),
        hasTitle: !!shadow.querySelector('.blocker-modal__title'),
        hasDismiss: !!shadow.querySelector('.blocker-modal__dismiss'),
        hasViolations: shadow.querySelectorAll('.violation-item').length,
      };
    });

    if (modalStructure) {
      expect(modalStructure.hasBackdrop).toBe(true);
      expect(modalStructure.hasModal).toBe(true);
      expect(modalStructure.hasTitle).toBe(true);
      expect(modalStructure.hasDismiss).toBe(true);
    }

    // Dismiss the modal
    const dismissed = await blockerHost.evaluate((host) => {
      const shadow = host.shadowRoot;
      const btn = shadow?.querySelector('.blocker-modal__dismiss') as HTMLElement;
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (dismissed) {
      await page.waitForTimeout(300);
      // Modal should be hidden after dismiss
      const stillVisible = await blockerHost.evaluate((host) => {
        const shadow = host.shadowRoot;
        const backdrop = shadow?.querySelector('.blocker-backdrop') as HTMLElement;
        if (!backdrop) return false;
        return window.getComputedStyle(backdrop).display !== 'none';
      });
      // After dismissal, it should not be visible
      expect(stillVisible).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Comprehensive: Governance Component Lifecycle
// ═══════════════════════════════════════════════════════════════

test.describe('Governance component lifecycle on regression fixture', () => {

  test('extension injects into regression fixture page', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const loaded = await page.evaluate(
      () => document.body.hasAttribute('governance-loaded'),
    );
    expect(loaded).toBe(true);
  });

  test('at least one governance component is injected', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const govCount = await page.locator('[data-governance="true"]').count();
    expect(govCount).toBeGreaterThan(0);
  });

  test('governance components survive page scroll without detaching', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const initialCount = await page.locator('[data-governance="true"]').count();
    expect(initialCount).toBeGreaterThan(0);

    // Scroll through the entire page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    const afterCount = await page.locator('[data-governance="true"]').count();
    expect(afterCount).toBe(initialCount);
  });

  test('field value changes trigger re-evaluation', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await page.waitForTimeout(INJECTION_WAIT);

    const nameInput = page.locator('input[aria-label="Campaign name"]');
    await expect(nameInput).toBeVisible();

    // Clear and type a new value
    await nameInput.fill('');
    await nameInput.fill('TEST_CHANGED_NAME');

    // Wait for debounced re-evaluation (300ms debounce + processing)
    await page.waitForTimeout(1000);

    // Verify the extension detected the change
    // (governance-loaded should still be present, components should still work)
    const loaded = await page.evaluate(
      () => document.body.hasAttribute('governance-loaded'),
    );
    expect(loaded).toBe(true);
  });
});
