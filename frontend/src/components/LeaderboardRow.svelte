<script>
  import { initials, contrastColor } from '../lib/utils.js';

  export let person;
  export let rank;
  export let points = 0;
  export let unit = 'pts';
  export let allTime = 0;
  // Hidden when All time is the selected window, so the same figure never shows
  // twice on one card.
  export let showAllTime = true;
</script>

<div class="row">
  <span class="rank">{rank}</span>
  <div
    class="avatar"
    style="background:{person.color || '#6b7280'};color:{contrastColor(person.color || '#6b7280')}"
  >
    {initials(person.name)}
  </div>
  <div class="info">
    <span class="name">{person.name}</span>
    <div class="streaks">
      {#if person.streak_current > 0}
        <span class="streak-badge current">🔥 {person.streak_current} day streak</span>
      {/if}
      {#if person.streak_best > 0}
        <!-- Spelled out: "Best: 12" standing alone read like a points figure. -->
        <span class="streak-badge best">Best streak: {person.streak_best} days</span>
      {/if}
    </div>
  </div>
  <div class="points-col">
    <span class="pts-total">{points}</span>
    <span class="pts-label">{unit}</span>
    {#if showAllTime}
      <span class="pts-week">{allTime} all time</span>
    {/if}
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #fff;
    border-radius: 12px;
    padding: 14px 12px;
    margin-bottom: 8px;
  }

  .rank {
    font-size: 18px;
    font-weight: 700;
    color: #d1d5db;
    min-width: 28px;
    text-align: center;
  }

  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .info {
    flex: 1;
    min-width: 0;
  }

  .name {
    font-size: 15px;
    font-weight: 600;
    color: #111827;
    display: block;
  }

  .streaks {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 3px;
  }

  .streak-badge {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 6px;
  }

  .current {
    background: #fff7ed;
    color: #c2410c;
  }

  .best {
    background: #f3f4f6;
    color: #6b7280;
  }

  .points-col {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
  }

  .pts-total {
    font-size: 20px;
    font-weight: 700;
    color: #111827;
    line-height: 1.1;
  }

  .pts-label {
    font-size: 11px;
    color: #9ca3af;
  }

  .pts-week {
    font-size: 11px;
    color: #9ca3af;
    margin-top: 2px;
  }
</style>
