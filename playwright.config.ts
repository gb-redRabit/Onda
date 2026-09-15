import { defineConfig } from '@playwright/test';

// E2E suite for the packaged Electron app (plan 2.1). Requires `npm run build`
// first: tests launch Electron against `out/main/index.js`. No browsers are
// downloaded — everything runs in the bundled Electron binary.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // The github reporter turns failures into check-run annotations, which are
  // readable without repo auth — the raw Actions log is not.
  reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure'
  }
});
