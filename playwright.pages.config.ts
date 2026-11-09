import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir:'./e2e/pages', workers:1, retries:0, reporter:'list',
  use:{baseURL:'http://127.0.0.1:3100/wearwise/',channel:'chrome',trace:'retain-on-failure'},
  webServer:{command:'npm run serve:pages',url:'http://127.0.0.1:3100/wearwise/',reuseExistingServer:false,timeout:30000} });
