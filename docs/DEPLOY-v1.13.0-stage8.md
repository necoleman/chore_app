# Chore app — deploying v1.13.0 (Stage 8)

Branch: **`stage-8`**

**Deploy Stage 7 first.** This branches off it, so Stage 7's fix is included — if
Stage 7's `Endpoints.gs` was pasted but its PR never merged, merging this one
brings the repo back in line with what is running.

No spreadsheet schema changes and no migration. Two Apps Script files, plus two
optional tidy-ups in the sheet.

---

## 1. Apps Script — TWO files

- `Generator.gs`
- `Endpoints.gs`

Then **Deploy → Manage deployments → Edit → New version → Deploy**.

No `setup()` re-run.

## 2. Merge `stage-8` into `main`

This ships the frontend, which is most of the release.

## 3. Two things to set in the sheet

**People tab — `color`.** The person panels are tinted from this column, so it
now drives the avatar, the stripe and the card together:

| Person | `color` |
|---|---|
| rachel | `#7f77dd` |
| neal | `#ba7517` |
| claire | `#378add` |
| will | `#16a34a` |
| elmira | `#d4537e` |

A blank or malformed value falls back to neutral grey rather than breaking.

**People tab — row order.** Family cards now follow the People tab's row order,
so arrange the rows:

```
rachel
neal
claire
will
elmira
```

Your own card is always lifted to the top, so you see Neal, Claire, Will, Elmira,
and Claire sees Rachel, Neal, Will, Elmira.

## 4. Verify

- The Today screen opens with a shaded **After Dinner Chores** table
- Ticking a row there marks it done; a non-admin can only tick their own
- A finished row stays in place, struck through, rather than vanishing
- Your own panel is first and open; everyone else's is closed
- Tapping anywhere on a person's header collapses or expands it
- The number on a card is what's LEFT, not the total — tick one and it drops
- A person with nothing left reads **All done** in their own colour
- Each card shows a fact, and it is the same fact after a refresh
- Tomorrow, the facts are different
- Miss a chore overnight: no points come off anyone, and History reads "Missed"
  with no number
- An admin excusal still reads "Skipped by …"

The footer should read **v1.13.0**.

---

## What changed and why

**An After Dinner Chores table at the top of Today.** Condensed to the chore,
who has it, and a circle. See the README for why it is keyed on the location
rather than the `sort_last` flag.

**Person panels replace the old dropdowns.** The name was rendering at
section-title size, dwarfed by the chore cards and awkward to find again when
you wanted to collapse it. Each person now gets a panel tinted from their own
colour, with the name at 19px, the whole header as the toggle, and the colour
stripe running the full height so the chores read as being inside that person
rather than after them.

This also replaces `<details>`/`<summary>`, which could only put the header row
inside the clickable element — that is what forced the daily fact to sit outside
the hit area.

**A daily fact per person.** 60 each, picked from the date rather than at random,
so it is stable across refreshes and the same for everybody on a given day.

**The count on a card is chores remaining.** It was the total, so a card read
"5 chores" with four already ticked — discouraging, and useless for deciding
whether opening the panel is worth it. `pending_review` counts as finished: that
person has done the work and the delay is the reviewer's. A chore sent back while
still current returns to `open` and counts again; one sent back after its
replacement exists closes as `skipped` and does not, because the newer occurrence
is what they actually have to do. A cleared card reads **All done** in the
person's own colour.

**Missing a chore no longer costs points.** Totals only ever rise. A falling
total is the wrong incentive: someone who has let a few days slide is then
working to climb out of a hole rather than to earn anything, which is exactly
when the next chore most needs to feel worth doing. `missed_count` still carries
the record.

This is **not** a blanket "points never change". Undo and send-back still
reverse that chore's own award, because those points were never earned — without
that, ticking a chore and unticking it would mint points on every cycle.

One consequence: History used to tell a miss from an admin excusal by the
negative `points_awarded` on the row. With no negative to find, it now decides on
`reviewed_by` — a miss has no reviewer. Rows closed before this change still
carry their old penalty and still display it, so the history stays truthful about
what things cost at the time.

---

## Rolling back

Redeploy the previous Apps Script version and revert the merge. Nothing in the
spreadsheet schema changed; the `color` values and row order are harmless either
way.
