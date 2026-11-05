import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3000', channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run start', url: 'http://127.0.0.1:3000', reuseExistingServer: false, timeout: 90000, env: { NEXT_TELEMETRY_DISABLED: '1', DASHSCOPE_API_KEY: '' } }
});
