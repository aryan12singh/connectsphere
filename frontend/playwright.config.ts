import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

const evidence = process.env.CSE2E_EVIDENCE_DIR || resolve('test-results/e2e')

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  outputDir: resolve(evidence, 'screenshots'),
  reporter: [
    ['line'],
    ['json', { outputFile: resolve(evidence, 'results.json') }],
    ['html', { outputFolder: resolve(evidence, 'html'), open: 'never' }],
  ],
  use: {
    baseURL: process.env.FRONTEND_BASE || 'http://127.0.0.1:33000',
    screenshot: 'only-on-failure',
    // Authentication uses disposable real sessions; do not persist their headers.
    trace: 'off',
    video: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
