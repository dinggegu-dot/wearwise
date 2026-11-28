import { test, expect, type Page } from '@playwright/test';

async function seed(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('wearwise-real-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const tx = db.transaction(['garments', 'media', 'preferences'], 'readwrite'), now = new Date().toISOString();
    for (const [id, name, category, fill] of [['T1','白色T恤','top','#eef0e8'],['T2','绿色上衣','top','#8b9d7f'],['B1','深蓝长裤','bottom','#40516b'],['B2','米色长裤','bottom','#c5b69c'],['S1','白色板鞋','shoes','#e2e2d8'],['S2','棕色便鞋','shoes','#9a795e']]) {
      const shape = category === 'top' ? '<path d="M35 20L15 40 28 59 37 49V112H103V49L112 59 125 40 105 20 87 12Q70 30 53 12Z"/>' : category === 'bottom' ? '<path d="M38 12H103L114 119H83L70 57 57 119H27Z"/>' : '<path d="M28 66L40 39 69 57 113 69Q132 74 129 98H23Q10 84 28 66Z"/>';
      tx.objectStore('media').put({ id: `img-${id}`, blob: new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140"><g fill="${fill}">${shape}</g></svg>`], { type: 'image/svg+xml' }) });
      tx.objectStore('garments').put({ id, name, category, color: fill, fit: '宽松', warmth: 'medium', styleTags: [], sceneTags: [], styleOther: [], sceneOther: [], description: '第9轮合成测试衣物', imageId: `img-${id}`, sourceType: 'manual', revision: 1, createdAt: now, updatedAt: now });
    }
    tx.objectStore('preferences').put({ id: 'r9-pref', group: 'explicit', content: '喜欢低饱和配色', state: 'active', userEdited: false, revision: 1, createdAt: now, updatedAt: now });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
  });
  await page.reload(); await expect(page.getByText('6 件衣物', { exact: true })).toBeVisible();
}
async function state(page: Page, key: string) {
  return page.evaluate(async key => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('wearwise-real-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const record = await new Promise<{ value: unknown } | undefined>((resolve, reject) => { const r = db.transaction('state').objectStore('state').get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close(); return record?.value;
  }, key);
}
async function changeGarment(page: Page, id: string, kind: 'delete' | 'pause') {
  await page.evaluate(async ({ id, kind }) => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('wearwise-real-v1'); r.onsuccess = () => resolve(r.result); });
    const tx = db.transaction('garments', 'readwrite'), store = tx.objectStore('garments'), read = store.get(id);
    read.onsuccess = () => store.put({ ...read.result, ...(kind === 'delete' ? { deletedAt: new Date().toISOString() } : { pause: { since: new Date().toISOString(), resumeOn: '2999-01-01' } }) });
    await new Promise(resolve => { tx.oncomplete = resolve; }); db.close();
    const c = new BroadcastChannel('wearwise-real'); c.postMessage('wardrobeChanged'); c.close();
  }, { id, kind });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real'));
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ status: 200, json: {
    current_units: { temperature_2m: '°C', apparent_temperature: '°C' },
    current: { time: Math.floor(Date.now() / 1000), temperature_2m: 22, apparent_temperature: 21, weather_code: 2 },
    daily: { temperature_2m_min: [18], temperature_2m_max: [25] }
  } }));
  await page.route('**/api/recommendation', route => {
    const input = route.request().postDataJSON(), operation = input.operation;
    let ids = ['T1', 'B1', 'S1'];
    if (operation?.kind === 'swap-outfit') ids = ['T2', 'B2', 'S2'];
    if (operation?.kind === 'swap-item') {
      const replacement = input.wardrobe.find((g: { id: string; category: string }) => g.category === operation.targetCategory && !operation.currentGarmentIds.includes(g.id));
      ids = operation.currentGarmentIds.map((id: string) => id === operation.targetGarmentId ? replacement.id : id);
    }
    return route.fulfill({ status: 200, json: { ok: true, data: { garmentIds: ids, reason: '低饱和配色协调，厚薄适合当前天气。', knowledgeVersion: 'V1.2' } } });
  });
});

