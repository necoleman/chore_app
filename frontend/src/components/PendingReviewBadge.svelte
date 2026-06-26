<script>
  export let note = '';
</script>

<div class="badge">
  <span class="icon">⏳</span>
  <span class="label">Waiting for review</span>
  {#if note}
    <span class="note">Sent back: {note}</span>
  {/if}
</div>

<style>
  .badge {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    background: #fef3c7;
    color: #92400e;
    font-size: 12px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 12px;
    margin-top: 4px;
  }

  .note {
    font-style: italic;
    color: #b45309;
    width: 100%;
    padding-left: 20px;
  }
</style>
