import { expect, test } from '@playwright/test';
import path from 'node:path';

const image = path.resolve('tests/fixtures/synthetic-shirt.jpg');

test('真实 OpenRouter 认证拒绝显示错误，保留图片并可再次请求', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real'));
  await page.goto('/inspiration');
  await page.locator('input[type=file]').setInputFiles(image);

  for (let attempt = 1; attempt <= 2; attempt++) {
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/inspiration/analyze'));
    await page.getByRole('button', { name: '分析/重试' }).click();
    const response = await responsePromise;
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(502);
    expect(body).toMatchObject({ ok: false, error: { code: 'AI_PROVIDER_ERROR', message: '视觉模型请求失败。', retryable: false } });
    await expect(page.locator('p[role="alert"]')).toHaveText('视觉模型请求失败。');
    await expect(page.getByAltText('灵感预览')).toBeVisible();
    if (attempt === 1) await expect(page.getByRole('button', { name: '分析/重试' })).toBeEnabled();
  }
  expect(await page.locator('article').count()).toBe(0);
});
