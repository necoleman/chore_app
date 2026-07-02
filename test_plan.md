# Family Chore Tracker — User Test Plan

**How to use this document:**
Each test case has an ID, preconditions, steps, and expected result. Run through sections in order on a fresh setup. Mark each case Pass / Fail / Blocked and note any deviation.

Test environments needed:
- **Desktop browser** (Chrome recommended) at the GitHub Pages URL
- **iOS device** (Safari, iOS 16.4+ for full push support)
- **Android device** (Chrome)
- **Google Sheets** (direct tab access)
- **Apps Script editor** (to run jobs manually)
- **PowerShell** (for API-level tests)

> **Switching users while testing:** the app has no log-out button. To test as a different family member, clear the `chore_current_user` localStorage key (desktop console: `localStorage.removeItem('chore_current_user'); location.reload()`) to return to the person picker. Full steps (desktop + installed iOS PWA) are in the README under *Local Testing → "Switching users / 'logging out' during testing."*

> **Automated coverage (run before deploy):** much of this plan is now guarded by the local test suite — `npm test` (Vitest: date/selector logic, store mutations, and the Apps Script backend via an in-memory harness) and `npm run test:e2e` (Playwright: onboarding, complete-via-circle, overflow menu, sent-back feedback, claim, overdue, Manage Chores). See README → *Local Testing → "Running the automated tests."* Manual passes can therefore focus on what automation can't reach: **real push notifications**, **actual iOS Safari/standalone** rendering, install/A2HS, and live Google Sheets/Apps Script behavior.

---

## 1. Onboarding

### OB-01 — First visit shows person picker
**Preconditions:** People tab has at least 2 rows. Clear site data in DevTools first (Application → Storage → Clear site data).
**Steps:** Open the app URL.
**Expected:** Onboarding screen appears. "Who are you?" prompt. Person cards load with correct names and avatar colors. "That's me →" button is disabled until a card is selected.

### OB-02 — Person selection persists
**Steps:** Pick a person, click "That's me →", complete onboarding. Close the tab, reopen the URL.
**Expected:** Onboarding is skipped. Today screen loads directly with the previously chosen person.

### OB-03 — Desktop skips Add to Home Screen step
**Preconditions:** Running on desktop Chrome.
**Steps:** Pick a person, click "That's me →".
**Expected:** Goes directly to the notifications step. Add to Home Screen screen never appears.

### OB-04 — iOS shows Add to Home Screen instructions
**Preconditions:** Running on iPhone/iPad in Safari.
**Steps:** Pick a person, click "That's me →".
**Expected:** Add to Home Screen step appears with Share → Add to Home Screen instructions. "I'll do this later" link is visible but small.

### OB-05 — Android shows install prompt
**Preconditions:** Running on Android Chrome with PWA install criteria met (served over HTTPS).
**Steps:** Pick a person, click "That's me →".
**Expected:** Add to Home Screen step appears with an "Install App" button. Tapping it triggers the native browser install dialog.

### OB-06 — Notification permission granted
**Steps:** Reach the notifications step. Click "Allow Notifications".
**Expected:** Browser permission dialog appears. On grant, onboarding completes and Today screen appears. FCM token is written to the person's `fcm_token` column in the People sheet.

### OB-07 — Notification permission denied
**Steps:** Reach the notifications step. Click "Allow Notifications". Deny in the browser dialog.
**Expected:** Onboarding still completes. Today screen appears. No FCM token in sheet. App functions normally without notifications.

### OB-08 — Skip notifications
**Steps:** Reach the notifications step. Click "Skip for now".
**Expected:** Onboarding completes. Today screen appears. No FCM token written.

### OB-09 — Different browser / incognito starts fresh
**Steps:** Open the app in an incognito window or a different browser.
**Expected:** Onboarding starts from the beginning (person picker). No memory of previous session.

---

## 2. Today Screen — Core View

### TD-01 — Today's assignments load
**Preconditions:** Run `runNightlyGenerator` from Apps Script editor. At least one active chore has today as a due date.
**Steps:** Log in as a person who has an assignment today. Open Today screen.
**Expected:** Assignment appears in "My Chores" section with chore name, point value, and an empty circle tap target.

### TD-02 — Family section shows others' chores
**Preconditions:** Multiple people have assignments today.
**Steps:** Log in as Person A. View Today screen.
**Expected:** "Family" section shows other people's chores grouped by person, with their avatar color. Person A's own chores are not in the Family section.

### TD-03 — Unassigned chore appears as claimable
**Preconditions:** A chore exists with no `default_assignee`. Generator has run.
**Steps:** Log in as any person. View Today screen.
**Expected:** Unassigned chore appears in "Available to Claim" section with "Tap to claim" label and a blue prompt.

### TD-04 — Auto-refresh every 30 seconds
**Steps:** Open Today screen. In another browser tab or directly in Sheets, change an assignment's status to `done`. Wait 30 seconds.
**Expected:** The assignment updates in the UI without a manual refresh.

### TD-05 — Manual refresh button
**Steps:** Click the refresh icon in the header.
**Expected:** Spinner appears briefly. Data reloads. "Updated just now" timestamp resets.

### TD-06 — All done state
**Preconditions:** All of the logged-in person's assignments are marked done.
**Steps:** Complete the last assignment.
**Expected:** "My Chores" section shows "All done! 🎉".

---

## 3. Completing Chores (Non-Admin, No Approval)

### CH-01 — Mark chore done (no approval required)
**Preconditions:** Logged in as a non-admin. Assignment has `requires_approval = FALSE`.
**Steps:** Tap the empty circle on a chore card.
**Expected:** Circle animates to a green checkmark. Card dims. Points chip (e.g. "+3") appears. `points_total` in People sheet increments. Assignment row in Sheets shows `status = done`, `completed_at` set, `points_awarded` set.

### CH-02 — Mark chore done (requires approval, non-admin)
**Preconditions:** Logged in as a non-admin. Assignment has `requires_approval = TRUE`.
**Steps:** Tap the circle on the chore card.
**Expected:** Circle animates to an amber clock/pending icon. "Waiting for review" badge appears. No points shown yet. Assignment row in Sheets shows `status = pending_review`, `points_awarded` blank.

### CH-03 — Pending chore cannot be re-tapped
**Preconditions:** A chore is in `pending_review` state for the current user.
**Steps:** Tap the chore card again.
**Expected:** Nothing happens. Card is not interactive.

### CH-04 — Skip a chore
**Preconditions:** An open assignment exists for today.
**Steps:** (If a skip button is exposed via admin overflow or future UI — currently skip is API-level.) Call skip via DevTools or note as future UI test.
**Expected:** Assignment shows as skipped in Sheets (`status = skipped`). Does not appear in family view as open.

### CH-05 — Claim an unassigned chore
**Preconditions:** An unassigned assignment exists (no `person_id`).
**Steps:** Log in as Person A. Tap the unassigned chore in "Available to Claim".
**Expected:** Chore moves from "Available to Claim" to "My Chores". Person A's `person_id` is written to the assignment row. `assigned_by = manual`.

### CH-06 — Claim is reflected for all users
**Steps:** After Person A claims a chore (CH-05), log in as Person B on another device/tab and refresh.
**Expected:** The chore no longer appears in "Available to Claim" for Person B.

---

## 4. Admin — Approval Workflow

### AP-01 — Admin sees "Needs review" section
**Preconditions:** At least one assignment is in `pending_review` status today. Logged in as admin.
**Steps:** Open Today screen.
**Expected:** Yellow "Needs review (N)" section appears at the top with the pending item(s). Approve and "Send back" buttons are visible inline.

### AP-02 — Admin does not see "Needs review" when nothing pending
**Preconditions:** No assignments in `pending_review` today.
**Steps:** Log in as admin. Open Today screen.
**Expected:** "Needs review" section is absent.

### AP-03 — Non-admin does not see "Needs review" section
**Preconditions:** Assignments exist in `pending_review`.
**Steps:** Log in as non-admin. Open Today screen.
**Expected:** No "Needs review" section. No approve/reject controls visible anywhere.

### AP-04 — Approve a pending chore
**Preconditions:** Logged in as admin. A chore is in `pending_review`.
**Steps:** Click "✓ Approve" on the pending card in "Needs review".
**Expected:** Card moves to done state (green check). Points appear on card. In Sheets: `status = done`, `points_awarded` filled, `reviewed_by` = admin's person_id, `reviewed_at` set. Kid's `points_total` in People sheet increments.

### AP-05 — Reject a pending chore without a note
**Steps:** Click "✗ Send back". In the modal, leave note blank. Click "Send back".
**Expected:** Chore disappears from "Needs review". Assignment returns to `open` status. Kid sees the chore reappear in their "My Chores" (on next refresh). `completed_at` is cleared. `review_note` is blank in Sheets.

