import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: ['round9-home.spec.ts', 'round7-preferences.spec.ts'],
  workers: 1, retries: 0, reporter: [['list']], timeout: 45000,
  expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:3099', channel: 'chrome', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3099',
    url: 'http://127.0.0.1:3099', timeout: 90000, reuseExistingServer: false,
    env: { OPENROUTER_API_KEY: '', AI_ENABLE: '0', NEXT_TELEMETRY_DISABLED: '1' } }
});
