import { test, expect } from '@playwright/test';
import { mockApi, seedUser, defaultState, USERS } from './fixtures.js';

test('Manage Chores: lists chores, search filters, no "Did it", one-time shows a date field (issue 6)', async ({ page }) => {
  await seedUser(page, USERS.admin);
  await mockApi(page, defaultState());
  await page.goto('/#/admin/chores');

  // Rows render with Edit, and the removed "✓ Did it" is gone.
  await expect(page.getByText('Sweep kitchen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' }).first()).toBeVisible();
  await expect(page.getByText('Did it')).toHaveCount(0);

  // Search filters the list.
  await page.getByPlaceholder(/Search/).fill('Vacuum');
  await expect(page.getByText('Vacuum')).toBeVisible();
  await expect(page.getByText('Sweep kitchen')).toHaveCount(0);

  // Add form: choosing One-time reveals a date input.
  await page.getByPlaceholder(/Search/).fill('');
  await page.getByRole('button', { name: /\+ Add/ }).click();
  // Target the Frequency select (the one that has the "One-time" option).
  await page.locator('select:has(option:has-text("One-time"))').selectOption({ label: 'One-time' });
  await expect(page.locator('input[type="date"]')).toBeVisible();
});

test('next-due shows a weekday for weekly and nothing for daily (#10/#14)', async ({ page }) => {
  await seedUser(page, USERS.admin);
  await mockApi(page, defaultState());
  await page.goto('/#/admin/chores');

  // c2 (Vacuum) is weekly on Tuesday (custom_days '2') → shows "Next: <weekday>".
  await expect(page.getByText(/Next:/)).toBeVisible();
  // c1 (Sweep kitchen) is daily → no "Next:" tag on its row.
  const sweepRow = page.locator('.chore-row', { hasText: 'Sweep kitchen' });
  await expect(sweepRow.getByText(/Next:/)).toHaveCount(0);
});

test('sort by location reorders the list (#15)', async ({ page }) => {
  await seedUser(page, USERS.admin);
  await mockApi(page, defaultState());
  await page.goto('/#/admin/chores');

  await page.getByLabel('Sort chores').selectOption('location');
  // Kitchen (Sweep) should come before Living Room (Vacuum) alphabetically.
  const names = await page.locator('.chore-name').allInnerTexts();
  expect(names.indexOf('Sweep kitchen')).toBeLessThan(names.indexOf('Vacuum'));
});

test('long description collapses with an expand carat (#11)', async ({ page }) => {
  const state = defaultState();
  state.chores[0].description = 'Sweep the floor, mop it, wipe the counters, and take the trash out to the bin outside.';
  await seedUser(page, USERS.admin);
  await mockApi(page, state);
  await page.goto('/#/admin/chores');

  const expand = page.getByRole('button', { name: 'Expand description' }).first();
  await expect(expand).toBeVisible();
  await expand.click();
  await expect(page.getByRole('button', { name: 'Collapse description' }).first()).toBeVisible();
});
