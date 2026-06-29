import { defineConfig } from 'vitest/config';

// Pin a non-UTC timezone so date tests reliably catch UTC-vs-local regressions
// (the formatDate bug we shipped once). Set before workers spawn so they inherit it.
process.env.TZ = 'America/Chicago';

// Root config; the two test projects (frontend jsdom + backend node) are defined
// in vitest.workspace.js.
export default defineConfig({});
