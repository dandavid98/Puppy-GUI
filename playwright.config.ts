import { defineConfig } from '@playwright/test'

// Drives the real Electron app against the real code-puppy. UI checks fail fast;
// only steps that wait on the agent (see e2e/fixtures.ts) get long timeouts.
export default defineConfig({
  testDir: 'e2e',
  timeout: 300_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results',
})
