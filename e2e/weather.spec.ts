import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real')); });

test('天气失败后可重试或主动选择示例，切换城市不复用旧结果', async ({ page }) => {
  let calls = 0;
  await page.route('https://api.open-meteo.com/**', async route => {
    calls++;
    if (calls === 1) return route.fulfill({ status: 503, body: 'unavailable' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({current_units:{temperature_2m:'°C',apparent_temperature:'°C'},current:{time:Math.floor(Date.now()/1000),temperature_2m:20,apparent_temperature:19,weather_code:3}}) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '查看天气' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '天气暂时不可用' })).toBeVisible();
  await page.getByRole('button', { name: '使用示例天气' }).click();
  await expect(page.getByText(/示例天气 · 深圳/)).toBeVisible();
  await expect.poll(() => calls).toBe(1);
  await page.getByLabel('选择城市').selectOption('上海');
  await expect(page.getByText(/示例天气 · 深圳/)).toHaveCount(0);
  await page.getByRole('button', { name: '查看天气' }).click();
  await expect(page.getByText('上海 阴天')).toBeVisible();
  await expect(page.getByText(/体感 19°C/)).toBeVisible();
  expect(calls).toBe(2);
});

test('快速切换城市时较晚的天气响应不覆盖当前城市', async ({page}) => {
  await page.route('https://api.open-meteo.com/**', async route => {
    const url=new URL(route.request().url());const beijing=url.searchParams.get('latitude') === '39.9042';
    if (beijing) await new Promise(resolve=>setTimeout(resolve,600));
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({current_units:{temperature_2m:'°C',apparent_temperature:'°C'},current:{time:Math.floor(Date.now()/1000),temperature_2m:beijing?8:20,apparent_temperature:beijing?6:19,weather_code:3}})}).catch(()=>{});
  });
  await page.goto('/');await page.getByLabel('选择城市').selectOption('北京');await page.getByRole('button',{name:'查看天气'}).click();
  await page.getByLabel('选择城市').selectOption('上海');await page.getByRole('button',{name:'查看天气'}).click();
  await expect(page.getByText('上海 阴天')).toBeVisible();await page.waitForTimeout(800);
  await expect(page.getByText('上海 阴天')).toBeVisible();await expect(page.getByText('北京 阴天')).toHaveCount(0);
});

test('切换示例模式后旧天气请求的晚响应不会污染新模式',async({page})=>{
  let started!:()=>void,release!:()=>void;
  const seen=new Promise<void>(resolve=>{started=resolve;});const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('https://api.open-meteo.com/**',async route=>{
    started();await gate;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({current_units:{temperature_2m:'°C',apparent_temperature:'°C'},current:{time:Math.floor(Date.now()/1000),temperature_2m:99,apparent_temperature:99,weather_code:3}})}).catch(()=>{});
  });
  await page.goto('/');await page.getByRole('button',{name:'查看天气'}).click();await seen;
  await page.getByRole('button',{name:'切换示例模式'}).click();await expect(page.getByText('示例模式 · 示例数据')).toBeVisible();
  release();await page.getByRole('button',{name:'使用示例天气'}).click();
  await expect(page.getByText(/示例天气 · 深圳/)).toBeVisible();await expect(page.getByText(/体感 21°C/)).toBeVisible();
  await expect(page.getByText(/99°C/)).toHaveCount(0);
});

test('旧天气观测不会作为新鲜实时天气展示',async({page})=>{
  await page.route('https://api.open-meteo.com/**',route=>route.fulfill({status:200,json:{current_units:{temperature_2m:'°C',apparent_temperature:'°C'},current:{time:1700000000,temperature_2m:20,apparent_temperature:19,weather_code:3}}}));
  await page.goto('/');await page.getByRole('button',{name:'查看天气'}).click();
  await expect(page.getByRole('alert').filter({hasText:'天气暂时不可用'})).toBeVisible();
  await expect(page.getByText(/体感 19°C/)).toHaveCount(0);
  await page.getByRole('button',{name:'使用示例天气'}).click();await expect(page.getByText(/示例天气 · 深圳/)).toBeVisible();
});