test('空衣橱、五栏选中态、共享城市与天气失败重试', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('0 件衣物', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '今日穿搭' }).getByText('添加衣物后，为你生成今日穿搭')).toBeVisible();
  await page.getByLabel('选择城市').selectOption('上海'); await expect(page.getByText('上海 多云')).toBeVisible();
  const nav = page.getByRole('navigation', { name: '主导航' });
  for (const [name, path] of [['我的衣橱','/wardrobe'], ['穿搭推荐','/recommendations'], ['穿搭灵感','/inspiration'], ['我的偏好','/preferences'], ['首页','/']]) {
    await nav.getByRole('link', { name, exact: true }).click(); await expect(page).toHaveURL(path);
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
    if (name === '穿搭推荐') await expect(page.getByLabel('选择城市')).toHaveValue('上海');
  }
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ status: 503, body: 'offline' }));
  await page.getByRole('button', { name: '刷新天气' }).click(); await expect(page.locator('main [role=alert]')).toContainText('暂时无法获取天气');
  await page.screenshot({ path: 'test-results/round09-empty-weather-failure.png', fullPage: true });
  await page.unroute('https://api.open-meteo.com/**');
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ status: 200, json: { current_units: { temperature_2m: '°C', apparent_temperature: '°C' }, current: { time: Math.floor(Date.now()/1000), temperature_2m: 20, apparent_temperature: 19, weather_code: 3 }, daily: { temperature_2m_min: [16], temperature_2m_max: [24] } } }));
  await page.getByRole('button', { name: '重试', exact: true }).click(); await expect(page.getByText('上海 阴天')).toBeVisible();
});

test('真实页面生成、反馈、未应用草稿与首页双向隔离，刷新恢复', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('0 件衣物', { exact: true })).toBeVisible(); await seed(page);
  await page.getByRole('button', { name: '生成今日穿搭' }).click(); await expect(page.getByRole('button', { name: '换一套', exact: true })).toBeVisible();
  const homeBefore = await state(page, 'home.state');
  await page.getByRole('navigation').getByRole('link', { name: '穿搭推荐', exact: true }).click();
  await page.getByRole('button', { name: '生成穿搭', exact: true }).click();
  await page.getByRole('button', { name: '不喜欢', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.locator('textarea').fill('推荐页独有的单次反馈');
  await dialog.getByRole('button', { name: '提交反馈', exact: true }).click();
  await page.getByRole('button', { name: '暂时不换，返回' }).click();
  await page.getByLabel('本次喜好', { exact: true }).check(); await page.getByLabel('本次穿搭要求').fill('尚未应用的临时要求');
  await expect.poll(() => state(page, 'recommendations.settingsDraft')).toMatchObject({ preference: { text: '尚未应用的临时要求' } });
  const before = await state(page, 'recommendations.round'), draft = await state(page, 'recommendations.settingsDraft');
  expect(await state(page, 'home.state')).toEqual(homeBefore);
  await page.getByRole('navigation').getByRole('link', { name: '首页', exact: true }).click();
  await page.getByLabel('选择城市').selectOption('北京'); await expect(page.getByText('北京 多云')).toBeVisible();
  expect(await state(page, 'home.state')).toEqual(homeBefore);
  await page.getByRole('button', { name: '换一套', exact: true }).click(); await expect(page.getByRole('button', { name: '换掉绿色上衣' })).toBeEnabled();
  await page.getByRole('button', { name: '换掉绿色上衣' }).click(); await expect(page.getByRole('button', { name: '换掉白色T恤' })).toBeEnabled();
  expect(await state(page, 'recommendations.round')).toEqual(before); expect(await state(page, 'recommendations.settingsDraft')).toEqual(draft);
  await page.screenshot({ path: 'test-results/round09-home-normal.png', fullPage: true });
  const homeAfter = await state(page, 'home.state'); await page.reload(); await expect(page.getByRole('button', { name: '换掉白色T恤' })).toBeVisible();
  expect(await state(page, 'home.state')).toEqual(homeAfter);
  await page.getByRole('navigation').getByRole('link', { name: '穿搭推荐', exact: true }).click();
  await expect(page.getByLabel('本次穿搭要求')).toHaveValue('尚未应用的临时要求'); await expect(page.getByLabel('选择城市')).toHaveValue('北京');
  expect(await state(page, 'recommendations.round')).toEqual(before);
});

test('删除/暂停提示、衣橱数量同步、只换目标、无替代和失败保留', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('0 件衣物', { exact: true })).toBeVisible(); await seed(page);
  await page.getByRole('button', { name: '生成今日穿搭' }).click(); await expect(page.getByRole('button', { name: '换掉白色T恤' })).toBeVisible();
  await changeGarment(page, 'B1', 'delete'); await changeGarment(page, 'S1', 'pause');
  await expect(page.getByText('5 件衣物', { exact: true })).toBeVisible();
  await expect(page.getByText(/存在已删除衣物/)).toContainText('深蓝长裤'); await expect(page.getByText(/存在已暂停搭配衣物/)).toContainText('白色板鞋');
  await page.getByRole('button', { name: '换掉白色T恤' }).click(); await expect(page.getByRole('button', { name: '换掉绿色上衣' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '换掉深蓝长裤' })).toBeVisible(); await expect(page.getByText(/存在已删除衣物/)).toBeVisible();
  await page.screenshot({ path: 'test-results/round09-deleted-paused.png', fullPage: true });
  const before = await state(page, 'home.state');
  await page.route('**/api/recommendation', route => route.fulfill({ status: 503, json: { ok: false, error: { code: 'TEST_OFFLINE', message: '模拟推荐失败', retryable: true } } }));
  await page.getByRole('button', { name: '换一套', exact: true }).click(); await expect(page.locator('main [role=alert]')).toContainText('模拟推荐失败');
  expect(await state(page, 'home.state')).toEqual(before);
  await changeGarment(page, 'T1', 'delete'); await page.getByRole('button', { name: '换掉绿色上衣' }).click();
  await expect(page.locator('main [role=alert]')).toContainText('暂无合适的替代衣物'); expect(await state(page, 'home.state')).toEqual(before);
});

