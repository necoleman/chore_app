import { defineConfig, devices } from '@playwright/test';

// E2E runs against the Vite dev server (no service worker in dev) with the Apps
// Script backend mocked via route interception (see tests/e2e/fixtures.js).
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // A /macros/s/ URL so requests match the route pattern even if .env.local
    // also defines VITE_API_URL — both are intercepted, never the real backend.
    env: { VITE_API_URL: 'https://mock.test/macros/s/MOCK/exec' },
  },
});
