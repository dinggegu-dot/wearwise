import { chromium, test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('隔离 Chrome 用户目录关闭并重开后衣物和图片仍可读取', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'wearwise-chrome-test-'));
  let context = await chromium.launchPersistentContext(profile, {channel:'chrome',headless:true});
  try {
    let page = context.pages()[0] ?? await context.newPage();
    await page.goto('http://127.0.0.1:3000/wardrobe');
    await expect(page.getByText('真实衣橱 · 仅本浏览器保存')).toBeVisible();
    await page.getByRole('button', {name:'＋ 添加衣物'}).click();
    await page.getByLabel('名称').fill('重开测试衣物'); await page.getByLabel('颜色').fill('绿色');
    const png = await page.evaluate(() => { const c=document.createElement('canvas');c.width=8;c.height=8;return c.toDataURL('image/png').split(',')[1]; });
    await page.getByLabel('衣物照片（可选）').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await expect(page.getByAltText('照片预览')).toBeVisible();
    await page.getByRole('button', {name:'确认保存'}).click();
    await expect(page.getByRole('heading', {name:'重开测试衣物'})).toBeVisible();
    await context.close();
    context = await chromium.launchPersistentContext(profile, {channel:'chrome',headless:true});
    page = context.pages()[0] ?? await context.newPage();
    await page.goto('http://127.0.0.1:3000/wardrobe');
    await expect(page.getByRole('heading', {name:'重开测试衣物'})).toBeVisible();
    await expect(page.locator('article img')).toBeVisible();
    expect(await page.locator('article img').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBe(8);
  } finally { await context.close(); await rm(profile,{recursive:true,force:true}); }
});
