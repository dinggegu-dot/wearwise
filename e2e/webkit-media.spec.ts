import { expect, test } from '@playwright/test';
import path from 'node:path';

test('WebKit 浏览器执行本机白底模型并显示预览', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real'));
  await page.route('**/api/capabilities', route => route.fulfill({ status: 200, json: { recognition: { available: false } } }));
  await page.goto('/wardrobe');
  await page.getByRole('button', { name: '＋ 添加衣物' }).click();
  await page.getByLabel('衣物照片（可选）').setInputFiles(path.resolve('tests/fixtures/synthetic-shirt.jpg'));
  await expect(page.getByText('已在本机完成白底抠图。')).toBeVisible({ timeout: 90000 });
  const corner = await page.getByAltText('照片预览').evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
  });
  expect(corner.every(channel => channel > 248)).toBe(true);
});
