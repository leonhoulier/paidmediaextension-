import { test, expect } from '@playwright/test';

/**
 * Admin Portal: Teams CRUD operations.
 *
 * Tests create, edit, and delete flows for the Teams page.
 * These tests rely on the seeded database via docker-compose
 * and the backend + admin-portal running locally.
 */
test.describe('Teams CRUD', () => {

  test('should create a new team via the dialog', async ({ page }) => {
    await page.goto('/teams');

    // Wait for data to load
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // Click "Create Team" header button
    await page.getByRole('button', { name: 'Create new team' }).click();

    // Dialog should be open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Create Team')).toBeVisible();

    // Fill in the form
    await page.fill('[name="name"]', 'E2E Test Team');
    await page.fill('[name="description"]', 'Created by E2E test');
    await page.fill('[name="market"]', 'US');

    // Submit the form
    await page.getByRole('button', { name: 'Submit' }).click();

    // Wait for dialog to close (success)
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });

    // The new team should appear in the list
    await expect(page.getByText('E2E Test Team')).toBeVisible({ timeout: 10_000 });
  });

  test('should show validation error when team name is empty', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole('button', { name: 'Create new team' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click submit without filling required fields
    await page.getByRole('button', { name: 'Submit' }).click();

    // Validation error should appear
    await expect(page.getByText('Team name is required')).toBeVisible();

    // Dialog should still be open
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('should edit a team name via the edit dialog', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // Get the first edit button in the table
    const editButton = page.getByRole('button', { name: /^Edit team/ }).first();
    await expect(editButton).toBeVisible();
    await editButton.click();

    // Edit dialog should be open with pre-filled data
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Edit Team')).toBeVisible();

    // The name field should already have a value
    const nameInput = page.locator('[name="name"]');
    const currentName = await nameInput.inputValue();
    expect(currentName.length).toBeGreaterThan(0);

    // Change the name
    await nameInput.clear();
    await nameInput.fill(currentName + ' Edited');

    // Save changes
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });

    // The updated name should appear in the list
    await expect(page.getByText(currentName + ' Edited')).toBeVisible({ timeout: 10_000 });
  });

  test('should show delete confirmation and delete a team', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // Count existing teams
    const rows = page.locator('table[role="table"] tbody tr');
    const initialCount = await rows.count();
    expect(initialCount).toBeGreaterThan(0);

    // Click delete on the last team (to avoid deleting seeded data that other tests depend on)
    const deleteButton = page.getByRole('button', { name: /^Delete team/ }).last();
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Confirmation dialog should appear
    const alertDialog = page.locator('[role="alertdialog"]');
    await expect(alertDialog).toBeVisible();
    await expect(alertDialog.getByText('This action cannot be undone')).toBeVisible();

    // Confirm deletion
    await alertDialog.getByRole('button', { name: 'Delete' }).click();

    // Wait for dialog to close
    await expect(alertDialog).toHaveCount(0, { timeout: 10_000 });

    // One fewer row should exist
    await expect(rows).toHaveCount(initialCount - 1, { timeout: 10_000 });
  });

  test('should have Actions column header in the table', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
  });
});
