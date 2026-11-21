import { expect, test } from '@playwright/test';
import path from 'node:path';
import { backgroundResult } from './helpers/background';

const sample = path.resolve('tests/fixtures/synthetic-shirt.jpg');
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real'));
  await page.route('**/api/capabilities', route => route.fulfill({ json: { recognition: { available: true } } }));
});

test('在线白底 HTTP 200 无效结果不能保存；只重试白底并持久化新版识别四字段', async ({ page }) => {
  let backgrounds = 0, recognitions = 0;
  await page.route('**/api/background/remove', route => {
    backgrounds++;
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    if (backgrounds === 1) return route.fulfill({ contentType: 'text/plain', body: 'done' });
    if (backgrounds === 2) return route.fulfill({ contentType: 'image/png', body: 'broken image' });
    return backgroundResult(route);
  });
  await page.route('**/api/recognition', route => {
    recognitions++;
    return route.fulfill({ json: { ok: true, data: { candidate: {
      candidateId: crypto.randomUUID(), name: '新版识别外套', category: 'outerwear', color: '红色',
      fit: '宽松', warmth: 'unknown', material: '不确定', description: '待用户检查',
      styleTags: ['Minimalist Style', '其他'], styleOther: ['Y2K'],
      sceneTags: ['Work', '其他'], sceneOther: ['音乐节'], warnings: ['请确认纽扣细节']
    } } } });
  });
  await page.goto('/wardrobe');
  await page.getByRole('button', { name: '＋ 添加衣物' }).click();
  await page.getByLabel('衣物照片（可选）').setInputFiles(sample);
  await expect(page.getByRole('alert').filter({ hasText: '在线白底结果格式无效' })).toBeVisible();
  await expect(page.getByRole('button', { name: '确认保存' })).toBeDisabled();
  await expect(page.getByLabel('名称')).toHaveValue('新版识别外套');
  await page.getByRole('button', { name: '重新处理白底图' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '在线白底结果无法解码' })).toBeVisible();
  await expect(page.getByRole('button', { name: '确认保存' })).toBeDisabled();
  await page.getByRole('button', { name: '重新处理白底图' }).click();
  await expect(page.getByAltText('上传原图')).toBeVisible();
  await expect(page.getByAltText('照片预览')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '白底处理完成' })).toBeVisible();
  await expect(page.locator('details.recognition-notes')).not.toHaveAttribute('open', '');
  await page.getByText('查看 AI 判断说明').click();
  await expect(page.getByText('请确认纽扣细节')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: '简约风', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '上班', exact: true })).toBeChecked();
  await expect(page.getByLabel('风格其他说明（每行一条）')).toHaveValue('Y2K');
  await expect(page.getByLabel('场景其他说明（每行一条）')).toHaveValue('音乐节');
  expect(backgrounds).toBe(3); expect(recognitions).toBe(1);
  await page.getByLabel('名称').fill('用户确认外套');
  await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.locator('.wardrobe-grid article').getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.getByLabel('名称')).toHaveValue('用户确认外套');
  await expect(page.getByRole('checkbox', { name: '简约风', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '上班', exact: true })).toBeChecked();
  await expect(page.getByLabel('风格其他说明（每行一条）')).toHaveValue('Y2K');
  await expect(page.getByLabel('场景其他说明（每行一条）')).toHaveValue('音乐节');
});

test('关闭弹窗和换图取消在线白底，迟到结果不覆盖新图', async ({ page }) => {
  let count = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/background/remove', async route => {
    if (++count <= 2) await gate;
    await backgroundResult(route).catch(() => {});
  });
  await page.route('**/api/recognition', route => route.fulfill({ status: 503, json: { ok: false, error: { message: '模拟识别不可用' } } }));
  await page.goto('/wardrobe');
  await page.getByRole('button', { name: '＋ 添加衣物' }).click();
  await page.getByLabel('衣物照片（可选）').setInputFiles(sample);
  await expect.poll(() => count).toBe(1);
  const failed = page.waitForEvent('requestfailed', { predicate: r => r.url().endsWith('/api/background/remove') });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await failed;
  await expect(page.locator('.wardrobe-grid article')).toHaveCount(0);
  await page.getByRole('button', { name: '＋ 添加衣物' }).click();
  await page.getByLabel('名称').fill('保留新草稿');
  await page.getByLabel('衣物照片（可选）').setInputFiles(sample);
  await expect.poll(() => count).toBe(2);
  const replaced = page.waitForEvent('requestfailed', { predicate: r => r.url().endsWith('/api/background/remove') });
  await page.getByLabel('衣物照片（可选）').setInputFiles(sample);
  await replaced;
  await expect(page.getByAltText('照片预览')).toBeVisible();
  release();
  await page.getByRole('button', { name: '改为手动填写并确认' }).click();
  await expect(page.getByLabel('名称')).toHaveValue('保留新草稿');
  await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.getByRole('heading', { name: '保留新草稿' })).toBeVisible();
  expect(count).toBe(3);
});
