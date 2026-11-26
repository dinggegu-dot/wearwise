import { expect, test, type Page } from '@playwright/test';

/** 第 7 轮「我的偏好」：真实页面上的增改删、取消、冲突与快照展示。 */

type Pref = { id: string; group: string; content: string; state: string; revision: number; userEdited: boolean; feedback?: { choice: string } };
async function prefs(page: Page): Promise<Pref[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('wearwise-real-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const list = await new Promise<unknown[]>((resolve, reject) => { const r = db.transaction('preferences').objectStore('preferences').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close(); return list as Pref[];
  });
}
/** 写入测试数据：灵感归纳需要真实 AI，永久反馈入口属于第 8 轮，这里直接放入页面所用的同一数据库。 */
async function seed(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('wearwise-real-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const t = new Date().toISOString();
    const svg = (fill: string) => new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="${fill}"/></svg>`], { type: 'image/svg+xml' });
    const snapshots = [['top', '白色T恤', '#eee'], ['bottom', '深蓝直筒裤', '#234'], ['shoes', '白色板鞋', '#fafafa']].map(([category, name, fill], i) => ({ id: `e2e-g${i}`, name, category, color: '测试', fit: '不确定', warmth: 'medium', styleTags: [], sceneTags: [], imageId: `e2e-img${i}`, fill }));
    const tx = db.transaction(['media', 'preferences'], 'readwrite');
    for (const s of snapshots) tx.objectStore('media').put({ id: s.imageId, blob: svg(s.fill) });
    tx.objectStore('preferences').put({ id: 'e2e-insp', group: 'inspiration', content: '可能偏好低饱和配色', state: 'active', userEdited: false, inspiration: { key: 'e2e-low-sat', sourceIds: ['e2e-src'] }, revision: 1, createdAt: t, updatedAt: t });
    tx.objectStore('preferences').put({ id: 'e2e-fb', group: 'feedback', content: '不喜欢深色裤装', state: 'active', userEdited: false, feedback: { choice: 'dislike', outfit: { resultId: 'e2e-r', garmentIds: snapshots.map(s => s.id), snapshots: snapshots.map(({ fill: _fill, ...s }) => s) } }, revision: 1, createdAt: t, updatedAt: t });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  });
}

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real')); });

test('明确偏好：取消不写入，保存成功才出现；编辑取消保留原值；刷新后仍在；可以删除', async ({ page }) => {
  await page.goto('/preferences');
  const explicit = page.getByRole('region', { name: '明确偏好' });
  await expect(explicit.getByText('还没有主动设置的偏好')).toBeVisible();

  await page.getByRole('button', { name: '添加偏好' }).click();
  let dialog = page.getByRole('dialog', { name: '添加偏好' });
  await dialog.getByRole('textbox').fill('不会保存的内容');
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await prefs(page)).toHaveLength(0);

  await page.getByRole('button', { name: '添加偏好' }).click();
  dialog = page.getByRole('dialog', { name: '添加偏好' });
  await expect(dialog.getByRole('button', { name: '保存' })).toBeDisabled();
  await dialog.getByRole('textbox').fill('喜欢直筒裤');
  await dialog.getByRole('button', { name: '保存' }).click();
  await expect(explicit.getByText('喜欢直筒裤')).toBeVisible();
  await expect(explicit.getByText('你主动设置')).toBeVisible();

  await explicit.getByRole('button', { name: '编辑' }).click();
  dialog = page.getByRole('dialog', { name: '编辑偏好' });
  await expect(dialog.getByRole('textbox')).toHaveValue('喜欢直筒裤');
  await dialog.getByRole('textbox').fill('取消掉的修改');
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(explicit.getByText('喜欢直筒裤')).toBeVisible();

  await explicit.getByRole('button', { name: '编辑' }).click();
  dialog = page.getByRole('dialog', { name: '编辑偏好' });
  await dialog.getByRole('textbox').fill('喜欢直筒或阔腿裤');
  await dialog.getByRole('button', { name: '保存修改' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(explicit.getByText('喜欢直筒或阔腿裤')).toBeVisible();
  await page.reload();
  await expect(explicit.getByText('喜欢直筒或阔腿裤')).toBeVisible();

  page.once('dialog', confirm => void confirm.accept());
  await explicit.getByRole('button', { name: '删除' }).click();
  await expect(explicit.getByText('还没有主动设置的偏好')).toBeVisible();
  expect(await prefs(page)).toHaveLength(0);
});

test('保存冲突：别处已修改时提示刷新，保留填写内容且不覆盖', async ({ page }) => {
  await page.goto('/preferences');
  await page.getByRole('button', { name: '添加偏好' }).click();
  await page.getByRole('dialog', { name: '添加偏好' }).getByRole('textbox').fill('不喜欢亮色');
  await page.getByRole('dialog', { name: '添加偏好' }).getByRole('button', { name: '保存' }).click();
  const explicit = page.getByRole('region', { name: '明确偏好' });
  await explicit.getByRole('button', { name: '编辑' }).click();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('wearwise-real-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const tx = db.transaction('preferences', 'readwrite'); const store = tx.objectStore('preferences');
    const all = await new Promise<Array<{ revision: number; content: string }>>(resolve => { const r = store.getAll(); r.onsuccess = () => resolve(r.result); });
    store.put({ ...all[0], content: '别处刚保存的内容', revision: all[0].revision + 1 });
    await new Promise(resolve => { tx.oncomplete = resolve; }); db.close();
  });
  const dialog = page.getByRole('dialog', { name: '编辑偏好' });
  await dialog.getByRole('textbox').fill('旧页面的修改');
  await dialog.getByRole('button', { name: '保存修改' }).click();
  await expect(dialog.getByRole('alert')).toContainText('已被修改');
  await expect(dialog.getByRole('textbox')).toHaveValue('旧页面的修改');
  await expect(explicit.getByText('别处刚保存的内容')).toBeVisible();
  expect((await prefs(page))[0].content).toBe('别处刚保存的内容');
});

test('灵感归纳与永久反馈：标识、快照图、编辑与删除标记', async ({ page }) => {
  await page.goto('/preferences');
  await seed(page);
  await page.reload();

  const inspiration = page.getByRole('region', { name: '灵感归纳' });
  await expect(inspiration.getByText('来源于对“穿搭灵感”的归纳总结')).toBeVisible();
  await expect(inspiration.getByText('根据穿搭灵感归纳')).toBeVisible();
  await expect(inspiration.locator('img')).toHaveCount(0);
  await inspiration.getByRole('button', { name: '编辑' }).click();
  await page.getByRole('dialog', { name: '编辑偏好' }).getByRole('textbox').fill('喜欢低饱和灰白配色');
  await page.getByRole('dialog', { name: '编辑偏好' }).getByRole('button', { name: '保存修改' }).click();
  await expect(inspiration.getByText('喜欢低饱和灰白配色')).toBeVisible();
  expect((await prefs(page)).find(p => p.id === 'e2e-insp')).toMatchObject({ userEdited: true, state: 'active' });

  const feedback = page.getByRole('region', { name: '永久反馈' });
  await expect(feedback.getByText('原因：不喜欢深色裤装')).toBeVisible();
  await expect(feedback.getByText('不喜欢', { exact: true })).toBeVisible();
  await expect(feedback.getByRole('img')).toHaveCount(3);
  await feedback.getByRole('button', { name: '查看' }).click();
  const view = page.getByRole('dialog', { name: '查看永久反馈' });
  await expect(view.getByRole('img', { name: '深蓝直筒裤' })).toBeVisible();
  await view.getByRole('button', { name: '编辑' }).click();
  const edit = page.getByRole('dialog', { name: '编辑偏好' });
  await edit.getByRole('radio', { name: '喜欢', exact: true }).check();
  await edit.getByRole('textbox').fill('');
  await edit.getByRole('button', { name: '保存修改' }).click();
  await expect(feedback.getByText('未填写原因（只表示对这套整体的态度）')).toBeVisible();
  expect((await prefs(page)).find(p => p.id === 'e2e-fb')).toMatchObject({ content: '', feedback: { choice: 'like' } });

  page.on('dialog', confirm => void confirm.accept());
  await inspiration.getByRole('button', { name: '删除' }).click();
  await expect(inspiration.getByText('暂无灵感归纳')).toBeVisible();
  expect((await prefs(page)).find(p => p.id === 'e2e-insp')).toMatchObject({ state: 'deleted' });
  await feedback.getByRole('button', { name: '删除' }).click();
  await expect(feedback.getByText('暂无永久反馈')).toBeVisible();
  expect((await prefs(page)).some(p => p.id === 'e2e-fb')).toBe(false);
});
