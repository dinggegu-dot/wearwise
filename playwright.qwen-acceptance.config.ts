import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/live',
  testMatch: '**/qwen-final-acceptance.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3006' },
  webServer: {
    command: 'npm run start -- --port 3006',
    url: 'http://127.0.0.1:3006',
    reuseExistingServer: false,
    timeout: 90000,
    env: { NEXT_TELEMETRY_DISABLED: '1', AI_MODEL: 'qwen/qwen3.8-max-0902', AI_TIMEOUT_MS: '90000' },
  },
});
