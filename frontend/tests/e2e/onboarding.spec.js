import { test, expect } from '@playwright/test';
import { mockApi, defaultState } from './fixtures.js';

test('first visit shows the person picker with people from the API', async ({ page }) => {
  await mockApi(page, defaultState()); // no seeded user → onboarding
  await page.goto('/');
  await expect(page.getByText('Me', { exact: true })).toBeVisible();
  await expect(page.getByText('Kid', { exact: true })).toBeVisible();
});
