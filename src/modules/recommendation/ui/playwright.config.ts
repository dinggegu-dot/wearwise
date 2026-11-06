import { defineConfig } from '@playwright/test';
const port = Number(process.env.M06_PORT || 3000);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid M06 test port');
const baseURL = `http://127.0.0.1:${port}`;

// 06 owns these UI regressions; 07's independent suite stays unchanged.
// Keep this config self-contained: build:pages stages src without root test configs.
export default defineConfig({
  testDir: '.', testMatch: '*.browser.spec.ts', fullyParallel: false, workers: 1, retries: 0,
  reporter: 'list', outputDir: '../../../../test-results/m06',
  use: { baseURL, channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: `${process.env.M06_DEV === '1' ? 'npm run dev' : 'npm run start'} -- --port ${port}`,
    url: baseURL, reuseExistingServer: false, timeout: 90000,
    env: { NEXT_TELEMETRY_DISABLED: '1', DASHSCOPE_API_KEY: '' }
  }
});
