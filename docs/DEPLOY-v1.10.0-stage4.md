# Chore app — deploying v1.10.0 (Stage 4)

Branch: **`stage-4`**

**Deploy Stage 3 first** — this builds on it.

> This release changes the spreadsheet schema and needs a **one-time migration
> script** run against your live data. Read step 3 before starting.

---

## 1. Run the tests

```bash
cd frontend && npm test
```

Never executed on the authoring side — node isn't installed there.

## 2. Apps Script — THREE files

- `DateUtils.gs`
- `Endpoints.gs`
- `Generator.gs`

Then **Deploy → Manage deployments → Edit → New version → Deploy**.

No `setup()` re-run — the triggers are unchanged.

## 3. Add the column, then migrate

**First**, add a `weekday_due` column to the `Chores` tab. Put it after
`frequency` for readability; the code finds columns by header name, so the exact
position doesn't matter. Leave every cell blank.

**Then** run `migrateWeekdayDue` from the Apps Script function dropdown. It
converts each chore and logs every change (View → Executions, or the log pane):

| Before | After |
|---|---|
| `custom` + `custom_days` = `monday,thursday` | `daily` + `weekday_due` = `1,4` |
| `weekly` + `custom_days` = `0` | `weekly` + `weekday_due` = `0` |
| `monthly_weekday` = `5` | `weekday_due` = `5` |

Rows that already have a `weekday_due` are skipped, so running it twice is a
no-op rather than a double-conversion. Anything it can't read is logged as `SKIP`
with the chore id — check the log for those and fix them by hand.

It also clears any explicit `lead_days` on converted custom chores. Those were
set against weekly's 4-day window, and daily is pinned to 1, so leaving them
would be misleading.

**Leave `custom_days` and `monthly_weekday` in the sheet for now.** Nothing reads
them anymore, and keeping them means a rollback doesn't lose data. Delete them
once you're happy, in a week or two.

## 4. Verify

Run `runNightlyGenerator` by hand, then check:

- chores that were `custom` now read `daily` with weekdays in `weekday_due`
- they appear under **Every day** on the Today screen, not This week
- a weekly chore still lands on its usual day
- a monthly "second Friday" chore still resolves correctly

The app footer should read **v1.10.0**.

---

## What changed and why

`custom` existed to make something happen **on** Monday and Thursday — but it
inherited *weekly's* treatment, including a 4-day lead window, which is the
opposite of what "on those days" means. So it's folded into `daily`, which keeps
its lead pinned at 1.

The frequency now encodes **expectation**, not just cadence:

- **daily** — must happen on these days. Appears on the day, closes the next.
- **weekly** — must happen sometime this week. Appears several days early.

`weekday_due` replaces two columns. The old `custom_days` held a bare *number* for
weekly but day *names* for custom — two incompatible formats in one column, which
is what made the Chores tab unreadable. The new one is always weekday numbers,
0 = Sunday; most frequencies just use a list of one.

**Interval chores can now land on a chosen weekday.** Set `weekday_due` and the
occurrence rolls forward to the first such day after the interval elapses — handy
for keeping big jobs on a weekend. Note the next interval counts from that
snapped date, so the schedule drifts a little later each cycle. That was chosen
deliberately, but it's worth knowing.

Also deleted `sortPeriodDays`: cadence grouping keys straight off `frequency` now,
which is more correct under this model — a Mon/Thu chore belongs under **Every
day**, where the old arithmetic filed it under This week.

Full write-up in `2026_06_enhancements.md`, entry #45.

---

## Rolling back

Redeploy the previous Apps Script version and revert the merge. The old columns
are still in the sheet if you haven't deleted them, so the old code will read
them and carry on. The new `weekday_due` column is ignored by the old code and
can be left in place.
