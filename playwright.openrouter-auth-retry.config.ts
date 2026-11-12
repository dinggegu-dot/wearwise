import { defineConfig } from '@playwright/test';
import { chromium } from 'playwright';

export default defineConfig({
  testDir: './e2e/live',
  testMatch: '**/openrouter-auth-retry.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3007',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: chromium.executablePath() },
  },
  webServer: {
    command: 'npm run start -- --port 3007',
    url: 'http://127.0.0.1:3007',
    reuseExistingServer: false,
    timeout: 90000,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      OPENROUTER_API_KEY: 'invalid-auth-test-token-no-provider-access',
      AI_MODEL: 'qwen/qwen3.8-max-0902',
      AI_TIMEOUT_MS: '30000',
    },
  },
});
