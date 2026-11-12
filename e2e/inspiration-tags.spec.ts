import { expect, test } from '@playwright/test';
import path from 'node:path';

test('灵感标签可逐条修改类别、删除和新增，确认后持久化', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real'));
  await page.route('**/api/inspiration/analyze', route => route.fulfill({ status: 200, json: {
    ok: true, data: { name: '测试穿搭', analysis: '原始分析', tags: [
      { text: '黑白配色', kind: 'color' }, { text: '休闲', kind: 'style' }, { text: '叠穿', kind: 'layering' },
    ] }, requestId: 'test-request',
  } }));
  await page.goto('/inspiration');
  await page.locator('input[type=file]').setInputFiles(path.resolve('tests/fixtures/generated-ui.jpg'));
  await page.getByRole('button', { name: '分析/重试' }).click();
  await expect(page.getByLabel('标签 1', { exact: true })).toHaveValue('黑白配色');
  await page.getByLabel('标签 1', { exact: true }).fill('灰白配色');
  await page.getByLabel('标签 1 类型').selectOption('style');
  await page.getByRole('button', { name: '删除标签 2' }).click();
  await page.getByLabel('新增标签').fill('通勤');
  await page.getByRole('button', { name: '添加标签' }).click();
  await page.getByLabel('名称').fill('用户确认穿搭');
  await page.getByLabel('分析').fill('用户确认分析');
  await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.getByRole('heading', { name: '用户确认穿搭' })).toBeVisible();
  await page.reload();
  const article = page.locator('article').filter({ hasText: '用户确认穿搭' });
  await expect(article).toBeVisible();
  await article.getByRole('button', { name: '编辑' }).click();
  await expect(page.getByLabel('标签 1', { exact: true })).toHaveValue('灰白配色');
  await expect(page.getByLabel('标签 1 类型')).toHaveValue('style');
  await expect(page.getByLabel('标签 2', { exact: true })).toHaveValue('叠穿');
  await expect(page.getByLabel('标签 3', { exact: true })).toHaveValue('通勤');
  await expect(page.getByLabel('标签 3 类型')).toHaveValue('');
  await expect(page.getByLabel('标签 4', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('分析')).toHaveValue('用户确认分析');
});