### AP-06 — Reject a pending chore with a note
**Steps:** Click "✗ Send back". Type a note (e.g. "Missed under the bed"). Click "Send back".
**Expected:** Same as AP-05, plus the kid's card shows a red "Sent back: Missed under the bed" callout. `review_note` in Sheets matches the typed text.

### AP-07 — Admin completes own chore (no approval)
**Preconditions:** Admin has an assignment today where the chore has `requires_approval = TRUE`.
**Steps:** Log in as admin. Tap the chore.
**Expected:** Goes directly to `done` with points. Does not go to `pending_review`. Admins bypass the approval gate.

---

## 5. Admin — Reassign and Bump

### RB-01 — Reassign a chore to another person
**Preconditions:** Logged in as admin. An open assignment exists assigned to Person A.
**Steps:** Tap the three-dot overflow menu on the card. Tap "↔ Reassign". Pick Person B from the picker.
**Expected:** Card now shows Person B's name and avatar color. In Sheets: `person_id` updated to Person B, `last_modified_by` = admin's person_id, `last_modified_at` set. Person B receives a push notification (if token registered).

### RB-02 — Bump a chore to a future date
**Preconditions:** Logged in as admin. An open assignment exists for today.
**Steps:** Tap three-dot menu → "📅 Move date". Pick a date two days from now. Confirm.
**Expected:** Card disappears from Today screen immediately. In Sheets: `due_date` updated, `last_modified_by/at` set. Assignment will reappear on the new due date.

### RB-03 — Bump a chore back to today
**Steps:** Tap three-dot menu → "📅 Move date". Pick today's date. Confirm.
**Expected:** Card stays on Today screen. `due_date` unchanged in practice.

### RB-04 — Reassign controls not visible to non-admin
**Preconditions:** Logged in as non-admin.
**Steps:** View any chore card.
**Expected:** No three-dot overflow menu visible on any card.

### RB-05 — Admin manually assigns a new chore
**Preconditions:** Logged in as admin. A chore exists without a `default_assignee`.
**Steps:** Call `POST ?action=assign` with `{ chore_id, person_id, due_date: today }` via DevTools or PowerShell.
**Expected:** New assignment row appears in Sheets. Assigned person sees it in Today on next refresh.

---

## 6. Leaderboard

### LB-01 — Points display correctly
**Preconditions:** At least two people have completed chores and earned points.
**Steps:** Open Leaderboard screen.
**Expected:** People listed in descending points order. Points totals match the `points_total` column in People sheet.

### LB-02 — Week points derived from assignments
**Steps:** Complete a chore worth 5 points today. Open Leaderboard.
**Expected:** "+5 this week" appears under your name.

### LB-03 — Streak display
**Preconditions:** Run `runStreakMaintenance` manually from Apps Script after all of a person's today's chores are `done`.
**Steps:** Open Leaderboard.
**Expected:** "🔥 N day streak" badge appears. `streak_current` in People sheet matches displayed value.

### LB-04 — Pending review does not count toward streak
**Preconditions:** Person A has one chore in `pending_review` and no other open chores today.
**Steps:** Run `runStreakMaintenance`.
**Expected:** Streak does NOT increment for Person A. Badge does not increase. (Streak only counts when status is `done`.)

---

## 7. Chore Admin Screen

### CA-01 — Admin can access Chores screen
**Preconditions:** Logged in as admin.
**Steps:** Tap the Chores icon in the nav bar.
**Expected:** Chores screen loads with list of active and inactive chores. "+ Add" button visible.

### CA-02 — Non-admin cannot access Chores screen
**Preconditions:** Logged in as non-admin.
**Steps:** Check nav bar.
**Expected:** No Chores nav item visible. Direct navigation to `/#/admin/chores` shows the screen (nav is the only gate — see security section).

### CA-03 — Add a daily chore
**Steps:** Tap "+ Add". Enter name "Test Daily", points 2, frequency Daily, no approval. Tap "Save".
**Expected:** New row appears in Chores sheet with correct fields, `active = TRUE`. Chore appears in active list. Running `runNightlyGenerator` creates an assignment for it today.

### CA-04 — Add a weekly chore (specific day)
**Steps:** Add a chore with frequency "Weekly", set day to today's weekday number (0=Sun).
**Expected:** Chore only generates on that weekday. Run generator on a different day and confirm no assignment is created.

### CA-05 — Add a custom days chore
**Steps:** Add a chore, frequency "Custom days", select Mon/Wed/Fri.
**Expected:** `custom_days = monday,wednesday,friday` in sheet. Generator only creates assignments on those days.

### CA-06 — Add a monthly chore
**Steps:** Add a chore, frequency "Monthly", day of month = today's date.
**Expected:** Generator creates an assignment today. `last_generated_date` is written. Running generator again today does not create a duplicate.

### CA-07 — Add an interval chore
**Steps:** Add a chore, frequency "Every N days", interval = 1.
**Expected:** Generator creates an assignment today. `last_generated_date` written. Running tomorrow creates another.

### CA-08 — Edit a chore
**Steps:** Tap "Edit" on an existing chore. Change points from 3 to 5. Save.
**Expected:** `points` column in Sheets updates to 5. Future completions award 5 points. Past `points_awarded` values on existing assignment rows are unchanged.

### CA-09 — Deactivate a chore
**Steps:** Tap "Edit" on a chore. Uncheck "Active". Save.
**Expected:** Chore moves to "Inactive" section in the admin list. Row in Sheets has `active = FALSE`. Generator no longer creates assignments for it. Historical assignments for this chore are preserved.

### CA-10 — Requires approval toggle
**Steps:** Edit a chore, toggle "Requires parent approval" on. Save. Have a non-admin complete it.
**Expected:** Completion results in `pending_review` status, not `done`. Toggle it off. Have non-admin complete it. Results in `done` immediately.

---

## 8. History Screen

### HI-01 — Completed chores appear in history
**Preconditions:** At least one chore has been completed (status `done`).
**Steps:** Open History screen.
**Expected:** Entries appear grouped by date, descending. Done entries show green dot, chore name, person name, points awarded.

### HI-02 — Skipped chores appear in history
**Preconditions:** At least one assignment has `status = skipped`.
**Steps:** Open History screen.
**Expected:** Skipped entries show grey dot and "– Skipped" label. No points shown.

### HI-03 — Rejected chores show review note
**Preconditions:** At least one assignment was rejected with a note.
**Steps:** Open History screen.
**Expected:** Rejected entry shows red dot, "✗ Rejected", and the review note in quotes.

### HI-04 — Admin can filter by person
**Preconditions:** Logged in as admin. Multiple people have history.
**Steps:** Use the person filter dropdown. Select one person.
**Expected:** Only that person's history entries are shown.

### HI-05 — Non-admin has no person filter
**Preconditions:** Logged in as non-admin.
**Steps:** Open History screen.
**Expected:** No filter dropdown visible.

---

## 9. Nightly Generator and Scheduled Jobs

### GN-01 — Generator creates daily assignments
**Preconditions:** At least one active `daily` chore exists.
**Steps:** Clear any existing assignments for today from Sheets. Run `runNightlyGenerator` from Apps Script editor.
**Expected:** One new assignment row per daily chore added to Assignments sheet, `status = open`, `assigned_by = auto`.

### GN-02 — Generator does not duplicate
**Steps:** Run `runNightlyGenerator` twice on the same day.
**Expected:** No duplicate rows created on the second run.

### GN-03 — Monthly chore catch-up
**Preconditions:** A `monthly` chore has `monthly_day` = 1. Set `last_generated_date` to last month. Run generator on any day of the current month ≥ 1.
**Expected:** Assignment is generated immediately (catch-up rule). `last_generated_date` updates to today.

### GN-04 — Interval chore catch-up
**Preconditions:** An `interval` chore has `interval_days = 7`. Set `last_generated_date` to 10 days ago.
**Steps:** Run generator.
**Expected:** Assignment created. `last_generated_date` updated to today.

### GN-05 — Streak maintenance increments on full completion
**Preconditions:** Person A has exactly one assignment today. Mark it `done`.
**Steps:** Run `runStreakMaintenance`.
**Expected:** Person A's `streak_current` increments by 1 in People sheet. If new value > `streak_best`, `streak_best` also updates.

### GN-06 — Streak resets on incomplete day
**Preconditions:** Person A has two assignments today. Mark only one `done`. Leave one `open`.
**Steps:** Run `runStreakMaintenance`.
**Expected:** Person A's `streak_current` resets to 0.