test('北京时间跨天仅刷新天气，后续首页更换使用新日期', async ({ page }) => {
  let weatherTime = new Date('2026-11-27T15:59:40Z').getTime();
  await page.clock.install({ time: weatherTime });
  await page.unroute('https://api.open-meteo.com/**');
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ status: 200, json: {
    current_units: { temperature_2m: '°C', apparent_temperature: '°C' },
    current: { time: Math.floor(weatherTime / 1000), temperature_2m: 20, apparent_temperature: 19, weather_code: 2 },
    daily: { temperature_2m_min: [16], temperature_2m_max: [24] }
  } }));
  await page.goto('/'); await expect(page.getByText('0 件衣物', { exact: true })).toBeVisible(); await seed(page);
  await page.getByRole('button', { name: '生成今日穿搭' }).click(); await expect(page.getByRole('button', { name: '换一套', exact: true })).toBeVisible();
  const before = await state(page, 'home.state'); weatherTime += 60000;
  await page.clock.fastForward(60000); expect(await state(page, 'home.state')).toEqual(before);
  await expect(page.getByText(/生成依据：深圳 · 11月27日天气/)).toBeVisible();
  await page.getByRole('button', { name: '换一套', exact: true }).click();
  await expect(page.getByText(/生成依据：深圳 · 11月28日天气/)).toBeVisible();
});

test('两标签页共享城市，旧天气请求晚返回不覆盖新城市', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('深圳 多云')).toBeVisible();
  const other = await page.context().newPage();
  await other.route('https://api.open-meteo.com/**', route => route.fulfill({ status: 200, json: { current_units: { temperature_2m: '°C', apparent_temperature: '°C' }, current: { time: Math.floor(Date.now()/1000), temperature_2m: 20, apparent_temperature: 19, weather_code: 2 }, daily: { temperature_2m_min: [16], temperature_2m_max: [24] } } }));
  await other.goto('/recommendations'); await expect(other.getByLabel('选择城市')).toHaveValue('深圳');
  await page.route('https://api.open-meteo.com/**', async route => {
    if (new URL(route.request().url()).searchParams.get('latitude') === '39.9042') await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ status: 200, json: { current_units: { temperature_2m: '°C', apparent_temperature: '°C' }, current: { time: Math.floor(Date.now()/1000), temperature_2m: 22, apparent_temperature: 21, weather_code: 2 }, daily: { temperature_2m_min: [18], temperature_2m_max: [25] } } }).catch(() => undefined);
  });
  await page.getByLabel('选择城市').selectOption('北京');
  await page.getByLabel('选择城市').selectOption('上海'); await expect(page.getByText('上海 多云')).toBeVisible();
  await expect(other.getByLabel('选择城市')).toHaveValue('上海');
  await expect(other.getByText('上海 多云')).toBeVisible(); await page.waitForTimeout(650);
  await expect(page.getByText('北京 多云')).toHaveCount(0); await other.close();
});

test('连续点击不重复提交，离开首页后晚响应不会写入结果', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('0 件衣物', { exact: true })).toBeVisible(); await seed(page);
  let calls = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/recommendation', async route => {
    calls++; await gate;
    await route.fulfill({ status: 200, json: { ok: true, data: { garmentIds: ['T1','B1','S1'], reason: '晚返回的测试结果', knowledgeVersion: 'V1.2' } } }).catch(() => undefined);
  });
  await page.getByRole('button', { name: '生成今日穿搭' }).click(); await expect.poll(() => calls).toBe(1);
  await expect(page.getByRole('button', { name: '生成今日穿搭' })).toBeDisabled();
  await page.getByRole('button', { name: '生成今日穿搭' }).evaluate((button: HTMLButtonElement) => button.click());
  expect(calls).toBe(1);
  await page.getByRole('navigation').getByRole('link', { name: '我的偏好', exact: true }).click();
  await expect(page).toHaveURL('/preferences'); release();
  await page.getByRole('navigation').getByRole('link', { name: '首页', exact: true }).click();
  await expect(page.getByRole('button', { name: '生成今日穿搭' })).toBeEnabled();
  expect(await state(page, 'home.state')).toBeUndefined(); expect(calls).toBe(1);
});
