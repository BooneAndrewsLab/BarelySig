/**
 * End-to-end tests (#35, note 07): the app as built for release, served by
 * `vite preview`, in Chromium, with WebR running for real from the
 * self-hosted runtime (`npm run webr:fetch` stages it). `npm run e2e`.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 5331;
/** The site's base, as the build is given it (GitHub Pages: `/BarelySig/`). */
const BASE = process.env['BASE_PATH'] ?? '/';

export default defineConfig({
  testDir: 'e2e',
  // WebR starts in a few seconds but the first analysis loads packages.
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}${BASE}`,
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}${BASE}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 300_000,
  },
});
