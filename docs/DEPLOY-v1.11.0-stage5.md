# Chore app — deploying v1.11.0 (Stage 5)

Branch: **`stage-5`**

**Deploy Stage 4 first** — this builds on it.

No spreadsheet changes this time. No new columns, no migration.

---

## 1. Run the tests

```bash
cd frontend && npm test
```

## 2. Apps Script — ONE file

- `Endpoints.gs`

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

**The Today cadence headings are renamed** to Daily Chores / Weekend Chores /
Monthly-Longterm Chores Due This Week. Labels only — the grouping is unchanged.

---

## Rolling back

Redeploy the previous Apps Script version and revert the merge. Nothing in the
spreadsheet changed, so there is nothing to undo there.
