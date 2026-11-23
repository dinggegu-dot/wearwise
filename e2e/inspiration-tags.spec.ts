import { expect, test } from '@playwright/test';
import path from 'node:path';

test('灵感标签按删旧加新修改、确认后持久化', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real'));
  await page.route('**/api/inspiration/analyze', route => route.fulfill({ status: 200, json: {
    ok: true, data: { name: '测试穿搭', analysis: '原始分析', tags: [
      { text: '黑白配色', kind: 'color' }, { text: '休闲', kind: 'style' }, { text: '叠穿', kind: 'layering' },
    ] }, requestId: 'test-request',
  } }));
  await page.goto('/inspiration');
  await page.locator('input[type=file]').first().setInputFiles(path.resolve('tests/fixtures/generated-ui.jpg'));
  const dialog = page.getByRole('dialog', { name: '上传灵感' });
  await expect(dialog.getByText('配色 · 黑白配色')).toBeVisible();
  await dialog.getByRole('button', { name: '删除标签 1' }).click();
  await dialog.getByRole('button', { name: '删除标签 1' }).click();
  await dialog.getByLabel('新增标签').fill('灰白配色');
  await dialog.getByLabel('标签类型').selectOption('style');
  await dialog.getByRole('button', { name: '＋ 添加标签' }).click();
  await dialog.getByLabel('新增标签').fill('通勤');
  await dialog.getByRole('button', { name: '＋ 添加标签' }).click();
  await dialog.getByLabel('名称').fill('用户确认穿搭');
  await dialog.getByLabel('分析').fill('用户确认分析');
  await dialog.getByRole('button', { name: '确认保存' }).click();
  const card = page.locator('article').filter({ hasText: '用户确认穿搭' });
  await expect(card).toBeVisible();
  await expect(card.locator('img')).toBeVisible();
  await page.reload();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '编辑' }).click();
  const editor = page.getByRole('dialog', { name: '编辑灵感' });
  await expect(editor.getByText('风格 · 灰白配色')).toBeVisible();
  await expect(editor.getByText('自定义 · 通勤')).toBeVisible();
  await expect(editor.getByText('层次 · 叠穿')).toBeVisible();
  await expect(editor.getByLabel('分析')).toHaveValue('用户确认分析');
});