---

## 10. Push Notifications

### PN-01 — FCM token is registered on permission grant
**Preconditions:** Fresh onboarding on a device that supports notifications.
**Steps:** Complete onboarding and grant notification permission.
**Expected:** Person's row in People sheet has a non-empty `fcm_token` value within a few seconds.

### PN-02 — Reminder notification fires for open assignment
**Preconditions:** Person has an open assignment today. Current time is past `REMINDER_HOUR` (default 6pm). FCM token registered.
**Steps:** Run `runReminderPush` manually from Apps Script editor.
**Expected:** Push notification arrives on the device with "Don't forget!" title and the chore name.

### PN-03 — No reminder for completed assignment
**Preconditions:** Person's only assignment today is `done`.
**Steps:** Run `runReminderPush`.
**Expected:** No notification sent to that person.

### PN-04 — Admin receives pending review digest
**Preconditions:** At least one assignment is in `pending_review` today. Admin has FCM token.
**Steps:** Run `runReminderPush` after `REMINDER_HOUR`.
**Expected:** Admin receives "Chores need review" notification with count.

### PN-05 — Reassign triggers immediate push
**Preconditions:** Person B has an FCM token. An assignment currently assigned to Person A is open.
**Steps:** Admin reassigns to Person B.
**Expected:** Person B receives "New chore assigned" push notification shortly after reassign.

### PN-06 — Bump triggers immediate push
**Preconditions:** Person A has an FCM token. Their assignment is bumped to a future date.
**Steps:** Admin bumps the assignment.
**Expected:** Person A receives "Chore rescheduled" notification with the new date.

### PN-07 — Background notification (app closed)
**Preconditions:** App is installed as PWA on Android or iOS 16.4+. App is not open.
**Steps:** Run `runReminderPush` after `REMINDER_HOUR`.
**Expected:** Notification appears in the device's notification tray. Tapping it opens the app.

### PN-08 — Foreground notification (app open)
**Preconditions:** App is open in the foreground.
**Steps:** Trigger a push (run reminder manually or via reassign).
**Expected:** FCM `onMessage` fires in the foreground. Notification may or may not appear as a system alert depending on the device — this is expected FCM behavior. The app can choose to show a toast instead (future enhancement).

### PN-09 — Missing FCM token — no error
**Preconditions:** A person's `fcm_token` is blank in the People sheet.
**Steps:** Run `runReminderPush`.
**Expected:** No push sent to that person. No Apps Script error or exception thrown. Other people's notifications are unaffected.

---

## 11. Google Sheets Direct Edit Tests

These tests verify that the app correctly picks up changes made directly in the spreadsheet, bypassing the UI.

### SH-01 — Add a person directly in Sheets
**Steps:** Add a new row to the People tab with a unique `person_id`, name, hex color, `is_admin = FALSE`, `points_total = 0`, `streak_current = 0`, `streak_best = 0`.
**Steps (app):** Open a fresh session. Go through onboarding.
**Expected:** New person appears in the person picker. Selecting them completes onboarding normally.

### SH-02 — Edit chore points in Sheets
**Steps:** Change a chore's `points` value from 3 to 10 directly in the Chores tab.
**Steps (app):** Complete that chore as a non-admin (no approval).
**Expected:** `points_awarded` on the new assignment row = 10. Person's `points_total` increments by 10. Older completed assignments retain their original `points_awarded` value.

### SH-03 — Deactivate a chore in Sheets
**Steps:** Set `active = FALSE` on a chore row directly in Sheets.
**Steps (app):** Run generator. Refresh app.
**Expected:** No new assignment created for that chore. Chore does not appear in Today screen.

### SH-04 — Manually set an assignment status to `done` in Sheets
**Steps:** Find an `open` assignment row. Change `status` to `done` directly.
**Steps (app):** Refresh Today screen.
**Expected:** Assignment appears as completed (green check, dimmed card) in the UI. Cache TTL is 20 seconds — may need to wait briefly.

### SH-05 — Manually add an assignment row in Sheets
**Steps:** Add a row to Assignments with a valid `chore_id`, `person_id`, today's date, `status = open`, `assigned_by = manual`.
**Steps (app):** Refresh Today screen.
**Expected:** Assignment appears in the correct person's "My Chores" section.

### SH-06 — Cache invalidation delay
**Steps:** Make a change in Sheets. Immediately refresh the app.
**Expected:** Change may not appear immediately (20-second script cache). Wait 20–30 seconds and refresh again. Change should now be visible. This is expected and documented behavior.

---

## 12. Security and Penetration Tests

This app uses **no server-side authentication**. Admin controls are enforced client-side only. The following tests document the security model and its known boundaries.

### SEC-01 — Fake admin via localStorage manipulation
**Threat:** A technically savvy user edits localStorage to set `is_admin = true` on their person object.
**Steps:**
1. Log in as a non-admin.
2. Open DevTools → Application → Local Storage.
3. Find the `chore_current_user` key. Edit the JSON to set `"is_admin": true`.
4. Refresh the app.
**Expected result:** Admin UI controls (Reassign, Bump, Approve, Reject, Chores nav item) now appear. The user can call admin endpoints successfully.
**Security implication:** This is a **known and accepted limitation** of the no-auth design (documented in spec §6). Anyone with the app URL and DevTools access can elevate themselves to admin. Acceptable for an in-home family tool; not suitable if the URL is shared outside the household or if tamper-proof approvals are required.
**Mitigation if needed:** Add a server-side check in Apps Script `doPost` that validates the `admin_person_id` against the People sheet's `is_admin` column before processing approve/reject/reassign/bump.

### SEC-02 — Direct API call as non-admin to approve endpoint
**Threat:** A non-admin calls `POST ?action=approve` directly (e.g., via PowerShell or browser fetch), bypassing the UI.
**Steps:**
```powershell
$body = '{"assignment_id":"ASSIGNMENT_ID","admin_person_id":"p_kid"}'
Invoke-RestMethod -Uri "$url?action=approve" -Method Post -Body $body
```
**Expected result:** The approve action succeeds. The chore is approved and points are awarded — even though `p_kid` is not an admin.
**Security implication:** Same as SEC-01. The Apps Script endpoint does not verify `is_admin` on the provided `admin_person_id`. The `reviewed_by` audit column will correctly show the kid's person_id, which at least creates a detectable trail.
**Mitigation if needed:** In `actionApprove` and `actionReject`, look up the provided `admin_person_id` in the People sheet and throw an error if `is_admin !== TRUE`.

### SEC-03 — Approve your own pending chore
**Threat:** Kid submits a chore for review, then approves it themselves via SEC-02 method.
**Steps:** As a non-admin person, complete a `requires_approval` chore (sets `pending_review`). Then call approve with your own `person_id` as `admin_person_id`.
**Expected result:** Succeeds — chore is approved and points awarded.
**Security implication:** Same no-auth limitation. The `reviewed_by` field will show the same person_id as the assignee, which is a detectable anomaly in the History screen.

### SEC-04 — Access the app URL from outside the household
**Threat:** The GitHub Pages URL is public. Anyone who finds it can use the app as any family member.
**Steps:** Open the app URL in an incognito window on an unrelated device.
**Expected result:** Full onboarding flow available. Any family member can be impersonated by selecting their name.
**Security implication:** The URL is the only access gate. Do not share it outside the household. GitHub Pages repos can be made private (requires GitHub Pro), which would add basic authentication. Alternatively, a simple shared password stored in localStorage at first launch could be added as a lightweight gate.

### SEC-05 — Replay a POST request
**Threat:** An attacker captures a legitimate `complete` request and replays it to mark additional chores done.
**Steps:** Use DevTools Network → right-click a POST request → "Copy as fetch". Paste into console. Re-execute.
**Expected result:** Fails with `"Assignment is not open"` error (since the assignment is already `done` or `pending_review`). The server-side status check in `actionComplete` prevents double-completion.
**Security implication:** Low risk. Status transitions are enforced server-side.

### SEC-06 — Enumerate other people's data
**Threat:** A user calls `?action=today` and receives all family members' assignments.
**Steps:** Call the `today` endpoint from PowerShell or DevTools.
**Expected result:** Returns all assignments for all family members for the current week.
**Security implication:** This is by design — the Today screen shows the whole family's chores. All household data (names, point totals, chore assignments) is accessible to anyone with the URL. There is no per-person data partitioning.

