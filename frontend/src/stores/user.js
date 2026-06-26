import { writable } from 'svelte/store';

const STORAGE_KEY = 'chore_current_user';

function loadUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const currentUser = writable(loadUser());

currentUser.subscribe((value) => {
  if (value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
});

export function logout() {
  currentUser.set(null);
}
