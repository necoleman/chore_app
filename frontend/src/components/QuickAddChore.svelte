<script>
  import { portal } from '../lib/portal.js';

  export let onSubmit;  // async (name, person_id) => boolean — true closes the sheet
  export let onClose;
  export let isAdmin = false;
  export let people = [];
  export let selfId = '';   // current user's person_id (default assignee)

  let name = '';
  // Admins can pick who the chore is for; everyone else self-assigns.
  let assignee = selfId;
  let saving = false;

  async function handleSubmit() {
    if (saving) return;
    saving = true;
    try {
      const personId = isAdmin ? assignee : selfId;
      const ok = await onSubmit(name, personId);
      if (ok) onClose();
    } finally {
      saving = false;
    }
  }
</script>

<div class="backdrop" use:portal on:click|self={onClose}>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <h2 class="sheet-title">Quick add chore</h2>
    <p class="hint">Adds a one-time chore for today{isAdmin ? '' : ', assigned to you'}.</p>

    <form on:submit|preventDefault={handleSubmit} class="form">
      <!-- svelte-ignore a11y-autofocus -->
      <input
        type="text"
        bind:value={name}
        placeholder="e.g. Water the plants"
        class="input"
        autofocus
      />
      {#if isAdmin}
        <label class="field">
          <span class="label">Assign to</span>
          <select bind:value={assignee} class="input">
            <option value={selfId}>Me</option>
            {#each people.filter((p) => p.person_id !== selfId) as person (person.person_id)}
              <option value={person.person_id}>{person.name}</option>
            {/each}
            <option value="">Unclaimed</option>
          </select>
        </label>
      {/if}
      <div class="actions">
        <button type="button" class="btn btn--cancel" on:click={onClose}>Cancel</button>
        <button type="submit" class="btn btn--save" disabled={saving}>
          {saving ? 'Adding…' : 'Add'}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 100dvh;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: flex-end;
    z-index: 200;
    overflow-y: auto;
  }

  .sheet {
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
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .hint {
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 16px;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
  }

  .input {
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 12px;
    font-size: 15px;
    width: 100%;
  }

  .actions {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: 8px;
    padding: 4px 0 calc(8px + env(safe-area-inset-bottom));
    background: #fff;
  }

  .btn {
    flex: 1;
    padding: 13px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    border: none;
  }

  .btn--cancel { background: #f3f4f6; color: #374151; }
  .btn--save { background: #16a34a; color: #fff; }
  .btn--save:disabled { background: #d1d5db; cursor: not-allowed; }
</style>
