// Pin TZ here too (workspace file is the entry point when running projects).
process.env.TZ = 'America/Chicago';

export default [
  {
    // Frontend pure-logic + store tests (jsdom for localStorage/window).
    test: {
      name: 'frontend',
      environment: 'jsdom',
      include: ['src/**/*.test.js'],
    },
  },
  {
    // Apps Script backend logic via the in-memory harness (plain Node).
    test: {
      name: 'backend',
      environment: 'node',
      include: ['tests/apps-script/**/*.test.js'],
    },
  },
];
