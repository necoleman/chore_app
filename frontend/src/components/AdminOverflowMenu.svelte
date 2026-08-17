<script>
  import { people } from '../stores/data.js';
  import { currentUser } from '../stores/user.js';
  import { reassignAssignment, bumpAssignment, skipAssignment } from '../stores/data.js';
  import PersonPicker from './PersonPicker.svelte';
  import { portal } from '../lib/portal.js';
  import { groupKeyFor } from '../lib/choreSelectors.js';
  import { shiftDate } from '../lib/dueDates.js';

  export let assignment;

  // Monthly and interval chores get Push instead of Skip (#50). Skipping one of
  // those forfeits a whole month or cycle, where the real intent is usually
  // "not this week" — so they trade the excusal for a deferral.
  //
  // Keyed off groupKeyFor rather than `frequency` directly, which matters: it
  // routes one-offs out first. A one-off of a monthly chore must keep Skip,
  // since nothing regenerates it and Skip is the only way to clear it.
  $: usePush = groupKeyFor(assignment) === 'monthly';

  let open = false;
  let showReassign = false;
  let showBump = false;
  let bumpDate = assignment.due_date;

  // The picker's Unassigned option comes back as null, which is the same call
  // with an empty person — so this covers what "Make unclaimed" used to be. One
  // control for "who does this", rather than a separate menu item for one answer.
  function handleReassign(person) {
    reassignAssignment(assignment.assignment_id, person?.person_id ?? '', $currentUser.person_id);
    showReassign = false;
  }

  function handleBump() {
    bumpAssignment(assignment.assignment_id, bumpDate, $currentUser.person_id);
    showBump = false;
  }

  // Excuse this occurrence: it leaves the list, nobody loses points, and the
  // chore returns on its normal schedule. A one-off simply goes away.
  function handleSkip() {
    skipAssignment(assignment.assignment_id, $currentUser.person_id);
    open = false;
  }

  // Move THIS occurrence's due date out a week. Deliberately 7 days from the due
  // date, not from today, so the arithmetic is predictable — which does mean
  // pushing something 10 days overdue leaves it 3 days overdue. Push is aimed at
  // chores not yet due or due today; press it again for another week.
  //
  // Reuses the bump endpoint, which writes `due_date` and nothing else — the
  // chore's own monthly_week/weekday_due/interval and its `last_generated_date`
  // cursor are untouched, so the NEXT occurrence still lands on schedule.
  function handlePush() {
    bumpAssignment(
      assignment.assignment_id,
      shiftDate(assignment.due_date, 7),
      $currentUser.person_id
    );
    open = false;
  }
</script>

<div class="overflow-wrap">
  <button class="overflow-btn" on:click|stopPropagation={() => (open = !open)} aria-label="More options">
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <circle cx="12" cy="5" r="1.5"/>
      <circle cx="12" cy="12" r="1.5"/>
      <circle cx="12" cy="19" r="1.5"/>
    </svg>
  </button>

  {#if open}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="overlay" on:click={() => (open = false)}></div>
    <div class="menu">
      <button class="menu-item" on:click|stopPropagation={() => { open = false; showReassign = true; }}>
        ↔ Reassign
      </button>
      {#if usePush}
        <button class="menu-item" on:click|stopPropagation={handlePush}>
          ⏭ Push a week
        </button>
      {:else}
        <button class="menu-item" on:click|stopPropagation={handleSkip}>
          ⊘ Skip this one
        </button>
      {/if}
      <button class="menu-item" on:click|stopPropagation={() => { open = false; showBump = true; }}>
        📅 Move date
      </button>
    </div>
  {/if}
</div>

{#if showReassign}
  <PersonPicker
    people={$people}
    selected={assignment.person_id}
    allowUnassigned={true}
    onSelect={handleReassign}
    onClose={() => (showReassign = false)}
    title="Reassign to…"
  />
{/if}

{#if showBump}
  <div class="bump-backdrop" use:portal on:click|self={() => (showBump = false)}>
    <div class="bump-sheet">
      <div class="sheet-handle"></div>
      <h2 class="sheet-title">Move to date</h2>
      <input type="date" class="date-input" bind:value={bumpDate} />
      <div class="bump-actions">
        <button class="btn btn--cancel" on:click={() => (showBump = false)}>Cancel</button>
        <button class="btn btn--confirm" on:click={handleBump}>Move</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overflow-wrap {
    position: relative;
  }

  .overflow-btn {
    background: none;
    border: none;
    padding: 6px;
    cursor: pointer;
    color: #9ca3af;
    border-radius: 6px;
    display: flex;
    align-items: center;
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
  }

  .menu {
    position: absolute;
    right: 0;
    top: 100%;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    z-index: 51;
    min-width: 160px;
    overflow: hidden;
  }

  .menu-item {
    display: block;
    width: 100%;
    padding: 12px 16px;
    text-align: left;
    background: none;
    border: none;
    font-size: 14px;
    cursor: pointer;
    color: #374151;
  }

  .menu-item:hover {
    background: #f9fafb;
  }

  .bump-backdrop {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 100dvh;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: flex-end;
    z-index: 200;
  }

  .bump-sheet {
    background: #fff;
    border-radius: 16px 16px 0 0;
    padding: 12px 20px 0;
    width: 100%;
    max-height: 90dvh;
    overflow-y: auto;
  }

  .sheet-handle {
    width: 40px;
    height: 4px;
    background: #d1d5db;
    border-radius: 2px;
    margin: 0 auto 16px;
  }

  .sheet-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 16px;
  }

  .date-input {
    width: 100%;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 14px;
    margin-bottom: 16px;
  }

  .bump-actions {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: 8px;
    padding: 12px 0 calc(8px + env(safe-area-inset-bottom));
    background: #fff;
  }

  .btn {
    flex: 1;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: none;
  }

  .btn--cancel { background: #f3f4f6; color: #374151; }
  .btn--confirm { background: #16a34a; color: #fff; }
</style>
