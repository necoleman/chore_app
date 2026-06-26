<script>
  import { initials, contrastColor } from '../lib/utils.js';

  export let person;
  export let rank;
  export let weekPoints = 0;
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
        <span class="streak-badge best">Best: {person.streak_best}</span>
      {/if}
    </div>
  </div>
  <div class="points-col">
    <span class="pts-total">{person.points_total ?? 0}</span>
    <span class="pts-label">pts total</span>
    {#if weekPoints > 0}
      <span class="pts-week">+{weekPoints} this week</span>
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
    font-size: 16px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .name {
    font-size: 15px;
    font-weight: 600;
    color: #111827;
  }

  .streaks {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .streak-badge {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 8px;
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
  }

  .pts-total {
    font-size: 22px;
    font-weight: 800;
    color: #16a34a;
  }

  .pts-label {
    font-size: 10px;
    color: #9ca3af;
  }

  .pts-week {
    font-size: 11px;
    color: #16a34a;
    font-weight: 500;
  }
</style>
