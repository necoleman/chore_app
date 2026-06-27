<script>
  import { initials, contrastColor } from '../lib/utils.js';
  export let people = [];
  export let selected = null;
  export let onSelect;
  export let onClose;
  export let title = 'Select person';
</script>

<div class="backdrop" on:click|self={onClose}>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <h2 class="sheet-title">{title}</h2>
    <div class="person-grid">
      {#each people as person (person.person_id)}
        <button
          class="person-btn"
          class:selected={selected === person.person_id}
          on:click={() => { onSelect(person); onClose(); }}
        >
          <div
            class="avatar"
            style="background:{person.color || '#6b7280'};color:{contrastColor(person.color || '#6b7280')}"
          >
            {initials(person.name)}
          </div>
          <span class="name">{person.name}</span>
        </button>
      {/each}
    </div>
    <button class="cancel-btn" on:click={onClose}>Cancel</button>
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
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 16px;
    text-align: center;
  }

  .person-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }

  .person-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    background: none;
    border: 2px solid transparent;
    border-radius: 12px;
    padding: 8px 4px;
    cursor: pointer;
  }

  .person-btn.selected {
    border-color: #16a34a;
  }

  .avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
  }

  .name {
    font-size: 12px;
    font-weight: 500;
    text-align: center;
    color: #374151;
  }

  .cancel-btn {
    position: sticky;
    bottom: 0;
    width: 100%;
    padding: 12px;
    margin-bottom: calc(8px + env(safe-area-inset-bottom));
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: #fff;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
  }
</style>
