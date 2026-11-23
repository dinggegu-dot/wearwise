import { expect, test } from '@playwright/test';
import path from 'node:path';

const photo = path.resolve('tests/fixtures/generated-ui.jpg');
type Saved = { inspirations: Array<{ id: string; imageId: string; analysis: string; revision: number }>; preferences: Array<{ id: string; content: string; state: string; inspiration?: { key: string; sourceIds: string[] } }> };
async function saved(page: import('@playwright/test').Page): Promise<Saved> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('wearwise-real-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(['inspirations', 'preferences'], 'readonly');
    const all = (store: string) => new Promise<unknown[]>((resolve, reject) => { const request = tx.objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const [inspirations, preferences] = await Promise.all([all('inspirations'), all('preferences')]); db.close(); return { inspirations, preferences } as Saved;
  });
}
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real')); });

test('确认文字才形成偏好；相同喜好合并来源，删除一张不丢失另一张', async ({ page }) => {
  await page.route('**/api/inspiration/analyze', route => route.fulfill({ json: { ok: true, data: { name: '灵感照片', analysis: '灰白配色和叠穿。', tags: [{ text: '灰白配色', kind: 'color' }] } } }));
  await page.goto('/inspiration');
  const add = async (text: string) => {
    await page.locator('input[type=file]').first().setInputFiles(photo);
    const dialog = page.getByRole('dialog', { name: '上传灵感' });
    await expect(dialog.getByLabel('分析')).toHaveValue('灰白配色和叠穿。');
    await dialog.getByLabel('分析').fill(text);
    await dialog.getByRole('button', { name: '确认保存' }).click();
    await expect(dialog).toHaveCount(0);
  };
  await add('灰白配色和叠穿。');
  expect((await saved(page)).preferences.filter(p => p.state === 'active')).toHaveLength(0);
  await add('喜欢灰白配色，但不喜欢紧身裤。');
  await add('我喜欢灰白色搭配。');
  let state = await saved(page);
  expect(state.inspirations).toHaveLength(3);
  expect(state.preferences.filter(p => p.state === 'active')).toHaveLength(2);
  expect(state.preferences.find(p => p.inspiration?.key === 'like:灰白配色')?.inspiration?.sourceIds).toHaveLength(2);
  const cards = page.locator('article');
  page.once('dialog', dialog => dialog.accept());
  await cards.nth(1).getByRole('button', { name: '删除' }).click();
  state = await saved(page);
  expect(state.preferences.find(p => p.inspiration?.key === 'like:灰白配色')?.inspiration?.sourceIds).toHaveLength(1);
  await page.reload();
  expect((await saved(page)).preferences.find(p => p.inspiration?.key === 'like:灰白配色')?.inspiration?.sourceIds).toHaveLength(1);
});

test('分析失败保留图片且不能保存；成功重试后图片和内容持久化', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/inspiration/analyze', route => {
    attempts++;
    return route.fulfill({ status: attempts === 1 ? 502 : 200, json: attempts === 1 ? { ok: false, error: { message: '视觉模型请求失败。' } } : { ok: true, data: { name: '重试成功', analysis: '喜欢叠穿', tags: [] } } });
  });
  await page.goto('/inspiration');
  await page.locator('input[type=file]').first().setInputFiles(photo);
  const dialog = page.getByRole('dialog', { name: '上传灵感' });
  await expect(dialog.getByText(/AI分析失败。图片已保留/)).toBeVisible();
  await expect(dialog.getByAltText('灵感预览')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '确认保存' })).toBeDisabled();
  expect((await saved(page)).inspirations).toHaveLength(0);
  await dialog.getByRole('button', { name: '重新分析/重试' }).click();
  await expect(dialog.getByLabel('分析')).toHaveValue('喜欢叠穿');
  await dialog.getByRole('button', { name: '确认保存' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.locator('article').getByRole('heading', { name: '重试成功' })).toBeVisible();
  expect((await saved(page)).preferences.filter(p => p.state === 'active').map(p => p.content)).toEqual(['喜欢叠穿']);
  expect(attempts).toBe(2);
});

