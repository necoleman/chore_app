<script>
  import { people } from '../stores/data.js';
  import { currentUser } from '../stores/user.js';
  import { reassignAssignment, bumpAssignment } from '../stores/data.js';
  import PersonPicker from './PersonPicker.svelte';

  export let assignment;

  let open = false;
  let showReassign = false;
  let showBump = false;
  let bumpDate = assignment.due_date;

  function handleReassign(person) {
    reassignAssignment(assignment.assignment_id, person.person_id, $currentUser.person_id);
    showReassign = false;
  }

  function handleBump() {
    bumpAssignment(assignment.assignment_id, bumpDate, $currentUser.person_id);
    showBump = false;
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
      <button class="menu-item" on:click={() => { open = false; showReassign = true; }}>
        ↔ Reassign
      </button>
      <button class="menu-item" on:click={() => { open = false; showBump = true; }}>
        📅 Move date
      </button>
    </div>
  {/if}
</div>

{#if showReassign}
  <PersonPicker
    people={$people}
    selected={assignment.person_id}
    onSelect={handleReassign}
    onClose={() => (showReassign = false)}
    title="Reassign to…"
  />
{/if}

{#if showBump}
  <div class="bump-backdrop" on:click|self={() => (showBump = false)}>
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
    inset: 0;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: flex-end;
    z-index: 200;
  }

  .bump-sheet {
    background: #fff;
    border-radius: 16px 16px 0 0;
    padding: 12px 20px calc(24px + env(safe-area-inset-bottom));
    width: 100%;
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
    display: flex;
    gap: 8px;
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
