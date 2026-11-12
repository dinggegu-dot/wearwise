import { defineConfig } from '@playwright/test';
import { chromium } from 'playwright';

export default defineConfig({
  testDir: './e2e/live', testMatch: '**/openrouter-recovery.spec.ts', workers: 1, retries: 0, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3008', launchOptions: { executablePath: chromium.executablePath() }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'npm run start -- --port 3007', url: 'http://127.0.0.1:3007', reuseExistingServer: false, timeout: 90000,
      env: { NEXT_TELEMETRY_DISABLED: '1', OPENROUTER_API_KEY: 'invalid-placeholder-for-recovery-test', AI_MODEL: 'qwen/qwen3.8-max-0902', AI_TIMEOUT_MS: '90000' } },
    { command: 'npm run start -- --port 3008', url: 'http://127.0.0.1:3008', reuseExistingServer: false, timeout: 90000,
      env: { NEXT_TELEMETRY_DISABLED: '1', AI_MODEL: 'qwen/qwen3.8-max-0902', AI_TIMEOUT_MS: '90000' } },
  ],
});
