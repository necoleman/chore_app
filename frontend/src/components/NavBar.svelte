<script>
  import { currentUser } from '../stores/user.js';
  import { link, location } from 'svelte-spa-router';

  $: isAdmin = $currentUser?.is_admin;
</script>

<nav class="navbar">
  <a href="/" use:link class:active={$location === '/'} aria-label="Today">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
    <span>Today</span>
  </a>

  <a href="/leaderboard" use:link class:active={$location === '/leaderboard'} aria-label="Leaderboard">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
    <span>Leaders</span>
  </a>

  {#if isAdmin}
    <a href="/admin/chores" use:link class:active={$location === '/admin/chores'} aria-label="Manage Chores">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
      </svg>
      <span>Chores</span>
    </a>
  {/if}

  <a href="/history" use:link class:active={$location === '/history'} aria-label="History">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="12 8 12 12 14 14"/>
      <path d="M3.05 11a9 9 0 1 0 .5-3H1"/>
      <polyline points="1 4 1 8 5 8"/>
    </svg>
    <span>History</span>
  </a>
</nav>

<style>
  .navbar {
    display: flex;
    justify-content: space-around;
    align-items: center;
    background: #fff;
    border-top: 1px solid #e5e7eb;
    padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
    position: sticky;
    bottom: 0;
  }

  a {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    color: #9ca3af;
    text-decoration: none;
    padding: 4px 12px;
    border-radius: 8px;
    transition: color 0.15s;
    min-width: 56px;
  }

  a.active {
    color: #16a34a;
  }

  svg {
    width: 24px;
    height: 24px;
  }

  span {
    font-size: 10px;
    font-weight: 500;
  }
</style>
