import { test, expect } from '@playwright/test';
import { weatherResult } from './helpers/recommendation';

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real')); });

test('天气自动获取，失败后可重试，切换城市不复用旧结果', async ({ page }) => {
  let calls = 0;
  await page.route('https://api.open-meteo.com/**', route => ++calls === 1
    ? route.fulfill({ status: 503, body: 'unavailable' })
    : route.fulfill({ json: weatherResult() }));
  await page.goto('/');
  await expect(page.getByRole('region', { name: '今日天气' }).getByRole('alert')).toContainText('暂时无法获取天气');
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByText('深圳 阴天')).toBeVisible();
  await page.getByLabel('选择城市').selectOption('上海');
  await expect(page.getByText('上海 阴天')).toBeVisible();
  await expect(page.getByText('深圳 阴天')).toHaveCount(0);
  await expect(page.getByText('体感温度：19°C')).toBeVisible();
  expect(calls).toBe(3);
});

test('快速切换城市时较晚的天气响应不覆盖当前城市', async ({ page }) => {
  let release!: () => void;
  let beijingStarted = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://api.open-meteo.com/**', async route => {
    const isBeijing = new URL(route.request().url()).searchParams.get('latitude') === '39.9042';
    if (isBeijing) { beijingStarted = true; await gate; }
    await route.fulfill({ json: weatherResult() }).catch(() => undefined);
  });
  await page.goto('/');
  await expect(page.getByText('深圳 阴天')).toBeVisible();
  await page.getByLabel('选择城市').selectOption('北京');
  await expect.poll(() => beijingStarted).toBe(true);
  await page.getByLabel('选择城市').selectOption('上海');
  try {
    await expect(page.getByText('上海 阴天')).toBeVisible();
  } finally { release(); }
  await expect(page.getByText('北京 阴天')).toHaveCount(0);
});

test('切换示例模式后旧天气请求的晚响应不会污染新模式', async ({ page }) => {
  let started!: () => void, release!: () => void;
  const seen = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://api.open-meteo.com/**', async route => {
    started();
    await gate;
    await route.fulfill({ json: weatherResult(Date.now(), 99) }).catch(() => undefined);
  });
  await page.goto('/');
  await seen;
  try {
    await page.getByRole('button', { name: '切换示例模式' }).click();
    await expect(page.getByText('示例模式 · 示例数据')).toBeVisible();
    await expect(page.getByText(/示例天气 · 深圳/)).toBeVisible();
  } finally { release(); }
  await expect(page.getByText('体感温度：21°C')).toBeVisible();
  await expect(page.getByText(/99°C/)).toHaveCount(0);
});

test('旧天气观测不会作为新鲜实时天气展示或自动换成示例', async ({ page }) => {
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: weatherResult(1700000000000) }));
  await page.goto('/');
  await expect(page.getByRole('region', { name: '今日天气' }).getByRole('alert')).toContainText('暂时无法获取天气');
  await expect(page.getByText('体感温度：19°C')).toHaveCount(0);
  await expect(page.getByText(/示例天气 · 深圳/)).toHaveCount(0);
});
