import type { NextConfig } from 'next';
const pages = process.env.PAGES_EXPORT === '1';
const config: NextConfig = { poweredByHeader: false, devIndicators: false, ...(pages ? { output: 'export', basePath: '/wearwise', trailingSlash: true } : {}) };
export default config;