test('保存写入失败后保留草稿，连续点击与重试只产生一条灵感', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      const state = window as unknown as { failInspirationOnce?: boolean };
      if (this.name === 'inspirations' && state.failInspirationOnce) { state.failInspirationOnce = false; throw new DOMException('注入写入失败', 'QuotaExceededError'); }
      return original.call(this, value, key);
    };
  });
  await page.route('**/api/inspiration/analyze', route => route.fulfill({ json: { ok: true, data: { name: '待保存灵感', analysis: '喜欢叠穿', tags: [] } } }));
  await page.goto('/inspiration');
  await page.locator('input[type=file]').first().setInputFiles(photo);
  const dialog = page.getByRole('dialog', { name: '上传灵感' });
  await expect(dialog.getByLabel('分析')).toHaveValue('喜欢叠穿');
  await page.evaluate(() => { (window as unknown as { failInspirationOnce: boolean }).failInspirationOnce = true; });
  await dialog.getByRole('button', { name: '确认保存' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('分析')).toHaveValue('喜欢叠穿');
  expect((await saved(page)).inspirations).toHaveLength(0);
  await dialog.getByRole('button', { name: '确认保存' }).dblclick();
  await expect(dialog).toHaveCount(0);
  expect((await saved(page)).inspirations).toHaveLength(1);
  expect((await saved(page)).preferences.filter(p => p.state === 'active')).toHaveLength(1);
});

test('编辑时旧 revision 被拒绝且用户草稿保留', async ({ page }) => {
  await page.route('**/api/inspiration/analyze', route => route.fulfill({ json: { ok: true, data: { name: '原名称', analysis: '喜欢叠穿', tags: [] } } }));
  await page.goto('/inspiration');
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.getByRole('dialog', { name: '上传灵感' })).toHaveCount(0);
  await page.locator('article').getByRole('button', { name: '编辑' }).click();
  const editor = page.getByRole('dialog', { name: '编辑灵感' });
  await editor.getByLabel('名称').fill('我的修改');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('wearwise-real-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction('inspirations', 'readwrite');
    const store = tx.objectStore('inspirations');
    const all = await new Promise<Array<{ id: string; name: string; revision: number }>>((resolve, reject) => { const request = store.getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    store.put({ ...all[0], name: '其他窗口的新版本', revision: all[0].revision + 1 });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
  });
  await editor.getByRole('button', { name: '保存修改' }).click();
  await expect(editor.getByRole('alert')).toContainText('已被修改');
  await expect(editor.getByLabel('名称')).toHaveValue('我的修改');
  expect((await saved(page)).inspirations[0].revision).toBe(2);
});

test('编辑时换图必须重新分析，保存后更新同一条灵感及图片', async ({ page }) => {
  let call = 0;
  let releaseSecond!: () => void;
  const secondPending = new Promise<void>(resolve => { releaseSecond = resolve; });
  await page.route('**/api/inspiration/analyze', async route => {
    const current = ++call;
    if (current === 2) await secondPending;
    await route.fulfill({ json: { ok: true, data: current === 1 ? { name: '第一张', analysis: '喜欢叠穿', tags: [] } : { name: '第二张', analysis: '不喜欢紧身裤', tags: [] } } });
  });
  await page.goto('/inspiration');
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.getByRole('dialog', { name: '上传灵感' })).toHaveCount(0);
  const original = (await saved(page)).inspirations[0];
  await page.locator('article').getByRole('button', { name: '编辑' }).click();
  const editor = page.getByRole('dialog', { name: '编辑灵感' });
  await editor.getByLabel('更换图片').setInputFiles(path.resolve('tests/fixtures/synthetic-shirt.jpg'));
  await expect(editor.getByRole('button', { name: '保存修改' })).toBeDisabled();
  releaseSecond();
  await expect(editor.getByLabel('名称')).toHaveValue('第二张');
  await editor.getByRole('button', { name: '保存修改' }).click();
  await expect(editor).toHaveCount(0);
  const updated = (await saved(page)).inspirations[0];
  expect(updated.id).toBe(original.id);
  expect(updated.imageId).not.toBe(original.imageId);
  expect(updated.revision).toBe(2);
  expect((await saved(page)).preferences.filter(p => p.state === 'active').map(p => p.content)).toEqual(['不喜欢紧身裤']);
});
