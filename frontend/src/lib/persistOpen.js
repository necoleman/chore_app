// Tiny helper to remember whether a <details> dropdown was open, keyed by a
// stable id, so the Today screen restores each dropdown's last state (#28
// follow-up). Falls back to `defaultOpen` when nothing is stored or storage
// is unavailable (private mode, etc.).
const PREFIX = 'chore_open:';

export function loadOpen(key, defaultOpen = false) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? defaultOpen : raw === '1';
  } catch {
    return defaultOpen;
  }
}

export function saveOpen(key, open) {
  try {
    localStorage.setItem(PREFIX + key, open ? '1' : '0');
  } catch {
    // ignore — persistence is best-effort
  }
}
