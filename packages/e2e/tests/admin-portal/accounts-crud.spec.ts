import { test, expect } from '@playwright/test';

/**
 * Admin Portal: Accounts CRUD operations.
 *
 * Tests create, edit, and delete flows for the Accounts page.
 * These tests rely on the seeded database via docker-compose
 * and the backend + admin-portal running locally.
 */
test.describe('Accounts CRUD', () => {

  test('should create a new account via the dialog', async ({ page }) => {
    await page.goto('/accounts');

    // Wait for data to load
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // Click "Add Account" header button
    await page.getByRole('button', { name: 'Add new account' }).click();

    // Dialog should be open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Add Account')).toBeVisible();

    // Fill in the form
    await page.fill('[name="accountName"]', 'E2E Test Account');

    // Select platform (Meta)
    await page.locator('#account-platform').click();
    await page.getByRole('option', { name: 'Meta' }).click();

    await page.fill('[name="platformAccountId"]', 'act_e2e_999');
    await page.fill('[name="market"]', 'EU');

    // Submit the form
    await page.getByRole('button', { name: 'Submit' }).click();

    // Wait for dialog to close (success)
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });

    // The new account should appear in the list
    await expect(page.getByText('E2E Test Account')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('act_e2e_999')).toBeVisible();
  });

  test('should show validation errors for required fields', async ({ page }) => {
    await page.goto('/accounts');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole('button', { name: 'Add new account' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click submit without filling anything
    await page.getByRole('button', { name: 'Submit' }).click();

    // Validation errors should appear for required fields
    await expect(page.getByText('Account name is required')).toBeVisible();
    await expect(page.getByText('Platform is required')).toBeVisible();
    await expect(page.getByText('Platform Account ID is required')).toBeVisible();

    // Dialog should still be open
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('should edit an account via the edit dialog', async ({ page }) => {
    await page.goto('/accounts');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // Get the first edit button in the table
    const editButton = page.getByRole('button', { name: /^Edit account/ }).first();
    await expect(editButton).toBeVisible();
    await editButton.click();

    // Edit dialog should be open with pre-filled data
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Edit Account')).toBeVisible();

    // The accountName field should already have a value
    const nameInput = page.locator('[name="accountName"]');
    const currentName = await nameInput.inputValue();
    expect(currentName.length).toBeGreaterThan(0);

    // Change the name
    await nameInput.clear();
    await nameInput.fill(currentName + ' Updated');

    // Save changes
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });

    // The updated name should appear in the list
    await expect(page.getByText(currentName + ' Updated')).toBeVisible({ timeout: 10_000 });
  });

  test('should delete an account via the confirmation dialog', async ({ page }) => {
    await page.goto('/accounts');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    // Count existing accounts
    const rows = page.locator('table[role="table"] tbody tr');
    const initialCount = await rows.count();
    expect(initialCount).toBeGreaterThan(0);

    // Click delete on the last account
    const deleteButton = page.getByRole('button', { name: /^Delete account/ }).last();
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
    await page.goto('/accounts');
    await expect(page.locator('[role="status"]')).toHaveCount(0, { timeout: 15_000 });

    await expect(page.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
  });
});
