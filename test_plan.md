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
| **Total** | **83** | **10** |

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
