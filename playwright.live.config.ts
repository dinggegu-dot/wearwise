import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./e2e/live',workers:1,retries:0,reporter:'list',use:{baseURL:'http://127.0.0.1:3000',channel:'chrome',trace:'retain-on-failure'},webServer:{command:'npm run start',url:'http://127.0.0.1:3000',reuseExistingServer:false,timeout:90000,env:{NEXT_TELEMETRY_DISABLED:'1',AI_ENABLE:'0'}}});
