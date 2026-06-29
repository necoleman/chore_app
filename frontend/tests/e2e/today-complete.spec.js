import { test, expect } from '@playwright/test';
import { mockApi, seedUser, defaultState, assignment, USERS } from './fixtures.js';

test('completion only happens via the circle, not by tapping the card body (issue 3)', async ({ page }) => {
  const state = defaultState();
  state.assignments = [assignment({ assignment_id: 'a1', chore_name: 'Sweep kitchen', person_id: 'me' })];
  await seedUser(page, USERS.admin);
  await mockApi(page, state);
  await page.goto('/');

  const circle = page.getByRole('button', { name: 'Mark done' });
  await expect(circle).toBeVisible();

  // Tapping the chore name must NOT complete it — the circle is still there.
  await page.getByText('Sweep kitchen').click();
  await expect(circle).toBeVisible();

  // Tapping the circle completes it — the circle button goes away.
  await circle.click();
  await expect(page.getByRole('button', { name: 'Mark done' })).toHaveCount(0);
});
