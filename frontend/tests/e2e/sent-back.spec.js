import { test, expect } from '@playwright/test';
import { mockApi, seedUser, defaultState, assignment, USERS } from './fixtures.js';

test('child sees sent-back feedback with the reviewer name (issue 5)', async ({ page }) => {
  const state = defaultState();
  state.assignments = [
    assignment({
      assignment_id: 'a1',
      chore_name: 'Clean bathroom',
      person_id: 'kid',
      status: 'open',
      reviewed_by: 'dad',
      review_note: 'The floor is still dirty, please reclean it.',
    }),
  ];
  await seedUser(page, USERS.kid);
  await mockApi(page, state);
  await page.goto('/');

  await expect(page.getByText(/Sent back by Dad/)).toBeVisible();
  await expect(page.getByText(/floor is still dirty/)).toBeVisible();
});
