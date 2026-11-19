import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/webkit-media.spec.ts',
  workers: 1, retries: 0, reporter: 'list',
  use: { browserName: 'webkit', baseURL: 'http://127.0.0.1:3010', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run start -- --port 3010', url: 'http://127.0.0.1:3010', reuseExistingServer: false, timeout: 90000, env: { NEXT_TELEMETRY_DISABLED: '1' } },
});
