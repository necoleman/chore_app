<script>
  export let text = '';
  let expanded = false;
  // Only offer expand/collapse for descriptions long enough to wrap; short
  // ones just show in full (no carat clutter).
  $: long = !!text && (text.length > 60 || text.includes('\n'));
</script>

{#if text}
  {#if long}
    <div class="desc">
      <span class="desc-text" class:expanded>{text}</span>
      <button
        class="desc-toggle"
        on:click|stopPropagation={() => (expanded = !expanded)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse description' : 'Expand description'}
      >
        {expanded ? '⌃' : '⌄'}
      </button>
    </div>
  {:else}
    <span class="desc-text">{text}</span>
  {/if}
{/if}

<style>
  .desc {
    display: flex;
    align-items: flex-start;
    gap: 4px;
  }
  .desc-text {
    flex: 1;
    font-size: 12px;
    color: #6b7280;
    line-height: 1.35;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
  }
  .desc-text.expanded {
    -webkit-line-clamp: unset;
    display: block;
  }
  .desc-toggle {
    flex-shrink: 0;
    background: none;
    border: none;
    cursor: pointer;
    color: #9ca3af;
    font-size: 13px;
    line-height: 1.2;
    padding: 0 4px;
  }
</style>
