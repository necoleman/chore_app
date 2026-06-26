<script>
  export let assignment;
  export let onApprove;
  export let onReject;

  let showRejectModal = false;
  let rejectNote = '';

  function submitReject() {
    onReject(rejectNote);
    showRejectModal = false;
    rejectNote = '';
  }
</script>

<div class="approve-reject-bar">
  <button class="btn btn--approve" on:click={onApprove}>
    ✓ Approve
  </button>
  <button class="btn btn--reject" on:click={() => (showRejectModal = true)}>
    ✗ Send back
  </button>
</div>

{#if showRejectModal}
  <div class="modal-backdrop" on:click|self={() => (showRejectModal = false)}>
    <div class="modal">
      <p class="modal-title">Send back to {assignment.person_name}?</p>
      <input
        type="text"
        class="note-input"
        placeholder="Optional note (e.g. missed under the bed)"
        bind:value={rejectNote}
        maxlength="120"
      />
      <div class="modal-actions">
        <button class="btn btn--cancel" on:click={() => (showRejectModal = false)}>Cancel</button>
        <button class="btn btn--reject" on:click={submitReject}>Send back</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .approve-reject-bar {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .btn {
    flex: 1;
    padding: 8px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn--approve {
    background: #dcfce7;
    color: #16a34a;
  }

  .btn--reject {
    background: #fee2e2;
    color: #dc2626;
  }

  .btn--cancel {
    background: #f3f4f6;
    color: #374151;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    display: flex;
    align-items: flex-end;
    z-index: 200;
    padding: 0 0 env(safe-area-inset-bottom);
  }

  .modal {
    background: #fff;
    border-radius: 16px 16px 0 0;
    padding: 24px 20px;
    width: 100%;
  }

  .modal-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  .note-input {
    width: 100%;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 14px;
    margin-bottom: 16px;
  }

  .modal-actions {
    display: flex;
    gap: 8px;
  }
</style>
