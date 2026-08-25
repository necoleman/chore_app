# Chore app — deploying v1.11.0 (Stage 5)

Branch: **`stage-5`**

**Deploy Stage 4 first** — this builds on it.

No new columns and no migration — but see the duplicate-id note at the end,
which may need a one-off tidy in the Assignments tab.

---

## 1. Run the tests

```bash
cd frontend && npm test
```

## 2. Apps Script — TWO files

- `Endpoints.gs`
- `Generator.gs`

Then **Deploy → Manage deployments → Edit → New version → Deploy**.

No `setup()` re-run — the triggers are unchanged.

## 3. Merge `stage-5` into `main`

Ships the frontend via GitHub Pages. Do it after step 2, so the new frontend
isn't talking to an old backend.

## 4. Verify

Signed in as an **admin**, on another person's card in the Family section:

- tapping the circle marks it done, and the **points go to them**, not to you
- it does not go to "pending review", even on a chore that needs approval
- you can undo it with the same confirm dialog you get on your own chores
- the Assignments row shows your `person_id` in `last_modified_by`, and
  `reviewed_by` stays **empty**

Signed in as a **non-admin**:

- other people's cards are still read-only — no tappable circle

Then check the two fixes:

- **Skip** an *overdue* chore: it should stay on the list, greyed at the bottom,
  until tomorrow — rather than vanishing on the spot
- Edit an **interval** chore's **Next due date** to a month out and save: the
  schedule should move even though no occurrence has been generated yet. Check
  `last_generated_date` on the Chores tab — it should read one interval before
  the date you picked.
- On **Leaders**, nobody should show a negative number in any window

And on the Today screen, the group headings should read **Daily Chores**,
**Weekend Chores**, **Monthly/Longterm Chores Due This Week**.

The app footer should read **v1.11.0**.

---

## What changed and why

**Admins can check off someone else's chore.** For when a parent knows the work
was done and the kid never marked it. `actionComplete` now separates who gets
the **credit** (`person_id`) from who **tapped** it (`admin_person_id`, sent only
when the two differ). The approval check moved onto the actor: a parent ticking
the box skips review rather than being asked to approve themselves, while the
points still land on the assignee. When the new field is absent the two ids are
identical and every existing path behaves exactly as before.

The acting admin is recorded in `last_modified_by` and deliberately **not** in
`reviewed_by`. That field means "approved", and the undo rule treats its presence
as final — stamping it there would have stopped the admin undoing a chore they'd
just ticked by mistake, which is the opposite of what was wanted.

**A pushed chore no longer vanishes.** `bumpAssignment` dropped the card from the
local list unless the new due date was exactly today, ignoring the lead window.
Push hit it every time: 7 days on a 7-day lead puts the appear date on today, so
the card belonged on screen and disappeared until the next refresh. It now
compares the new appear date against today, the same rule the Today filter uses.
This also fixes **Move date** to any date inside the lead window, where the same
bug was rarer and looked like a refresh quirk.

**A skipped chore no longer vanishes on the spot.** A finished row stayed on
Today only if it was due today; completed chores had an extra allowance to linger
until the end of the day, and skipped ones didn't. So excusing an *overdue* chore
removed it instantly, with no sign the tap had registered. Skips now use their
`reviewed_at` stamp the same way completions use `completed_at`. A *missed*
occurrence is also `skipped` but has no reviewer, so it still drops off at
once — which is right, since nobody chose it and it closed overnight.

**"First due date" now works on an established interval chore, and is renamed.**
It was inert: `nextDueForChore` only consults `start_date` when a chore has no
cursor, so the only thing that could act on an edit was a re-anchor helper — and
that bailed unless the chore had exactly *one* assignment row in its whole
history, counting completed ones. One past completion was enough to make it do
nothing, silently. It now looks at the live occurrence only, and when there
isn't one — the usual case for a long interval, which surfaces about a week
ahead — it winds the cursor back one interval so the generator produces the date
you asked for. The field is labelled **"Next due date"** for interval chores and
**"Start date (optional)"** for the others, since it genuinely means two
different things: the next due date in one case, a "not before" floor in the
other.

**The leaderboard never shows negative points, and recovery is immediate.**
All time was already floored — `incrementPoints` clamps `points_total` after
every write, so a penalty that would take someone below zero is absorbed and
forgotten, and their next chore shows up straight away.

Today/Week/Month didn't behave that way: they're computed from the log, where
each miss is a negative `points_awarded`, so a bad week read −45 while the actual
balance had sat at 0 throughout. Each window now **replays** the person's events
in order and clamps at zero after each one, exactly as `incrementPoints` does. So
someone at zero who misses a 45-point chore and then does a 10-point one sees
**10**, not 0 — no debt to work off, because the balance never carried one.

**Duplicate assignment ids can no longer be created silently.** An assignment id
is `chore_id` + due date, so two occurrences of one chore on the same date
collide. The schedule can't produce that on its own, but a hand-edited `due_date`
leaves the original date in the id, letting a later occurrence mint one that
already exists — and the generator's existing-occurrence check compares due
dates, not ids, so it missed this.

The result was near-invisible and badly misleading: the older row is usually
closed and filtered off Today, so you see one card, but every lookup uses
`find()` and takes the FIRST match. Completing the live occurrence hit the stale
twin and failed with "Assignment is not open" — every time, for that chore only.
The generator now disambiguates and logs it.

**If any already exist**, find them with `=FILTER(A2:A, COUNTIF(A2:A, A2:A)>1)`
over the `assignment_id` column and give the closed twin a suffix like `_old`.
Ids are only ever compared whole, so renaming is safe.

**Errors now say what actually went wrong.** Six actions replaced the server's
message with a generic "try again", including the one above.

**The Today cadence headings are renamed** to Daily Chores / Weekend Chores /
Monthly-Longterm Chores Due This Week. Labels only — the grouping is unchanged.

---

## Rolling back

Redeploy the previous Apps Script version and revert the merge. Nothing in the
spreadsheet changed, so there is nothing to undo there.
