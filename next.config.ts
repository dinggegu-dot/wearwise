import type { NextConfig } from 'next';
const pages = process.env.PAGES_EXPORT === '1';
const config: NextConfig = { poweredByHeader: false, env: { NEXT_PUBLIC_RUNTIME_TARGET: pages ? 'pages' : 'node' }, devIndicators: false, outputFileTracingRoot: process.cwd(), ...(pages ? { output:'export', basePath:'/wearwise', trailingSlash:true } : {}) };
export default config;
