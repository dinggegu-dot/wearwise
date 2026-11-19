import { expect, test } from '@playwright/test';
import path from 'node:path';

const image = process.env.WEARWISE_TEST_IMAGE || path.resolve('tests/fixtures/synthetic-shirt.jpg');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real'));
});

test('真实识别候选经确认、失败重试后持久化且不重复', async ({ page }) => {
  test.setTimeout(240000);
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      const state = window as unknown as { failNextGarmentWrite?: boolean };
      if (this.name === 'garments' && state.failNextGarmentWrite) {
        state.failNextGarmentWrite = false;
        throw new DOMException('injected failure', 'QuotaExceededError');
      }
      return original.call(this, value, key);
    };
  });

  await page.goto('/wardrobe');
  await page.getByRole('button', { name: '＋ 添加衣物' }).click();
  let responsePromise = page.waitForResponse(response => response.url().endsWith('/api/recognition'));
  await page.getByLabel('衣物照片（可选）').setInputFiles(image);
  await expect(page.getByAltText('照片预览')).toBeVisible({ timeout: 90000 });
  let result: { ok: boolean; data?: { candidate: { name: string } }; error?: { code: string } } | undefined;
  let response = await responsePromise;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await response.json();
    result = current;
    if (response.status() === 200 && current.ok) break;
    expect(['AI_INVALID_RESPONSE', 'AI_TIMEOUT', 'AI_PROVIDER_ERROR'], JSON.stringify(current)).toContain(current.error?.code);
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(current.error?.message ?? '识别失败');
    if (attempt < 2) {
      responsePromise = page.waitForResponse(next => next.url().endsWith('/api/recognition'));
      await page.getByRole('button', { name: '重新识别衣物' }).click();
      response = await responsePromise;
    }
  }
  expect(result?.ok, JSON.stringify(result)).toBe(true);
  await expect(page.getByLabel('名称')).not.toHaveValue('', { timeout: 90000 });
  await expect(page.getByText('AI 识别结果已填入表单，请检查并修改后确认保存。')).toBeVisible();

  const detectedName = await page.getByLabel('名称').inputValue();
  const confirmedName = `${detectedName}（已确认）`;
  await page.getByLabel('名称').fill(confirmedName);
  await page.evaluate(() => {
    (window as unknown as { failNextGarmentWrite: boolean }).failNextGarmentWrite = true;
  });

  await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('名称')).toHaveValue(confirmedName);
  const afterFailure = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wearwise-real-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const counts = await new Promise<number[]>((resolve, reject) => {
      const transaction = db.transaction(['garments', 'media'], 'readonly');
      const garments = transaction.objectStore('garments').count();
      const media = transaction.objectStore('media').count();
      transaction.oncomplete = () => resolve([garments.result, media.result]);
      transaction.onerror = () => reject(transaction.error);
    });
    db.close(); return counts;
  });
  expect(afterFailure).toEqual([0, 0]);

  await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.getByRole('heading', { name: confirmedName })).toBeVisible();
  const savedCounts = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wearwise-real-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const counts = await new Promise<number[]>((resolve, reject) => {
      const transaction = db.transaction(['garments', 'media'], 'readonly');
      const garments = transaction.objectStore('garments').count();
      const media = transaction.objectStore('media').count();
      transaction.oncomplete = () => resolve([garments.result, media.result]);
      transaction.onerror = () => reject(transaction.error);
    });
    db.close(); return counts;
  });
  expect(savedCounts).toEqual([1, 1]);
  await page.reload();
  await expect(page.getByRole('heading', { name: confirmedName })).toBeVisible();
  expect(await page.locator('article').count()).toBe(1);
});

test('真实灵感分析确认后保存，失败重试并在刷新后保留', async ({ page }) => {
  let analysisStatus: number | undefined;
  page.on('response', response => {
    if (response.url().endsWith('/api/inspiration/analyze')) analysisStatus = response.status();
  });
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      const state = window as unknown as { failNextInspirationWrite?: boolean };
      if (this.name === 'inspirations' && state.failNextInspirationWrite) {
        state.failNextInspirationWrite = false;
        throw new DOMException('injected failure', 'QuotaExceededError');
      }
      return original.call(this, value, key);
    };
  });

  await page.goto('/inspiration');
  await page.locator('input[type=file]').setInputFiles(image);
  await page.getByRole('button', { name: '分析/重试' }).click();
  await expect(page.getByLabel('名称')).not.toHaveValue('', { timeout: 60000 });
  await expect(page.getByLabel('分析')).not.toHaveValue('');
  expect(analysisStatus).toBe(200);
  const analysisName = await page.getByLabel('名称').inputValue();
  await page.evaluate(() => {
    (window as unknown as { failNextInspirationWrite: boolean }).failNextInspirationWrite = true;
  });

  await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('名称')).toHaveValue(analysisName);
  const afterFailure = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wearwise-real-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const counts = await new Promise<number[]>((resolve, reject) => {
      const transaction = db.transaction(['inspirations', 'media'], 'readonly');
      const inspirations = transaction.objectStore('inspirations').count();
      const media = transaction.objectStore('media').count();
      transaction.oncomplete = () => resolve([inspirations.result, media.result]);
      transaction.onerror = () => reject(transaction.error);
    });
    db.close(); return counts;
  });
  expect(afterFailure).toEqual([0, 0]);

  await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.getByRole('heading', { name: analysisName })).toBeVisible();
  const savedCounts = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wearwise-real-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const counts = await new Promise<number[]>((resolve, reject) => {
      const transaction = db.transaction(['inspirations', 'media'], 'readonly');
      const inspirations = transaction.objectStore('inspirations').count();
      const media = transaction.objectStore('media').count();
      transaction.oncomplete = () => resolve([inspirations.result, media.result]);
      transaction.onerror = () => reject(transaction.error);
    });
    db.close(); return counts;
  });
  expect(savedCounts).toEqual([1, 1]);
  await page.reload();
  await expect(page.getByRole('heading', { name: analysisName })).toBeVisible();
  expect(await page.locator('article').count()).toBe(1);
});
