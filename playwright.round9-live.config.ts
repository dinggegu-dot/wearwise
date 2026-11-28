import { defineConfig } from '@playwright/test';

if (process.env.RUN_ROUND9_LIVE !== '1') throw new Error('真实AI联调需显式设置 RUN_ROUND9_LIVE=1，并先启动已配置服务。');
export default defineConfig({
  testDir: './e2e', testMatch: ['live/round9-home.spec.ts'], workers: 1, retries: 0,
  reporter: [['list']], timeout: 660000, expect: { timeout: 15000 },
  use: { baseURL: process.env.LIVE_BASE_URL ?? 'http://127.0.0.1:3000', channel: 'chrome',
    viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' }
});
