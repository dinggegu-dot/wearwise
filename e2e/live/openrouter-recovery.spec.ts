import { expect, test } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';

test('真实 OpenRouter 拒绝后恢复有效配置，页面重试成功', async ({ page, request }) => {
  test.setTimeout(150000);
  const outfit = path.resolve('tests/fixtures/real-outfit-cc0.jpg');
  await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real'));
  let attempts = 0;
  await page.route('**/api/inspiration/analyze', async route => {
    if (++attempts === 1) {
      // The first request goes to a local server with an invalid placeholder credential.
      // Its 502 is a real OpenRouter authentication rejection, not a mocked model result.
      const rejected = await request.post('http://127.0.0.1:3007/api/inspiration/analyze', {
        multipart: { image: { name: 'real-outfit-cc0.jpg', mimeType: 'image/jpeg', buffer: readFileSync(outfit) } },
      });
      await route.fulfill({ status: rejected.status(), contentType: 'application/json', body: await rejected.text() });
    } else await route.continue();
  });
  await page.goto('/inspiration');
  await page.locator('input[type=file]').setInputFiles(outfit);
  const firstResponse = page.waitForResponse(response => response.url().endsWith('/api/inspiration/analyze'));
  await page.getByRole('button', { name: '分析/重试' }).click();
  const first = await firstResponse;
  const firstBody = await first.json();
  expect(first.status(), JSON.stringify(firstBody)).toBe(502);
  expect(firstBody).toMatchObject({ ok: false, error: { code: 'AI_PROVIDER_ERROR', retryable: false } });
  await expect(page.locator('p[role="alert"]')).toHaveText('视觉模型请求失败。');
  await expect(page.getByAltText('灵感预览')).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);

  const secondResponse = page.waitForResponse(response => response.url().endsWith('/api/inspiration/analyze'));
  await page.getByRole('button', { name: '分析/重试' }).click();
  const second = await secondResponse;
  const body = await second.json();
  expect(second.status(), JSON.stringify(body)).toBe(200);
  expect(body.ok).toBe(true);
  expect(body.data.name).toEqual(expect.any(String));
  expect(body.data.analysis).toEqual(expect.any(String));
  expect(body.data.tags.length).toBeGreaterThan(0);
  await expect(page.getByLabel('名称')).toHaveValue(body.data.name);
  await expect(page.getByLabel('分析')).toHaveValue(body.data.analysis);
  await expect(page.getByLabel('标签 1', { exact: true })).toHaveValue(body.data.tags[0].text);
  await expect(page.locator('p[role="alert"]')).toHaveCount(0);
  expect(attempts).toBe(2);
});
