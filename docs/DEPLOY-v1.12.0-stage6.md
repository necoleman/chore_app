# Chore app — deploying v1.12.0 (Stage 6)

Branch: **`stage-6`**

**Deploy Stage 5 first** — this builds on it.

No spreadsheet changes, no migration, and **no frontend changes at all**. Two
Apps Script files. The merge only ships a version bump, so the Apps Script paste
is the part that matters — do that first and the generator is fixed tonight.

---

## 1. Apps Script — TWO files

- `SheetUtils.gs`
- `Generator.gs`

Then **Deploy → Manage deployments → Edit → New version → Deploy**.

No `setup()` re-run — the triggers are unchanged.

## 2. Run `runNightlyGenerator` by hand

Don't wait for 3am. Run it from the function dropdown, then check the Chores tab:
**every active chore's `last_generated_date` should read today.**

If some are still behind, run it a second time — chores already generated bail
out before doing any work, so each pass is nearly free for them and spends its
budget on the ones still stuck.

## 3. Read the log

**View → Executions**, open the run, and look at the last line:

```
generator: DONE for 2026-08-29 — 47 chores, 12 created, 0 failed, 38s total
```

That line is the point of this release. It tells you:

- **the run finished** — if it's missing, the run was killed partway
- **how long it took** — compare against Apps Script's 360s ceiling
- **whether any chore failed** — and progress lines every 10 chores show how far
  it got if it died

## 4. Merge `stage-6` into `main`

Only ships the version bump to **v1.12.0**. Nothing in the app behaves
differently.

---

## What changed and why

Since roughly 26 August, chores late in the Chores tab silently stopped
generating. The split was positional — every chore up to a point had today's
occurrence, everything after was frozen days behind — and the cutoff moved
between nights.

Two possible causes, and this addresses both because they're cheap to cover:

**`updateRow` was reading the entire sheet on every call.** It used
`getDataRange().getValues()` — every column of every row — just to find one row
by key. The nightly run calls it around three times per chore, so on an
Assignments tab of a couple of thousand rows that's tens of thousands of cells
fetched, dozens of times per run. It now reads the header row and the key column
only: **about 21x less data per call.**

Behaviour is unchanged. Same signature, same return values, same first-match-wins,
same "skip columns that don't exist" — verified case by case against the old
implementation before shipping, because roughly 30 call sites depend on it and
every write in the app goes through it.

**One bad chore could kill the whole run.** `runNightlyGenerator` was a bare
`forEach`, so any exception aborted it and every chore after that point in the
sheet silently stopped generating. Each chore is now isolated, and a failure logs
which chore and why instead of vanishing.

**The run now logs its progress**, every 10 chores plus a summary line. A
try/catch can't stop a timeout — Apps Script terminates the execution outright —
so the log is what makes that case legible: a truncated log names how far it got.

---

## If it's still short after this

The next thing is archiving. Move `done` and `skipped` rows older than a few
months to an `Assignments_Archive` tab, keeping the same columns and header.

Three rules:

- **Never** archive `open` or `pending_review` rows — those are live
- Nothing from the current month, or the leaderboard's Today/Week/Month figures
  drop (all-time is a tally on the People tab and is unaffected)
- Nothing newer than the longest current streak — `recomputeStreak` counts days
  that have rows, so archiving shrinks it the next time someone rejects a chore

---

## Rolling back

Redeploy the previous Apps Script version. Nothing in the spreadsheet changed.
