import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 15_000,
  retries: 0,
  reporter: [['list']],
  webServer: { command: 'python3 -m http.server 4173', port: 4173, reuseExistingServer: true },
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', channel: 'chrome', headless: true },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'] } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } }
  ]
});
