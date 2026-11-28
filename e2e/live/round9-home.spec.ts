import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

async function readState(page: Page, key: string) {
  return page.evaluate(async key => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('wearwise-real-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const value = await new Promise<unknown>((resolve, reject) => { const r = db.transaction('state').objectStore('state').get(key); r.onsuccess = () => resolve(r.result?.value); r.onerror = () => reject(r.error); });
    db.close(); return value;
  }, key);
}
async function readHome(page: Page): Promise<{ id: string; garmentIds: string[]; basis: { label: string; weather: { city: string; date: string }; memory: boolean; preference: boolean; scene: string | null }; reason: string } | undefined> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('wearwise-real-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const tx = db.transaction(['state', 'results']);
    const home = await new Promise<{ currentResultId: string } | undefined>(resolve => { const r = tx.objectStore('state').get('home.state'); r.onsuccess = () => resolve(r.result?.value); });
    const result = home ? await new Promise<any>(resolve => { const r = tx.objectStore('results').get(home.currentResultId); r.onsuccess = () => resolve(r.result); }) : undefined;
    db.close(); return result;
  });
}

test('真实OpenRouter与真实天气 首页生成、整套、指定单品以及推荐页状态隔离', async ({ page }) => {
  const report: { baseSha: string; fixture: string; status: string; steps: any[]; error?: string } = {
    baseSha: '66ee8ad64397d08f88b057a4bd558153e6692e5b',
    fixture: 'isolated Chrome storage, six authored synthetic SVG garments; real AI and real Open-Meteo, no request mocking', status: 'RUNNING', steps: []
  };
  try {
    await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real'));
    await page.goto('/'); await expect(page.getByText('0 件衣物', { exact: true })).toBeVisible();
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('wearwise-real-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const now = new Date().toISOString(), snapshots: any[] = [];
      const tx = db.transaction(['garments', 'media', 'preferences', 'results', 'state'], 'readwrite');
      for (const [id, name, category, color, fill] of [
        ['T1','白色棉质T恤','top','白色','#eee'], ['T2','浅绿色短袖上衣','top','浅绿色','#91ab82'],
        ['B1','深蓝直筒长裤','bottom','深蓝色','#40516b'], ['B2','米色直筒长裤','bottom','米色','#c5b69c'],
        ['S1','白色低帮板鞋','shoes','白色','#ddd'], ['S2','棕色休闲便鞋','shoes','棕色','#9a795e']
      ]) {
        const shape = category === 'top' ? '<path d="M35 20L15 40 28 59 37 49V112H103V49L112 59 125 40 105 20 87 12Q70 30 53 12Z"/>' : category === 'bottom' ? '<path d="M38 12H103L114 119H83L70 57 57 119H27Z"/>' : '<path d="M28 66L40 39 69 57 113 69Q132 74 129 98H23Q10 84 28 66Z"/>';
        tx.objectStore('media').put({ id: `live-img-${id}`, blob: new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140"><g fill="${fill}">${shape}</g></svg>`], { type: 'image/svg+xml' }) });
        const garment = { id, name, category, color, fit: '宽松', warmth: 'medium', material: '不确定', styleTags: [], sceneTags: [], styleOther: [], sceneOther: [], description: '第9轮真实模型联调的合成测试衣物', imageId: `live-img-${id}`, sourceType: 'manual', revision: 1, createdAt: now, updatedAt: now };
        tx.objectStore('garments').put(garment);
        if (['T1','B1','S1'].includes(id)) snapshots.push({ id, name, category, color, fit: '宽松', warmth: 'medium', styleTags: [], sceneTags: [], imageId: garment.imageId });
      }
      tx.objectStore('preferences').put({ id: 'r9-live-preference', group: 'explicit', content: '喜欢低饱和、简约、舒适的搭配', state: 'active', userEdited: false, revision: 1, createdAt: now, updatedAt: now });
      const resultId = 'r9-live-recommendation-result', roundId = 'r9-live-round';
      tx.objectStore('results').put({ id: resultId, surface: 'recommendations', roundId, garmentIds: snapshots.map(s => s.id), snapshots,
        flatLay: snapshots.map((s, i) => ({ garmentId: s.id, slot: s.category, layer: i })), reason: '推荐页隔离测试保留结果',
        basis: { label: '本次喜好 · 上班', memory: false, weather: null, preference: true, scene: '上班' }, createdAt: now });
      tx.objectStore('state').put({ key: 'recommendations.round', value: { roundId, applied: { memory: false, weather: null, preference: { text: 'LIVE_RECOMMENDATION_ONLY_INPUT', imageIds: [], styleTags: [] }, scene: { selected: '上班', custom: 'LIVE_SCENE_ONLY' }, appliedAt: now }, currentResultId: resultId,
        adjustments: [], feedback: [{ id: 'r9-live-feedback', resultId, choice: 'dislike', reason: 'LIVE_FEEDBACK_ONLY', scope: 'once', order: 1, savedAt: now }], startedAt: now, revision: 1 } });
      tx.objectStore('state').put({ key: 'recommendations.settingsDraft', value: { memory: false, weather: false, preference: { enabled: true, text: 'LIVE_UNAPPLIED_DRAFT', imageIds: [], styleTags: [] }, scene: { enabled: true, selected: '上班', custom: 'LIVE_UNAPPLIED_SCENE' }, updatedAt: now } });
      tx.objectStore('state').put({ key: 'recommendations.feedbackDraft', value: { roundId, resultId, choice: 'like', reason: 'LIVE_UNSUBMITTED_FEEDBACK', scope: 'permanent', updatedAt: now } });
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
    });
    await page.reload(); await expect(page.getByText('6 件衣物', { exact: true })).toBeVisible();
    await expect(page.locator('.weather-card').getByText(/当前气温：/)).toBeVisible();
    const originalRound = await readState(page, 'recommendations.round'), originalDraft = await readState(page, 'recommendations.settingsDraft'), originalFeedbackDraft = await readState(page, 'recommendations.feedbackDraft');
    const operate = async (name: string, click: () => Promise<void>) => {
      const before = await readHome(page), started = Date.now();
      const requestPromise = page.waitForRequest(request => new URL(request.url()).pathname === '/api/recommendation', { timeout: 15000 });
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/recommendation', { timeout: 200000 });
      await click(); const request = await requestPromise, input = request.postDataJSON();
      expect(input.conditions.memory).toEqual([expect.stringContaining('低饱和')]); expect(input.conditions.weather.source).toBe('open-meteo');
      expect(input.conditions.preference).toBeUndefined(); expect(input.conditions.scene).toBeUndefined(); expect(input.conditions.feedback).toBeUndefined();
      const response = await responsePromise, body = await response.json();
      const step: any = { operation: name, durationMs: Date.now() - started, httpStatus: response.status(), apiOk: body.ok, conditions: input.conditions, aiResult: body.data ?? body.error };
      report.steps.push(step); console.log(JSON.stringify({ operation: name, httpStatus: step.httpStatus, durationMs: step.durationMs, apiOk: step.apiOk, errorCode: body.error?.code }));
      expect(body.ok, `${name}: ${body.error?.code ?? ''} ${body.error?.message ?? ''}`).toBe(true);
      await expect.poll(async () => (await readHome(page))?.id, { timeout: 15000, message: `${name} API返回后应完成校验和保存` }).not.toBe(before?.id);
      const current = (await readHome(page))!; step.savedResult = current;
      expect(await readState(page, 'recommendations.round')).toEqual(originalRound);
      expect(await readState(page, 'recommendations.settingsDraft')).toEqual(originalDraft);
      expect(await readState(page, 'recommendations.feedbackDraft')).toEqual(originalFeedbackDraft);
      expect(current.basis).toMatchObject({ memory: true, preference: false, scene: null, weather: { city: '深圳' } });
      expect(current.garmentIds.length).toBe(3); expect(current.reason.length).toBeGreaterThan(0);
      await expect(page.getByRole('button', { name: '换一套', exact: true })).toBeEnabled();
      return current;
    };
    const generated = await operate('generateHome', () => page.getByRole('button', { name: '生成今日穿搭' }).click());
    await page.screenshot({ path: 'docs/handoffs/round09-evidence/real-ai-home-generated.png', fullPage: true });
    const swapped = await operate('swapHomeOutfit', () => page.getByRole('button', { name: '换一套', exact: true }).click());
    expect([...swapped.garmentIds].sort()).not.toEqual([...generated.garmentIds].sort());
    const garmentCards = page.getByRole('region', { name: '今日穿搭' }).getByRole('button', { name: /^换掉/ });
    const single = await operate('swapHomeItem', () => garmentCards.first().click());
    expect(single.garmentIds.filter(id => !swapped.garmentIds.includes(id))).toHaveLength(1);
    expect(swapped.garmentIds.filter(id => !single.garmentIds.includes(id))).toHaveLength(1);
    await page.screenshot({ path: 'docs/handoffs/round09-evidence/real-ai-home-after-swaps.png', fullPage: true });
    await page.reload(); await expect(page.getByRole('button', { name: '换一套', exact: true })).toBeVisible();
    expect((await readHome(page))?.id).toBe(single.id); report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL'; report.error = error instanceof Error ? error.message : String(error); throw error;
  } finally {
    writeFileSync('docs/handoffs/round09-evidence/real-ai-home.json', JSON.stringify(report, null, 2));
  }
});
