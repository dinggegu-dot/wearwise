import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/birefnet-business.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3004',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    channel: 'chrome',
  },
  webServer: {
    command: 'npm run start -- --port 3004',
    url: 'http://127.0.0.1:3004',
    reuseExistingServer: false,
    timeout: 90000,
    env: { NEXT_TELEMETRY_DISABLED: '1', OPENROUTER_API_KEY: '', DASHSCOPE_API_KEY: '', AI_ENABLE: '0' },
  },
});
