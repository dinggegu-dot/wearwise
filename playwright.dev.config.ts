import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, webServer: { command: 'npm run dev', url: 'http://127.0.0.1:3000', reuseExistingServer: false, timeout: 90000, env: { NEXT_TELEMETRY_DISABLED: '1', DASHSCOPE_API_KEY: '' } } });
