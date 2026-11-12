import { defineConfig } from '@playwright/test';
import { chromium } from 'playwright';

export default defineConfig({
  testDir: './e2e', testMatch: ['**/wardrobe-parallel.spec.ts', '**/inspiration-tags.spec.ts'], workers: 1, retries: 0, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3005', launchOptions: { executablePath: chromium.executablePath() }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run start -- --port 3005', url: 'http://127.0.0.1:3005', reuseExistingServer: false, timeout: 90000, env: { NEXT_TELEMETRY_DISABLED: '1' } },
});
