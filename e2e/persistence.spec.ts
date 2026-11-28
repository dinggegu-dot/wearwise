import { mockBackground, confirmSingleTarget } from './helpers/background';
import { chromium, test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('隔离 Chrome 用户目录关闭并重开后衣物和图片仍可读取', async ({ baseURL }) => {
  test.setTimeout(120000);
  if (!baseURL) throw new Error('Playwright baseURL 未配置');
  const profile = await mkdtemp(join(tmpdir(), 'wearwise-chrome-test-'));
  let context = await chromium.launchPersistentContext(profile, {channel:'chrome',headless:true});
  try {
    let page = context.pages()[0] ?? await context.newPage();
    await page.goto(`${baseURL}/wardrobe`);
    // Mock online processing; persistent profile is isolated from user data.
    await mockBackground(page);
    await page.route('**/api/capabilities', route => route.fulfill({ json: { recognition: { available: false } } }));
    await expect(page.getByText('真实衣橱 · 仅本浏览器保存')).toBeVisible();
    await page.getByRole('button', {name:'＋ 添加衣物'}).click();
    await page.getByLabel('名称').fill('重开测试衣物'); await page.getByLabel('颜色').fill('绿色');
    const png = await page.evaluate(() => { const c=document.createElement('canvas');c.width=8;c.height=8;return c.toDataURL('image/png').split(',')[1]; });
    await page.getByLabel('衣物照片（可选）').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}); await confirmSingleTarget(page);
    await expect(page.getByAltText('照片预览')).toBeVisible({ timeout: 90000 });
    await page.getByRole('button', {name:'改为手动填写并确认'}).click();
    await page.getByRole('button', {name:'确认保存'}).click();
    await expect(page.getByRole('heading', {name:'重开测试衣物'})).toBeVisible();
    await context.close();
    context = await chromium.launchPersistentContext(profile, {channel:'chrome',headless:true});
    page = context.pages()[0] ?? await context.newPage();
    await page.goto(`${baseURL}/wardrobe`);
    await expect(page.getByRole('heading', {name:'重开测试衣物'})).toBeVisible();
    await expect(page.locator('article img')).toBeVisible();
    expect(await page.locator('article img').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBe(8);
  } finally { await context.close(); await rm(profile,{recursive:true,force:true}); }
});
