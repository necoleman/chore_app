import { test, expect } from '@playwright/test';
import { mockApi, seedUser, defaultState, assignment, USERS } from './fixtures.js';

test('claiming shows your name immediately and persists after reload', async ({ page }) => {
  const state = defaultState();
  state.assignments = [
    assignment({ assignment_id: 'a1', chore_name: 'Take out trash', person_id: null, status: 'open' }),
  ];
  await seedUser(page, USERS.admin);
  await mockApi(page, state);
  await page.goto('/');

  // Unassigned chore is claimable via its circle.
  await page.getByRole('button', { name: 'Claim chore' }).click();

  // Name appears right away (the blank-logo fix sets person_name optimistically).
  await expect(page.getByText('Me', { exact: true })).toBeVisible();

  // Persisted: reload pulls the mocked state, still claimed by Me.
  await page.reload();
  await expect(page.getByText('Me', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Claim chore' })).toHaveCount(0);
});
