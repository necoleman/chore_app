import { test, expect } from '@playwright/test';
import { mockApi, seedUser, defaultState, assignment, USERS } from './fixtures.js';

test('overflow Move date opens on your OWN chore without completing it (issue 4)', async ({ page }) => {
  const state = defaultState();
  state.assignments = [assignment({ assignment_id: 'a1', chore_name: 'Sweep kitchen', person_id: 'me' })];
  await seedUser(page, USERS.admin);
  await mockApi(page, state);
  await page.goto('/');

  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: /Move date/ }).click();

  // The date sheet opens (previously this bubbled to complete and no-op'd).
  await expect(page.getByText('Move to date')).toBeVisible();
  // And the chore was not completed.
  await expect(page.getByRole('button', { name: 'Mark done' })).toBeVisible();
});

test('overflow Reassign opens the person picker on your own chore', async ({ page }) => {
  const state = defaultState();
  state.assignments = [assignment({ assignment_id: 'a1', person_id: 'me' })];
  await seedUser(page, USERS.admin);
  await mockApi(page, state);
  await page.goto('/');

  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: /Reassign/ }).click();
  await expect(page.getByText('Reassign to…')).toBeVisible();
});

test('Make unclaimed moves an assigned chore to the unclaimed bucket (#12)', async ({ page }) => {
  const state = defaultState();
  state.assignments = [assignment({ assignment_id: 'a1', chore_name: 'Sweep kitchen', person_id: 'me' })];
  await seedUser(page, USERS.admin);
  await mockApi(page, state);
  await page.goto('/');

  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: /Make unclaimed/ }).click();

  // It's now claimable (open, no person) → a Claim circle appears.
  await expect(page.getByRole('button', { name: 'Claim chore' })).toBeVisible();
});
