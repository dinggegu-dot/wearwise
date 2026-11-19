import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';

const image = path.resolve('tests/fixtures/synthetic-shirt.jpg');

async function openWardrobe(page: Page) {
  await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'demo'));
  await page.goto('/wardrobe');
  await page.getByRole('button', { name: '＋ 添加衣物' }).click();
  await page.getByLabel('衣物照片（可选）').setInputFiles(image);
}

async function previewCornerRgb(page: Page) {
  return page.getByAltText('照片预览').evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
  });
}

test('真实 BiRefNet 输出进入衣橱保存的图片 blob', async ({ page }) => {
  test.setTimeout(120000);
  let modelBytes = 0;
  page.on('response', response => {
    if (response.url().includes('/models/birefnet/model_fp16.onnx')) modelBytes = Number(response.headers()['content-length'] ?? 0);
  });
  await openWardrobe(page);
  await expect(page.getByText('已在本机完成白底抠图。')).toBeVisible({ timeout: 90000 });
  expect(modelBytes).toBeGreaterThan(90_000_000);
  const corner = await previewCornerRgb(page);
  expect(corner[0]).toBeGreaterThan(248);
  expect(corner[1]).toBeGreaterThan(248);
  expect(corner[2]).toBeGreaterThan(248);

  await page.getByLabel('名称').fill('BiRefNet 本地测试衣物');
  await page.getByLabel('颜色').fill('红色');
  await page.screenshot({ path: 'test-results/round5/single-real-white.png', fullPage: true });
  await page.getByRole('button', { name: '确认保存' }).click();
  const card = page.locator('article').filter({ hasText: 'BiRefNet 本地测试衣物' });
  await expect(card).toBeVisible();
  const savedCorner = await card.locator('img').evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
  });
  expect(savedCorner.every(channel => channel > 248)).toBe(true);
  await page.reload();
  await expect(page.locator('article').filter({ hasText: 'BiRefNet 本地测试衣物' })).toBeVisible();
});

test('本机模型无法加载时明确失败，原背景不得保存', async ({ page }) => {
  await page.route('**/models/birefnet/model_fp16.onnx', route => route.fulfill({ status: 503, body: 'model unavailable' }));
  await openWardrobe(page);
  await expect(page.getByRole('alert').filter({hasText:'白底处理失败'})).toBeVisible({ timeout: 30000 });
  const corner = await page.getByAltText('上传原图').evaluate((image: HTMLImageElement) => { const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const x=c.getContext('2d')!;x.drawImage(image,0,0);return [...x.getImageData(0,0,1,1).data].slice(0,3); });
  expect(corner[0]).toBeGreaterThan(120); expect(corner[0]).toBeLessThan(150);
  expect(corner[1]).toBeGreaterThan(140); expect(corner[1]).toBeLessThan(170);
  expect(corner[2]).toBeGreaterThan(150); expect(corner[2]).toBeLessThan(180);
  await page.getByLabel('名称').fill('BiRefNet 回退测试衣物');
  await page.getByLabel('颜色').fill('红色');
  await expect(page.getByRole('button', { name: '确认保存' })).toBeDisabled();
  await expect(page.locator('.wardrobe-grid article').filter({ hasText: 'BiRefNet 回退测试衣物' })).toHaveCount(0);
});

test('仅在本次原始上传文件仍在内存时重新处理白底图', async ({ page }) => {
  test.setTimeout(120000);
  const unavailable = (route: import('@playwright/test').Route) => route.fulfill({ status: 503, body: 'model unavailable' });
  await page.route('**/models/birefnet/model_fp16.onnx', unavailable);
  await openWardrobe(page);
  await expect(page.getByRole('alert').filter({hasText:'白底处理失败'})).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button',{name:'确认保存'})).toBeDisabled();
  await page.unroute('**/models/birefnet/model_fp16.onnx', unavailable);
  await page.getByRole('button', { name: '重新处理白底图' }).click();
  await expect(page.getByText('已在本机完成白底抠图。')).toBeVisible({ timeout: 90000 });
  const after = await previewCornerRgb(page);
  expect(after.every(channel => channel > 248)).toBe(true);
  await expect(page.getByRole('alert').filter({hasText:'白底处理失败'})).toHaveCount(0);
  await page.getByLabel('名称').fill('白底重试测试');
  await page.getByLabel('颜色').fill('红色');
  await page.getByRole('button', { name: '确认保存' }).click();
  await page.locator('article').filter({ hasText: '白底重试测试' }).getByRole('button', { name: '编辑' }).click();
  await expect(page.getByRole('button', { name: '重新处理白底图' })).toHaveCount(0);
  await expect(page.getByText('原始照片未保存；如需重新处理白底图，请重新选择照片。')).toBeVisible();
});