### SEC-07 — Modify the Spreadsheet directly
**Threat:** A user who has edit access to the Google Sheet can make any change — award themselves points, change `is_admin`, alter streak counts.
**Steps:** Open the Sheet directly. Edit `points_total` for any person.
**Expected result:** Change takes effect immediately and is reflected in the app on next refresh.
**Security implication:** Sheet access is controlled by Google Drive permissions. Only people the Sheet owner explicitly shares it with (edit access) can modify it. The recommended mitigation is to share the Sheet with family members as **View only** (or not at all — they access it only through the app). Use **Data → Protected sheets and ranges** to lock critical columns (`chore_id`, `person_id`, `points_total`, `is_admin`) against accidental edits even for people with edit access.

### SEC-08 — Apps Script URL is public
**Threat:** The Web App URL (in `VITE_API_URL`) is embedded in the built JavaScript bundle and visible to anyone who inspects the page source or network requests.
**Steps:** Open DevTools → Network. Note the Apps Script URL in any request.
**Expected result:** URL is visible in plain text.
**Security implication:** This is inherent to the client-side no-auth model. The URL is functionally equivalent to an API key — treat it as semi-secret (don't post it publicly) but accept that anyone using the app can see it. Rotating the URL (redeploying Apps Script as a new deployment) would invalidate it if compromised, but would require updating `VITE_API_URL` and redeploying the frontend.

### SEC-09 — Firebase config exposure
**Threat:** Firebase API keys and project IDs are visible in the built JavaScript bundle.
**Steps:** Open DevTools → Sources → find the built JS. Search for `apiKey`.
**Expected result:** Firebase config values are visible.
**Security implication:** Firebase web API keys are **not secret** — they identify the project but do not grant privileged access. FCM token registration (`register_token`) is the only Firebase operation the frontend performs, and FCM tokens are per-device. A malicious actor with the config could register their own FCM token but cannot receive notifications sent to other tokens. Lock down Firebase project settings (Authentication, Firestore rules, etc.) if those services are enabled — for this app, only FCM is used.

### SEC-10 — Rate limiting and quota exhaustion
**Threat:** A malicious or misconfigured client polls the `today` endpoint far more frequently than intended, exhausting Apps Script daily quotas.
**Steps:** Run a loop that calls `?action=today` 1,000 times in quick succession.
**Expected result:** Apps Script enforces its own rate limits (typically 20,000 URL fetch calls/day on free tier, 30 simultaneous executions max). Excess requests queue or fail. The 20-second script cache means most rapid repeat GETs return cached data without re-reading the sheet, limiting damage.
**Security implication:** No per-client rate limiting exists. A deliberate DoS would exhaust the daily quota and break the app for the rest of the day. Mitigation options: add `LockService` to GET handlers (already done for POST), or add a simple request counter in Cache Service to reject clients exceeding N requests per minute.

---

## 13. Responsive & Safe-Area Layout (iOS / Android)

These cases verify the iOS safe-area fixes (status bar overlap and bottom-sheet button visibility). The fixes use `env(safe-area-inset-*)` and `100dvh`, which are no-ops on non-notched devices — so Android is included as a regression check. Test on a **notched iPhone** (e.g. iPhone X or later) for the primary cases.

### LY-01 — Top header clears the status bar (standalone PWA)
**Preconditions:** App installed to the Home Screen on a notched iPhone. Logged in (any role).
**Steps:** Launch the app from the Home Screen icon. View the Today screen, then tap the Chores nav item.
**Expected:** The "Today" and "Chores" titles and the header buttons (refresh, **Add**) sit fully below the iPhone status bar (clock, battery, signal). Nothing is overlapped. The **Add** button is fully tappable.

### LY-02 — Top header clears the status bar (Safari browser)
**Preconditions:** Notched iPhone, app opened in Safari (not installed).
**Steps:** Open the app URL. View Today and Chores screens.
**Expected:** Headers are not obscured by the Safari address bar or status area. Layout looks correct.

### LY-03 — ChoreForm "Add" buttons visible (Safari browser)
**Preconditions:** Logged in as admin in Safari on iPhone. On the Chores screen.
**Steps:** Tap **+ Add**. The chore form bottom sheet opens.
**Expected:** Both **Cancel** and **Save** buttons are fully visible above the Safari bottom toolbar and are tappable without scrolling.

### LY-04 — ChoreForm buttons stay pinned on a long form
**Preconditions:** Admin, ChoreForm open.
**Steps:** Set frequency to **Custom days** (expands the weekday grid) and fill all fields so the form is taller than the sheet. Scroll the form up and down.
**Expected:** The **Cancel**/**Save** action bar stays pinned (sticky) to the bottom of the sheet and remains visible while the fields scroll behind it. Buttons never disappear below the toolbar / home indicator.

### LY-05 — ChoreForm buttons clear the home indicator (standalone)
**Preconditions:** Installed PWA on a notched iPhone, admin.
**Steps:** Open the Chores screen, tap **+ Add**.
**Expected:** Cancel/Save sit above the iOS home indicator (the horizontal bar), with visible spacing, and are tappable.

### LY-06 — Reassign person picker buttons visible
**Preconditions:** Admin, iPhone. An open assignment exists.
**Steps:** Tap a chore's three-dot menu → **Reassign**. The person picker sheet opens.
**Expected:** The person grid and the **Cancel** button are fully visible above the toolbar / home indicator. With many people, the grid scrolls and Cancel stays pinned at the bottom.

### LY-07 — Move date (bump) sheet buttons visible
**Preconditions:** Admin, iPhone.
**Steps:** Tap a chore's three-dot menu → **Move date**. The date picker sheet opens.
**Expected:** The date input and **Cancel**/**Confirm** buttons are fully visible and tappable above the toolbar / home indicator.

### LY-08 — Reject-note modal buttons visible
**Preconditions:** Admin, iPhone. A chore is in `pending_review`.
**Steps:** In "Needs review", tap **✗ Send back**. The note modal opens.
**Expected:** The note input and **Cancel**/**Send back** buttons are fully visible and tappable above the toolbar / home indicator.

### LY-09 — Android regression check (no layout change)
**Preconditions:** Android device (Chrome or Vivaldi), admin.
**Steps:** Repeat LY-01, LY-03, LY-06, LY-07, LY-08 on Android.
**Expected:** Layout is unchanged from before the fix — no extra blank bands at the top, no gaps. All modal buttons are visible and tappable as they were previously.

### LY-10 — Desktop regression check
**Preconditions:** Desktop browser, admin.
**Steps:** Open each bottom sheet (Add chore, Reassign, Move date, Send back).
**Expected:** Sheets render at the bottom of the window with all buttons visible. No unexpected full-height gaps or clipped content.

---

## 14. App Updates (Service Worker)

These cases verify that users reliably receive new deployments. The app is a PWA whose service worker precaches the app shell (JS/CSS/HTML), so a stale cache can otherwise pin users to an old version. The service worker calls `self.skipWaiting()` + `clientsClaim()` and the registration uses `registerType: 'autoUpdate'`, so a new build should activate and reload on the user's next open/refresh.

> **One-time caveat:** installs running a service worker built *before* `skipWaiting`/`clientsClaim` was added will not auto-update on that first transition — they must be fully closed and reopened once to adopt the new SW. Every deploy after that auto-updates. UP-02 captures this.

### UP-01 — New deploy is picked up automatically
**Preconditions:** App already open/installed on a device running a build that *already* includes `skipWaiting`/`clientsClaim`.
**Steps:**
1. Make a small, visible change (e.g. tweak a heading) and deploy it via the normal GitHub Actions pipeline. Wait for the Action to finish.
2. On the device, reopen the app (or refresh once).
**Expected:** Within a moment the page reloads itself and the visible change appears — without clearing site data, uninstalling, or manually closing the app.

### UP-02 — First transition from a pre-fix build
**Preconditions:** Device running the *old* service worker (the build before `skipWaiting`/`clientsClaim` was added).
**Steps:** Deploy the build that adds the fix. Refresh once — observe it may NOT update. Then fully close the app (swipe-close the PWA / close all tabs) and reopen.
**Expected:** After the full close-and-reopen, the new version is active. (This is the expected one-time behavior; subsequent deploys follow UP-01.)

### UP-03 — Update while the app is open
**Preconditions:** App open and in use on a build with the fix.
**Steps:** Deploy a new build while the app stays open. Continue interacting; trigger a navigation or wait for the next update check.
**Expected:** The app auto-reloads into the new version. Any in-progress unsaved input is lost on reload (acceptable), but no crash or broken state results.

### UP-04 — Data freshness is independent of shell version
**Preconditions:** App open on any build.
**Steps:** Change an assignment's status directly in the Sheet (or from another device). Wait for the poll / pull to refresh.
**Expected:** New chore data appears regardless of app-shell version (the Apps Script API uses a NetworkFirst strategy, so data is not pinned to the cached shell). Confirms a stale shell never serves stale *data*.

### UP-05 — Offline still loads the cached shell
**Preconditions:** App opened at least once (shell cached). Device set to airplane mode / offline.
**Steps:** Launch the app offline.
**Expected:** The app shell loads from cache (no browser "no internet" error page). Data calls fail gracefully (show last cached data or an error/empty state), and the app recovers when back online.

---

## 15. Chore Location, Description & Search

These cases cover the enhancements: a `location` (dropdown) and `description` on chores, a searchable Manage Chores list, and add-from-search. Requires a `Locations` tab in the sheet with a few rows, and `location`/`description` columns on the Chores tab.

### LOC-01 — Location dropdown is populated from the Locations tab
**Preconditions:** Logged in as admin. `Locations` tab has rows (e.g. Kitchen, Living room, Garage).
**Steps:** Manage Chores → **+ Add** → open the Location dropdown.
**Expected:** The dropdown lists a "(none)" option plus every row from the `Locations` tab, in sheet order.

### LOC-02 — Save a chore with a location
**Steps:** In the add form, pick a location, fill name/points, save.
**Expected:** New Chores row has the chosen value in the `location` column. The chore row in the list shows the location as a tag.

### LOC-03 — Location appears on the Today card
**Preconditions:** A chore with a location has an assignment today (run the generator if needed).
**Steps:** Open the Today screen.
**Expected:** The chore card shows the location as a small tag next to the name — distinguishing e.g. "Vacuum · Kitchen" from "Vacuum · Living room".

### LOC-04 — Editing preserves a legacy/unlisted location
**Preconditions:** A chore whose `location` value is not in the current `Locations` tab (edit the sheet to create this state).
**Steps:** Edit that chore.
**Expected:** The dropdown still shows the current value selected (not blanked). Saving without touching it keeps the value.

### DESC-01 — Save and display a description
**Steps:** Add/edit a chore, type a description, save. Ensure it has an assignment today.
**Expected:** `description` persists to the Chores row. The Today card shows the description as a muted secondary line.

### DESC-02 — Empty description shows nothing
**Steps:** View a chore with a blank description on the Today card.
**Expected:** No empty line or stray element is rendered.

### SR-01 — Search filters the chore list
**Preconditions:** Several chores exist.
**Steps:** Manage Chores → type part of a chore name in the search box.
**Expected:** Active and Inactive lists filter live to matches. Clearing the box restores the full lists.

### SR-02 — Search matches location and description
**Steps:** Search a term that appears only in a chore's location, then one only in a description.
**Expected:** Matching chores appear in both cases (search covers name + location + description, case-insensitive).

### SR-03 — Add-from-search when nothing matches
**Steps:** Search a term with no matches (e.g. "Reorganize closet").
**Expected:** A "No chores match …" message and an **Add "Reorganize closet"** button appear. Tapping it opens the add form with the name prefilled.

### SR-04 — Search matches the default assignee's name
**Preconditions:** At least one chore has a default assignee (e.g. Sam).
**Steps:** Type the assignee's name (e.g. "Sam") in the search box.
**Expected:** Chores whose default assignee is Sam appear (matching the displayed 👤 name tag, case-insensitive). Each active row shows the assignee as a tag.

### SR-05 — Search "Unclaimed" finds chores with no default assignee
**Preconditions:** At least one chore has an empty `default_assignee`.
**Steps:** Type "unclaimed" in the search box.
**Expected:** Only chores with no default assignee appear — these display an **Unclaimed** tag in their row, which is also what the search matches.

### REG-01 — Existing add/edit/complete unaffected
**Steps:** Create a chore without a location/description; complete a normal assignment; approve one.
**Expected:** All existing flows work unchanged; blank location/description cause no errors anywhere.

---

## 16. Tap Target, Overflow Menu & Sent-Back Feedback (v0.2.2 fixes)

Covers issue-log items 3–6. Test on iOS Safari where the bugs were reported.

### TAP-01 — Completing requires tapping the circle
**Preconditions:** An open chore assigned to you on Today.
**Steps:** Tap the chore's **name** and elsewhere on the card body (not the circle).
**Expected:** Nothing happens — the chore is NOT marked done. Tapping the **circle** marks it done (and for an unassigned chore, claims it).

### TAP-02 — Dismissing the overflow menu doesn't complete
**Preconditions:** Admin; a chore with the three-dot menu.
**Steps:** Open the three-dot menu, then tap outside it to dismiss.
**Expected:** The menu closes and the chore is NOT marked complete.

### TAP-03 — Move date / Reassign work on your own chore
**Preconditions:** Admin, viewing a chore **assigned to you**.
**Steps:** Open the three-dot menu → tap **Move date**; repeat → tap **Reassign**.
**Expected:** The date picker / person picker opens each time (previously these were no-ops on your own chores). Confirm they still open for a family member's chore too.

### FB-01 — Child sees sent-back feedback with reviewer name
**Preconditions:** A child completes an approval-required chore (→ pending). An admin sends it back with a note.
**Steps:** Log in as the child and open Today.
**Expected:** The chore is back in My Chores (open) and shows "Sent back by {admin name}: {note}". Tapping the circle to re-complete it clears the note.

### FB-02 — Re-completing clears the note
**Steps:** After FB-01, re-complete the chore, then (if approval required) have the admin approve it.
**Expected:** The sent-back note no longer appears on the card.

### RM-01 — "Did it" is gone
**Steps:** Open Manage Chores.
**Expected:** Each chore row shows only **Edit** (no "✓ Did it"). No console errors. A direct `POST ?action=log_done` returns an "Unknown action" error.

---

## 17. List Ordering, Uncheck, Overdue & One-Time Tasks

Covers the v0.2.0 batch (enhancements 5–8). Requires the `once_date` column on the Chores tab and the redeployed Apps Script.

### ORD-01 — Finished chores sort to the bottom
**Preconditions:** A person has a mix of open and done chores today.
**Steps:** Open Today.
**Expected:** Open chores appear above done/skipped ones; finished chores are grayed and grouped at the bottom of the section.

### ORD-02 — Overdue chores sort to the top
**Preconditions:** The person has both a today chore and an overdue (past-due, still open) chore.
**Steps:** Open Today.
**Expected:** The overdue chore appears above today's open chores, with an "Overdue · MM-DD" badge.

### ORD-03 — Kid sees own pending chore in amber
**Preconditions:** Non-admin. A chore that requires approval.
**Steps:** Complete it.
**Expected:** It stays visible in My Chores as an amber card with a "Waiting for review" badge (does not vanish).

### UNC-01 — Uncheck an auto-done chore
**Preconditions:** A chore (no approval needed) the user completed today.
**Steps:** Tap "Undo" on the done card → confirm in the dialog.
**Expected:** Card reverts to open and moves back up; the person's `points_total` drops by the awarded points; assignment row shows `status=open`, blank `completed_at`/`points_awarded`.

### UNC-02 — Uncheck a pending chore
**Preconditions:** A non-admin's chore is in `pending_review`.
**Steps:** Tap "Undo" → confirm.
**Expected:** Reverts to open. No points change (none were awarded).

### UNC-03 — Approved chores cannot be unchecked
**Preconditions:** A chore that was completed and then **approved** by an admin (`reviewed_by` set).
**Steps:** View the done card; also try a direct `POST ?action=uncomplete`.
**Expected:** No "Undo" button is shown on the card; the direct API call returns an error ("Approved chores cannot be unchecked"). Points are unchanged.

### UNC-04 — Uncheck confirmation can be cancelled
**Steps:** Tap "Undo" → tap "Cancel".
**Expected:** Nothing changes; the chore stays done.

### UNC-05 — Points never go negative
**Preconditions:** A person with low `points_total`.
**Steps:** Uncheck a chore worth more points than their total (edge case).
**Expected:** `points_total` clamps at 0, not negative.

### OVD-01 — Overdue persists across days
**Preconditions:** An open assignment with `due_date` set to a past date (edit the sheet or leave one unfinished overnight).
**Steps:** Open Today.
**Expected:** It still appears, flagged Overdue, regardless of how old it is (no age cutoff).

### OVD-02 — Resolving/bumping clears overdue
**Steps:** Complete the overdue chore (or admin bumps it to a future date).
**Expected:** On complete → moves to the done group (today). On bump to a future date → disappears from Today. Future-dated assignments never show on Today.

### ONCE-01 — One-time task generates exactly once
**Preconditions:** Create a chore with frequency "One-time" and today's date.
**Steps:** Run `runNightlyGenerator`; then run it again.
**Expected:** Exactly one assignment created; the chore's `active` becomes `FALSE`; the second run creates no duplicate.

### ONCE-02 — One-time catch-up
**Preconditions:** A "once" chore whose `once_date` is in the past and `last_generated_date` is blank.
**Steps:** Run `runNightlyGenerator`.
**Expected:** The assignment is generated (catch-up) and the chore auto-archives.

### ONCE-03 — One-time form round-trip
**Steps:** Add a chore as "One-time" with a date; reopen it in the editor.
**Expected:** Frequency shows "One-time" and the date field holds the saved `once_date`.

---

## 18. Next-Due, First-Due, Sort, Description & Make-Unclaimed (v0.3.0)

Covers enhancements 10–15. Requires the `start_date` column on the Chores tab and the redeployed Apps Script.

### ND-01 — Next-due tag on the Chores screen
**Preconditions:** Active chores of varied frequencies.
**Steps:** Open Manage Chores.
**Expected:** Each non-daily chore shows a "Next: …" tag — a weekday name for weekly/custom (e.g. "Tuesday", or "Today"), a date for monthly/interval/once. Daily chores show no next-due tag. (Today screen unchanged — no next-due there.)

### FD-01 — First due date defers generation
**Preconditions:** Add a chore with a future "First due date" (`start_date`).
**Steps:** Run `runNightlyGenerator` before that date, then on/after it.
**Expected:** No assignment is created before `start_date`; it generates on/after. The value round-trips in the editor.

### SORT-01 — Sort the Chores screen
**Steps:** Use the Sort dropdown: Location, Assignee, Periodicity, Next due.
**Expected:** Location → A–Z (blank last); Assignee → unclaimed first, then by name; Periodicity → daily→weekly→custom→monthly→interval→once; Next due → soonest first. "Default" restores sheet order.

### DESC-COLLAPSE-01 — Collapsible description
**Preconditions:** A chore with a long description.
**Steps:** View it on Manage Chores and on the Today card.
**Expected:** It shows one line with a carat; tapping expands to full text and collapses again. Short descriptions show in full with no carat.

### UNCLAIM-01 — Make a chore unclaimed from Today
**Preconditions:** An assigned, open chore on Today (as admin).
**Steps:** Three-dot menu → **↩ Make unclaimed**.
**Expected:** The chore moves to "Available to Claim" (assignee cleared) immediately and stays there after reload. The `Assignments` row has an empty `person_id`. No errant push is sent.

---

## 19. Last-Done, Monthly nth-Weekday, Due-Today & Frequency Colors (v1.0.0)

Covers enhancements 9, 16, 17, 18. Requires the new `monthly_week` / `monthly_weekday` columns on the Chores tab and the redeployed Apps Script.

### LD-01 — "Last done" tag on the Chores screen (#9)
**Preconditions:** A chore that has at least one completed (done) assignment.
**Steps:** Open Manage Chores.
**Expected:** The chore shows a "Last done: MMM D" tag reflecting the most recent completion (approved counts as done). A chore never completed shows no "Last done" tag. The value is display-only (not stored on the chore).

### MNW-01 — Create a monthly "nth weekday" chore (#16)
**Steps:** Add a chore, frequency **Monthly**, choose the **Day of week** toggle, select e.g. "Second" + "Friday". Save, then reopen the editor.
**Expected:** The editor round-trips the selection (Second / Friday). On Manage Chores the "Next:" tag shows the correct upcoming date. Switching the toggle to **Day of month** clears the nth-weekday fields (and vice-versa) so only one style is stored.

### MNW-02 — nth-weekday generates on the right day (#16)
**Preconditions:** A monthly nth-weekday chore (e.g. second Friday). 
**Steps:** Run `runNightlyGenerator` on the target nth weekday (and confirm it does NOT generate on other Fridays). Catch-up: set `last_generated_date` to last month and run after the target day this month.
**Expected:** Exactly one assignment on the correct nth weekday; catch-up generates once if the day was missed. Existing day-of-month monthly chores still behave as before.

### DUE-TODAY-01 — Chore created due today appears immediately (#17)
**Steps:** As admin, add a chore whose schedule makes it due today (e.g. Daily, or Weekly on today's weekday). Return to Today (refresh).
**Expected:** An assignment for the new chore appears on Today right away, without waiting for the nightly generator. Editing an existing chore so it becomes due today also surfaces it. Re-saving does not create a duplicate for the same day.

### FREQ-COLOR-01 — Frequency color-coding on Today (#18)
**Preconditions:** Open chores of daily, weekly, and other (monthly/interval/once) frequencies on Today.
**Steps:** View the Today screen.
**Expected:** Open cards are tinted — daily light blue, weekly (and custom) light green, all others light yellow. A pending-approval card still shows amber and a sent-back card still shows red (frequency tint does not override those). Done/skipped cards stay greyed out with no frequency tint.

---

## 20. Quick-Add from Today (v1.1.0)

Covers enhancement 19. Requires the redeployed Apps Script (uses the #17 generate-on-create helper).

### QA-01 — Any user can quick-add a chore from Today
**Preconditions:** Signed in as a **non-admin**.
**Steps:** On the Today screen tap **+ Add**, enter a name (e.g. "Water plants"), tap **Add**.
**Expected:** The sheet closes and the chore appears under **My Chores** right away (assigned to you, worth 1 pt, no approval). An empty name is rejected with a "Name is required" toast and no chore is created.

### QA-02 — Quick-added chore is a one-time chore in Inactive
**Steps:** After QA-01, open **Manage Chores** (as admin) and look in the **Inactive** section.
**Expected:** The chore is listed there (frequency `once`; it auto-archived after generating today's assignment). Completing today's assignment awards 1 pt with no approval step.

### QA-03 — Admin promotes a quick-added chore to recurring
**Steps:** In Manage Chores → Inactive, tap **Edit** on the quick-added chore. Change frequency (e.g. Daily), tick **Active**, Save. Run `runNightlyGenerator` (or wait for the nightly run).
**Expected:** The chore now generates on its recurring schedule going forward; no duplicate is created for today.

---

## 21. Quick-Add Assignee, Today Sort & Due Tag (v1.2.0)

Covers enhancements 20 and 22, plus the per-card "Due …" tag (display groundwork for 21/23). Frontend-only; works even before the Apps Script backend is redeployed (the new `lead_days`/`missed_count` fields degrade gracefully).

### QAA-01 — Admin can assign a quick-add to someone else
**Preconditions:** Signed in as an **admin**.
**Steps:** Today → **+ Add** → enter a name → in **Assign to**, pick another person (or **Unclaimed**) → **Add**.
**Expected:** The chore is created for the chosen person (appears in their Family section, or in **Available to Claim** if Unclaimed). Defaulting the picker to **Me** still assigns to the creator.

### QAA-02 — Non-admin sees no assignee field
**Preconditions:** Signed in as a **non-admin**.
**Steps:** Today → **+ Add**.
**Expected:** No "Assign to" control; the chore is always self-assigned (as in v1.1.0).

### TSORT-01 — Sort the Today screen
**Steps:** Use the **Sort** dropdown: Due date, then Frequency, then back to Default.
**Expected:** Items reorder **within** the My Chores / Family / Available sections (sections are not merged). Due date → soonest/most-overdue first; Frequency → daily→weekly→custom→monthly→interval→once. Finished (done/skipped) items stay at the bottom of their section in every mode. Default restores the overdue-first ordering.

### DUETAG-01 — "Due …" tag on every card
**Preconditions:** Assignments due today and at least one overdue.
**Steps:** View the Today screen.
**Expected:** Each open/pending card shows a **Due …** tag — "Today", "Tomorrow", a weekday name (next few days), or a short date (further out / past). Overdue cards additionally show **Overdue Nd** with the correct day count. Done/skipped cards show no Due tag.

---

## 22. Lead-Time Appearance & Missed-Chore Penalty (v1.3.0)

Covers enhancements 21 and 23 — the generator rewrite. **Requires** the redeployed Apps Script **and** the new sheet columns: `lead_days` on **Chores** and `missed_count` on **Assignments**. Run `runNightlyGenerator` manually from the Apps Script editor to drive these without waiting for 12:01am.

### LEAD-01 — Non-daily chore appears early with its real due date
**Preconditions:** A weekly chore due Sunday, `lead_days` blank (default 4).
**Steps:** On the previous **Thursday**, run the generator; check Today.
**Expected:** An assignment appears with **due_date = the upcoming Sunday** (not Thursday). Its card shows **Due Sunday** and is *not* flagged overdue. Running the generator on the previous Wednesday produces nothing (window not open yet). A monthly chore (`lead_days` 7) appears the previous Monday.

### LEAD-02 — Editor lead field round-trips
**Steps:** Edit a weekly chore, set **Days to complete (appears early)** to 2, save, reopen.
**Expected:** The value persists (`lead_days` = 2 on the Chores row) and the chore now appears only 1 day early. Blank shows the frequency default as placeholder.

### MISS-01 — Missed daily chore carries over (no duplicate) + point penalty
**Preconditions:** A daily chore assigned to a child, worth N points, with yesterday's assignment still **open**.
**Steps:** Run the generator (simulating the next day).
**Expected:** Still **one** open assignment for that chore (no duplicate), its `missed_count` incremented, the card shows **Overdue 1d / missed 1×**, and the child's leaderboard total dropped by **N** (never below 0). Completing it clears it; the next day generates a fresh assignment.

### MISS-02 — Penalty is once per recurrence, not per day
**Preconditions:** A weekly chore (lead 4) left open past its Sunday due date.
**Steps:** Run the generator on Mon–Wed (still overdue, before the next appear day), then on the next **Thursday** (next recurrence).
**Expected:** No point deduction Mon–Wed (card just shows growing **Overdue Nd**); exactly **one** deduction + `missed_count` bump on Thursday. Never more than one open row for the chore.

### MISS-03 — No penalty for completed or unassigned
**Steps:** (a) Complete an overdue chore before the next recurrence; (b) leave an **unassigned** overdue chore open across a recurrence.
**Expected:** (a) no penalty, a fresh assignment generates normally; (b) it still carries over and bumps `missed_count`, but no points are deducted (nobody to penalize).

---

## 23. Bug fixes — Weekly add, First-due window, iOS claim, Ghost assignments (v1.3.1)

Covers issue-log #8–#11. Frontend (#8, #10) + Apps Script (#9, #11); no new sheet columns.

### BUG-08 — Weekly chore weekday saves and generates
**Steps:** Add a chore, frequency **Weekly**, pick a weekday from the dropdown (e.g. Tuesday), save.
**Expected:** The weekday persists (it no longer resets while editing). `custom_days` holds the 0–6 value; the chore generates an assignment on/around that weekday and appears on Today (previously it saved blank and never reached Assignments). Editing an existing weekly chore preselects its current weekday.

### BUG-09 — Future first-due chore appears in its lead window
**Preconditions:** Create an interval/weekly/monthly chore with a **First due date** a few days out (e.g. July 5).
**Expected:** It appears on Today within its lead window as **"Due Jul 5"** (not overdue), rather than only on the due date. A **daily** chore with a future first-due date still waits until that date (no lead). The Chores screen "Next:" tag matches.

### BUG-10 — Claiming works on iOS Safari
**Preconditions (iOS Safari):** An unassigned chore in **Available to Claim**.
**Steps:** Tap the **"Tap to claim"** button (and separately the circle).
**Expected:** The chore is claimed and moves to **My Chores** in both cases. (Regression check desktop/Android: claiming still works.)

### BUG-11 — Deleted chore's assignments stop showing
**Steps:** Delete a chore's row directly in the Chores sheet (leaving its Assignments rows behind). Refresh Today (and History).
**Expected:** Assignments referencing the now-missing chore no longer appear (no blank "ghost" cards). Valid chores' assignments are unaffected. Note: the orphan rows remain in the sheet (intentionally not auto-deleted) — they're just hidden.

---

## Summary Table

| Area | Total Cases | Security Cases |
|---|---|---|
| Onboarding | 9 | — |
| Today Screen | 6 | — |
| Completing Chores | 6 | — |
| Admin Approval | 7 | — |
| Admin Reassign/Bump | 5 | — |
| Leaderboard | 4 | — |
| Chore Admin | 10 | — |
| History | 5 | — |
| Generator/Scheduled Jobs | 6 | — |
| Push Notifications | 9 | — |
| Google Sheets Direct | 6 | — |
| Security/Pen Tests | 10 | 10 |
| Responsive & Safe-Area Layout | 10 | — |
| App Updates (Service Worker) | 5 | — |
| Chore Location, Description & Search | 12 | — |
| Tap Target, Overflow Menu & Sent-Back Feedback | 6 | — |
| List Ordering, Uncheck, Overdue & One-Time | 14 | — |
| Next-Due, First-Due, Sort, Description & Make-Unclaimed | 5 | — |
| Last-Done, Monthly nth-Weekday, Due-Today & Frequency Colors | 5 | — |
| Quick-Add from Today | 3 | — |
| Quick-Add Assignee, Today Sort & Due Tag | 4 | — |
| Lead-Time Appearance & Missed-Chore Penalty | 5 | — |
| Bug fixes — Weekly add, First-due window, iOS claim, Ghost assignments | 4 | — |
| **Total** | **156** | **10** |

---

## Test Results Tracker

Copy the table below into a spreadsheet. Fill in **Tester**, **Date**, **Result** (Pass / Fail / Blocked / Skip), and **Notes** as you go. Add extra rows for any edge cases you discover.

| ID | Section | Description | Tester | Date | Result | Notes |
|---|---|---|---|---|---|---|
| OB-01 | Onboarding | First visit shows person picker | | | | |
| OB-02 | Onboarding | Person selection persists after close/reopen | | | | |
| OB-03 | Onboarding | Desktop skips Add to Home Screen step | | | | |
| OB-04 | Onboarding | iOS shows Add to Home Screen instructions | | | | |
| OB-05 | Onboarding | Android shows install prompt | | | | |
| OB-06 | Onboarding | Notification permission granted | | | | |
| OB-07 | Onboarding | Notification permission denied — app still works | | | | |
| OB-08 | Onboarding | Skip notifications | | | | |
| OB-09 | Onboarding | Different browser / incognito starts fresh | | | | |
| TD-01 | Today Screen | Today's assignments load | | | | |
| TD-02 | Today Screen | Family section shows others' chores | | | | |
| TD-03 | Today Screen | Unassigned chore appears as claimable | | | | |
| TD-04 | Today Screen | Auto-refresh every 30 seconds | | | | |
| TD-05 | Today Screen | Manual refresh button | | | | |
| TD-06 | Today Screen | All done state | | | | |
| CH-01 | Completing Chores | Mark done — no approval required | | | | |
| CH-02 | Completing Chores | Mark done — requires approval (non-admin) | | | | |
| CH-03 | Completing Chores | Pending chore cannot be re-tapped | | | | |
| CH-04 | Completing Chores | Skip a chore | | | | |
| CH-05 | Completing Chores | Claim an unassigned chore | | | | |
| CH-06 | Completing Chores | Claim is reflected for all users | | | | |
| AP-01 | Admin Approval | Admin sees "Needs review" section | | | | |
| AP-02 | Admin Approval | Admin sees no "Needs review" when nothing pending | | | | |
| AP-03 | Admin Approval | Non-admin does not see "Needs review" | | | | |
| AP-04 | Admin Approval | Approve a pending chore | | | | |
| AP-05 | Admin Approval | Reject without a note | | | | |
| AP-06 | Admin Approval | Reject with a note | | | | |
| AP-07 | Admin Approval | Admin completing own chore bypasses approval | | | | |
| RB-01 | Reassign / Bump | Reassign a chore to another person | | | | |
| RB-02 | Reassign / Bump | Bump a chore to a future date | | | | |
| RB-03 | Reassign / Bump | Bump a chore back to today | | | | |
| RB-04 | Reassign / Bump | Reassign controls not visible to non-admin | | | | |
| RB-05 | Reassign / Bump | Admin manually assigns a new chore | | | | |
| LB-01 | Leaderboard | Points display correctly | | | | |
| LB-02 | Leaderboard | Week points derived from assignments | | | | |
| LB-03 | Leaderboard | Streak display | | | | |
| LB-04 | Leaderboard | Pending review does not count toward streak | | | | |
| CA-01 | Chore Admin | Admin can access Chores screen | | | | |
| CA-02 | Chore Admin | Non-admin cannot access Chores screen via nav | | | | |
| CA-03 | Chore Admin | Add a daily chore | | | | |
| CA-04 | Chore Admin | Add a weekly chore (specific day) | | | | |
| CA-05 | Chore Admin | Add a custom days chore | | | | |
| CA-06 | Chore Admin | Add a monthly chore | | | | |
| CA-07 | Chore Admin | Add an interval chore | | | | |
| CA-08 | Chore Admin | Edit a chore | | | | |
| CA-09 | Chore Admin | Deactivate a chore | | | | |
| CA-10 | Chore Admin | Requires approval toggle | | | | |
| HI-01 | History | Completed chores appear in history | | | | |
| HI-02 | History | Skipped chores appear in history | | | | |
| HI-03 | History | Rejected chores show review note | | | | |
| HI-04 | History | Admin can filter by person | | | | |
| HI-05 | History | Non-admin has no person filter | | | | |
| GN-01 | Generator | Generator creates daily assignments | | | | |
| GN-02 | Generator | Generator does not duplicate | | | | |
| GN-03 | Generator | Monthly chore catch-up | | | | |
| GN-04 | Generator | Interval chore catch-up | | | | |
| GN-05 | Generator | Streak increments on full completion | | | | |
| GN-06 | Generator | Streak resets on incomplete day | | | | |
| PN-01 | Push Notifications | FCM token registered on permission grant | | | | |
| PN-02 | Push Notifications | Reminder fires for open assignment | | | | |
| PN-03 | Push Notifications | No reminder for completed assignment | | | | |
| PN-04 | Push Notifications | Admin receives pending review digest | | | | |
| PN-05 | Push Notifications | Reassign triggers immediate push | | | | |
| PN-06 | Push Notifications | Bump triggers immediate push | | | | |
| PN-07 | Push Notifications | Background notification (app closed) | | | | |
| PN-08 | Push Notifications | Foreground notification (app open) | | | | |
| PN-09 | Push Notifications | Missing FCM token — no error | | | | |
| SH-01 | Sheets Direct | Add a person directly in Sheets | | | | |
| SH-02 | Sheets Direct | Edit chore points in Sheets | | | | |
| SH-03 | Sheets Direct | Deactivate a chore in Sheets | | | | |
| SH-04 | Sheets Direct | Manually set assignment status to done in Sheets | | | | |
| SH-05 | Sheets Direct | Manually add an assignment row in Sheets | | | | |
| SH-06 | Sheets Direct | Cache invalidation delay (20s expected) | | | | |
| SEC-01 | Security | Fake admin via localStorage manipulation | | | | |
| SEC-02 | Security | Direct API call as non-admin to approve endpoint | | | | |
| SEC-03 | Security | Approve your own pending chore | | | | |
| SEC-04 | Security | Access the app URL from outside the household | | | | |
| SEC-05 | Security | Replay a POST request | | | | |
| SEC-06 | Security | Enumerate other people's data | | | | |
| SEC-07 | Security | Modify the Spreadsheet directly | | | | |
| SEC-08 | Security | Apps Script URL is public | | | | |
| SEC-09 | Security | Firebase config exposure | | | | |
| SEC-10 | Security | Rate limiting and quota exhaustion | | | | |
| LY-01 | Layout | Top header clears status bar (standalone PWA) | | | | |
| LY-02 | Layout | Top header clears status bar (Safari browser) | | | | |
| LY-03 | Layout | ChoreForm Add buttons visible (Safari browser) | | | | |
| LY-04 | Layout | ChoreForm buttons stay pinned on a long form | | | | |
| LY-05 | Layout | ChoreForm buttons clear home indicator (standalone) | | | | |
| LY-06 | Layout | Reassign person picker buttons visible | | | | |
| LY-07 | Layout | Move date (bump) sheet buttons visible | | | | |
| LY-08 | Layout | Reject-note modal buttons visible | | | | |
| LY-09 | Layout | Android regression check (no layout change) | | | | |
| LY-10 | Layout | Desktop regression check | | | | |
| UP-01 | App Updates | New deploy is picked up automatically | | | | |
| UP-02 | App Updates | First transition from a pre-fix build | | | | |
| UP-03 | App Updates | Update while the app is open | | | | |
| UP-04 | App Updates | Data freshness independent of shell version | | | | |
| UP-05 | App Updates | Offline still loads the cached shell | | | | |
| LOC-01 | Location/Search | Location dropdown populated from Locations tab | | | | |
| LOC-02 | Location/Search | Save a chore with a location | | | | |
| LOC-03 | Location/Search | Location appears on the Today card | | | | |
| LOC-04 | Location/Search | Editing preserves a legacy/unlisted location | | | | |
| DESC-01 | Location/Search | Save and display a description | | | | |
| DESC-02 | Location/Search | Empty description shows nothing | | | | |
| SR-01 | Location/Search | Search filters the chore list | | | | |
| SR-02 | Location/Search | Search matches location and description | | | | |
| SR-03 | Location/Search | Add-from-search when nothing matches | | | | |
| SR-04 | Location/Search | Search matches the default assignee's name | | | | |
| SR-05 | Location/Search | Search "Unclaimed" finds chores with no default assignee | | | | |
| ORD-01 | Ordering/Overdue | Finished chores sort to the bottom | | | | |
| ORD-02 | Ordering/Overdue | Overdue chores sort to the top | | | | |
| ORD-03 | Ordering/Overdue | Kid sees own pending chore in amber | | | | |
| UNC-01 | Uncheck | Uncheck an auto-done chore (points removed) | | | | |
| UNC-02 | Uncheck | Uncheck a pending chore (no points change) | | | | |
| UNC-03 | Uncheck | Approved chores cannot be unchecked | | | | |
| UNC-04 | Uncheck | Uncheck confirmation can be cancelled | | | | |
| UNC-05 | Uncheck | Points never go negative | | | | |
| OVD-01 | Ordering/Overdue | Overdue persists across days (no cutoff) | | | | |
| OVD-02 | Ordering/Overdue | Resolving/bumping clears overdue | | | | |
| ONCE-01 | One-Time | One-time task generates exactly once + auto-archives | | | | |
| ONCE-02 | One-Time | One-time catch-up generates when date is past | | | | |
| ONCE-03 | One-Time | One-time form round-trip | | | | |
| REG-01 | Location/Search | Existing add/edit/complete unaffected | | | | |
| TAP-01 | Tap/Overflow/Feedback | Completing requires tapping the circle | | | | |
| TAP-02 | Tap/Overflow/Feedback | Dismissing overflow menu doesn't complete | | | | |
| TAP-03 | Tap/Overflow/Feedback | Move date / Reassign work on your own chore | | | | |
| FB-01 | Tap/Overflow/Feedback | Child sees sent-back feedback with reviewer name | | | | |
| FB-02 | Tap/Overflow/Feedback | Re-completing clears the note | | | | |
| RM-01 | Tap/Overflow/Feedback | "Did it" is removed from Manage Chores | | | | |
| ND-01 | NextDue/Sort/Unclaim | Next-due tag on Chores screen (weekday/date; none for daily) | | | | |
| FD-01 | NextDue/Sort/Unclaim | First due date defers generation | | | | |
| SORT-01 | NextDue/Sort/Unclaim | Sort by location/assignee/periodicity/next-due | | | | |
| DESC-COLLAPSE-01 | NextDue/Sort/Unclaim | Collapsible description (both screens) | | | | |
| UNCLAIM-01 | NextDue/Sort/Unclaim | Make a chore unclaimed from Today | | | | |
| LD-01 | v1.0.0 | "Last done" tag on the Chores screen | | | | |
| MNW-01 | v1.0.0 | Create a monthly "nth weekday" chore (round-trips) | | | | |
| MNW-02 | v1.0.0 | nth-weekday generates on the right day (+catch-up) | | | | |
| DUE-TODAY-01 | v1.0.0 | Chore created due today appears immediately | | | | |
| FREQ-COLOR-01 | v1.0.0 | Frequency color-coding on Today (pending/rejected override) | | | | |
| QA-01 | v1.1.0 | Any user can quick-add a chore from Today | | | | |
| QA-02 | v1.1.0 | Quick-added chore is a one-time chore in Inactive | | | | |
| QA-03 | v1.1.0 | Admin promotes a quick-added chore to recurring | | | | |
| QAA-01 | v1.2.0 | Admin can assign a quick-add to someone else | | | | |
| QAA-02 | v1.2.0 | Non-admin sees no assignee field | | | | |
| TSORT-01 | v1.2.0 | Sort the Today screen (within sections) | | | | |
| DUETAG-01 | v1.2.0 | "Due …" tag on every card | | | | |
| LEAD-01 | v1.3.0 | Non-daily chore appears early with real due date | | | | |
| LEAD-02 | v1.3.0 | Editor lead field round-trips | | | | |
| MISS-01 | v1.3.0 | Missed daily carries over + point penalty | | | | |
| MISS-02 | v1.3.0 | Penalty once per recurrence, not per day | | | | |
| MISS-03 | v1.3.0 | No penalty for completed / unassigned | | | | |
| BUG-08 | v1.3.1 | Weekly chore weekday saves and generates | | | | |
| BUG-09 | v1.3.1 | Future first-due chore appears in lead window | | | | |
| BUG-10 | v1.3.1 | Claiming works on iOS Safari | | | | |
| BUG-11 | v1.3.1 | Deleted chore's assignments stop showing | | | | |
