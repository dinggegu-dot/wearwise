import { expect, test } from '@playwright/test';
import path from 'node:path';

test('识别与白底处理并行，候选填入网页且用户修改后才保存', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real'));
  let releaseModel!: () => void;
  const modelGate = new Promise<void>(resolve => { releaseModel = resolve; });
  let modelRequested!: () => void;
  const modelSeen = new Promise<void>(resolve => { modelRequested = resolve; });
  await page.route('**/models/birefnet/model_fp16.onnx', async route => {
    modelRequested();
    await modelGate;
    await route.fulfill({ status: 503, body: 'local model unavailable' }).catch(() => {});
  });
  await page.route('**/api/capabilities', route => route.fulfill({ status: 200, json: { recognition: { available: true } } }));
  let releaseRecognition!: () => void;
  const recognitionGate = new Promise<void>(resolve => { releaseRecognition = resolve; });
  let recognitionRequested!: () => void;
  const recognitionSeen = new Promise<void>(resolve => { recognitionRequested = resolve; });
  await page.route('**/api/recognition', async route => {
    recognitionRequested();
    await recognitionGate;
    await route.fulfill({ status: 200, json: { ok: true, data: { candidate: {
      candidateId: '8f68ab7e-2c2b-4ed5-a705-e88fd76ddbc3', name: '模型识别的上衣',
      category: 'top', color: '蓝色', fit: '宽松', warmth: 'light', material: '棉',
      styleTags: ['休闲'], description: '蓝色宽松上衣', warnings: [],
    } } } }).catch(() => {});
  });

  await page.goto('/wardrobe');
  await page.getByRole('button', { name: '＋ 添加衣物' }).click();
  await page.getByLabel('衣物照片（可选）').setInputFiles(path.resolve('tests/fixtures/synthetic-shirt.jpg'));
  await modelSeen;
  await recognitionSeen;
  // The remote request starts even while the local background model is held back.
  await expect(page.getByRole('status').filter({ hasText: '正在处理图片' })).toBeVisible();
  await page.getByLabel('名称').fill('用户自己的名称');
  releaseRecognition();
  await expect(page.getByText('AI 识别结果已填入表单，请检查并修改后确认保存。')).toBeVisible();
  await expect(page.getByLabel('名称')).toHaveValue('用户自己的名称');
  await expect(page.getByLabel('颜色')).toHaveValue('蓝色');
  await expect(page.getByLabel('版型')).toHaveValue('宽松');
  await expect(page.getByLabel('描述')).toHaveValue('蓝色宽松上衣');
  await expect(page.locator('article')).toHaveCount(0);

  releaseModel();
  await expect(page.getByAltText('照片预览')).toBeVisible();
  await page.getByLabel('版型').fill('合身');
  await page.getByLabel('描述').fill('用户确认的描述');
  await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.getByRole('heading', { name: '用户自己的名称' })).toBeVisible();
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wearwise-real-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const values = await new Promise<unknown[]>((resolve, reject) => {
      const transaction = db.transaction('garments', 'readonly');
      const request = transaction.objectStore('garments').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close(); return values;
  });
  expect(saved).toMatchObject([{ name: '用户自己的名称', fit: '合身', description: '用户确认的描述' }]);
});
