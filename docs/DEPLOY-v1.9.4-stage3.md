# Chore app — deploying v1.9.4 (Stage 3)

Branch: **`stage-3`**
PR: https://github.com/necoleman/chore_app/pull/new/stage-3

Bug fixes found in live use after the v1.9.0 deploy, plus UI changes. Smaller
than Stage 2: **no `setup()` re-run and no spreadsheet changes.**

---

## 1. Run the tests

```bash
cd frontend && npm test
```

Still never executed on my side — node isn't installed on Rachel's machine.

## 2. Apps Script — THREE files

- `Generator.gs`
- `Endpoints.gs`
- `DateUtils.gs`

Then **Deploy → Manage deployments → Edit → New version → Deploy**.

Triggers are unchanged from Stage 2, so **don't re-run `setup()`**. No new columns
either — the sheet stays as it is.

## 3. Run the generator once, by hand

This is what repairs the chores currently stuck at old due dates. In the Apps
Script editor pick `runNightlyGenerator` and Run.

Expect from that single run:

- chores stuck at an old due date get that occurrence **closed** and a fresh one
  created **due today**, miss count up by one
- chores belonging to someone who was on vacation reappear **on their list**
- nothing dated in the past

Miss counts will jump on the repaired chores, and the points come off at that
moment. That's correct — a visible one-off hit as the backlog clears.

If anything is *still* sitting at an old due date after this run, say so. This fix
targets a cursor that has drifted ahead of the rows; something still stuck would
be a different cause.

---

## What's in it

**The cursor fix — the important one.** `last_generated_date` is meant to equal
the due date of the newest occurrence, but the pre-v1.9 code advanced it in two
places without creating a row: the rollover collapse and the vacation pause. Every
chore collapsed or paused on its final old-code run came out of the migration with
the cursor one occurrence ahead. The generator then computed a next occurrence
that hadn't come round yet, the appear gate blocked, and it returned *before*
reaching the code that closes the old row — stranding it as permanently overdue.
Re-running couldn't help, because the cursor was the input. Daily chores would
have healed a day later; a weekly one would have waited a week, a 90-day chore
three months.

**Vacation return recovers rotation chores.** Turning vacation on unclaims every
open row regardless of how the chore is assigned, so recovering only sole-assignee
ones left rotation chores orphaned permanently.

**Stranded priors close** even when a row for the current occurrence already
exists — the early return used to skip that check.

**The `⋯` menu no longer clips.** A v1.9.0 regression: the cadence stripe was a
child element needing `overflow: hidden`, which cut off the dropdown and hid Skip
entirely. Redrawn as an inset shadow.

**Add now asks One-off vs Surface early.** One-off is an extra due today, outside
the recurrence. Surface early brings the chore's genuine next occurrence forward,
keeping its real due date — so it can't re-trigger on the original date, because
it *is* that occurrence.

**Lead defaults are cadence-based again** — weekly/custom 4, monthly 7, every-N
`min(N,7)`, daily/once 1. Non-daily chores now appear on the list before they're
due without configuring anything. **Expect a longer Today list**; the not-yet-due
cards sort to the end of their cadence group.

**Card tweaks:** assignee chip removed (the section already says whose it is), and
interval chores read `x180 days`.

Full write-up in `2026_06_enhancements.md`, entries #41–44.

---

## Rolling back

Redeploy the previous Apps Script version and revert the merge. Nothing in this
release changes the spreadsheet, so there's no data to undo.
