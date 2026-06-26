import { writable } from 'svelte/store';

export const toast = writable(null);
export const loading = writable(false);

let toastTimer;

export function showToast(message, type = 'error', durationMs = 3500) {
  clearTimeout(toastTimer);
  toast.set({ message, type });
  toastTimer = setTimeout(() => toast.set(null), durationMs);
}

export function dismissToast() {
  clearTimeout(toastTimer);
  toast.set(null);
}
