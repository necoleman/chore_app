import { test, expect } from '@playwright/test';
import { mockApi, seedUser, defaultState, assignment, USERS, localDate } from './fixtures.js';

test('an overdue unfinished chore stays on Today with an Overdue badge', async ({ page }) => {
  const state = defaultState();
  state.assignments = [
    assignment({ assignment_id: 'a1', chore_name: 'Water plants', person_id: 'me', status: 'open', due_date: localDate(-3) }),
  ];
  await seedUser(page, USERS.admin);
  await mockApi(page, state);
  await page.goto('/');

  await expect(page.getByText('Water plants')).toBeVisible();
  await expect(page.getByText(/Overdue/)).toBeVisible();
});
