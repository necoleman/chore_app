# Chore app — deploying v1.12.1 (Stage 7)

Branch: **`stage-7`**

**Deploy Stage 6 first.**

One Apps Script file. No spreadsheet changes, no migration, no frontend changes.

---

## 1. Apps Script — ONE file

- `Endpoints.gs`

Then **Deploy → Manage deployments → Edit → New version → Deploy**.

No `setup()` re-run.

## 2. Merge `stage-7` into `main`

Version bump to **v1.12.1** only.

---

## The bug

Unchecking a chore whose replacement had already been generated left the chore
with **two live occurrences at once**.

It showed up as a rotation apparently handing one chore to two people, with the
older copy sitting overdue — and the next nightly run would close that copy as a
miss, charging someone points for work they had actually done.

The sequence that produces it:

1. A chore that requires approval is completed → `pending_review`
2. The nightly generator deliberately leaves pending rows alone and creates the
   next occurrence **alongside** it (#25), so review isn't a bottleneck
3. Someone unchecks the pending row — and `actionUncomplete` set it straight back
   to `open` without ever asking whether it had been superseded

`actionReject` has always made that check. `actionUncomplete` never did.

## The fix

Uncomplete now looks for a genuinely later live occurrence, and:

- **none** → reopens the row as `open`, exactly as before
- **superseded** → closes it as `skipped` with **no** `points_awarded`

Blank points reads as an excusal rather than a miss, which matters: the awarded
points are already reversed a few lines above, so recording a penalty as well
would deduct twice for one uncheck.

The live occurrence's miss count is deliberately **not** incremented. A rejection
asserts the work wasn't done, but an uncheck is usually someone undoing a
mis-tap, and shouldn't quietly cost a streak.

Two details worth knowing:

- Supersession compares **due dates**, not merely "does another live row exist" —
  otherwise a chore holding an older live row would make the row being unchecked
  look superseded and get it closed.
- The interval re-anchor now only runs when the row is genuinely reopened. Winding
  the cursor back onto a superseded date would have made the generator reproduce
  an occurrence that had already been replaced.

## Cleaning up an existing case

If a chore currently shows two live occurrences, fix the older row by hand: set
its `status` to `skipped` and leave `points_awarded` blank. That closes it as an
excusal, so nobody is charged, and it drops off the Today screen.

---

## Rolling back

Redeploy the previous Apps Script version. Nothing in the spreadsheet changed.
