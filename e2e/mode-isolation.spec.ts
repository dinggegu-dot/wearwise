import { mockRecommendation } from './helpers/recommendation';
import { test, expect } from '@playwright/test';

test('首次直接进入真实衣橱；切换示例后数据仍隔离', async ({ page, context }) => {
  const cityCalls: string[] = [];
  await context.route('https://api.open-meteo.com/**', route => {
    cityCalls.push(route.request().url());
    return route.fulfill({ status: 503 });
  });
  await mockRecommendation(page);
  await page.goto('/');
  await expect(page.getByText('真实衣橱 · 仅本浏览器保存')).toBeVisible();
  await expect(page.getByRole('heading', {name:'欢迎使用 WearWise'})).toHaveCount(0);
  await page.getByRole('link', {name:'我的衣橱', exact:true}).click();
  await page.getByRole('button', {name:'＋ 添加衣物'}).click();
  await page.getByLabel('名称').fill('真实衣物'); await page.getByLabel('颜色').fill('黑色');
  await page.getByRole('button', {name:'确认保存'}).click();
  await expect(page.getByRole('heading', {name:'真实衣物'})).toBeVisible();
  await page.getByRole('button', {name:'切换示例模式'}).click();
  await expect(page.getByText('示例模式 · 示例数据')).toBeVisible();
  await expect(page.locator('article')).toHaveCount(8);
  await expect(page.getByText('真实衣物')).toHaveCount(0);
  await page.getByRole('link', {name:'穿搭推荐', exact:true}).click();
  await expect(page.getByText(/示例天气 · 深圳/)).toBeVisible();
  const weatherCalls = cityCalls.length;
  await page.getByRole('checkbox', { name: '天气', exact: true }).uncheck();
  await page.getByRole('button', {name:'生成穿搭'}).click();
  const outfit = page.locator('article').filter({hasText:'当前穿搭'});
  await expect(outfit).toBeVisible();
  await outfit.getByRole('button', {name:'♡ 喜欢', exact:true}).click();
  await page.getByRole('button', { name: '提交反馈' }).click();
  await page.getByRole('button', { name: '暂时不换，返回' }).click();
  await page.reload();
  await expect(outfit).toBeVisible();
  expect(cityCalls).toHaveLength(weatherCalls);
  await page.getByRole('link', {name:'我的衣橱', exact:true}).click();
  const other=await context.newPage();
  await mockRecommendation(other);
  await other.goto('/recommendations');
  await expect(other.locator('article').filter({hasText:'当前穿搭'})).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name:'重置示例'}).click();
  await expect(page.locator('article')).toHaveCount(8);
  await other.reload();
  await expect(other.locator('article').filter({hasText:'当前穿搭'})).toHaveCount(0);
  await other.close();
  await page.getByRole('button', {name:'切换真实衣橱'}).click();
  await expect(page.getByRole('heading', {name:'真实衣物'})).toBeVisible();

});

test('反馈写入失败时显示错误，可重试并持久化',async({page})=>{
  await page.addInitScript(()=>{
    const original=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,key) {
      const state=window as unknown as {failNextFeedback?:boolean};
      if(this.name==='state' && key === undefined && (value as { key?: string }).key === 'recommendations.round' && state.failNextFeedback) {state.failNextFeedback=false;throw new DOMException('injected feedback failure','QuotaExceededError');}
      return original.call(this,value,key);
    };
  });
  await mockRecommendation(page);
  await page.goto('/');
  await page.getByRole('button', { name: '切换示例模式' }).click();
  await page.getByRole('navigation').getByRole('link', { name: '穿搭推荐', exact: true }).click();
  await page.getByRole('checkbox', { name: '天气', exact: true }).uncheck();
  await page.getByRole('button', { name: '生成穿搭' }).click();
  const outfit=page.locator('article').filter({hasText:'当前穿搭'});await expect(outfit).toBeVisible();
  await page.evaluate(()=>{(window as unknown as {failNextFeedback:boolean}).failNextFeedback=true;});
  await outfit.getByRole('button', { name: '♡ 喜欢' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('颜色搭配好');
  const submit = dialog.getByRole('button', { name: '提交反馈' });
  await submit.click();
  await expect(dialog.getByRole('alert')).toContainText('反馈保存失败');
  await expect(dialog.getByRole('textbox')).toHaveValue('颜色搭配好');
  await submit.click();
  await page.getByRole('button', { name: '暂时不换，返回' }).click();
  await page.reload();
  const readSaved = () => page.evaluate(async () => {
    const open = indexedDB.open('wearwise-demo-v1');
    const db = await new Promise<IDBDatabase>(resolve => { open.onsuccess = () => resolve(open.result); });
    try {
      const request = db.transaction('state').objectStore('state').get('recommendations.round');
      return await new Promise(resolve => { request.onsuccess = () => resolve(request.result?.value.feedback); });
    } finally { db.close(); }
  });
  await expect.poll(readSaved).toEqual([expect.objectContaining({ choice: 'like', reason: '颜色搭配好' })]);
});

test('示例初始化失败不留下半库，重试后完整恢复八件',async({page})=>{
  await page.addInitScript(()=>{
    const original=IDBObjectStore.prototype.add;
    (window as unknown as {failSeed:boolean}).failSeed=true;
    IDBObjectStore.prototype.add=function(value,key) {
      const state=window as unknown as {failSeed:boolean};
      if(this.name==='garments' && state.failSeed) {state.failSeed=false;throw new DOMException('injected seed failure','QuotaExceededError');}
      return original.call(this,value,key);
    };
  });
  await page.goto('/');await page.getByRole('button',{name:'切换示例模式'}).click();
  await expect(page.getByRole('alert').filter({hasText:'示例衣橱准备失败'})).toBeVisible();
  const counts=await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('wearwise-demo-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const result=await new Promise<number[]>((resolve,reject)=>{const tx=db.transaction(['garments','media'],'readonly');const garments=tx.objectStore('garments').count(),media=tx.objectStore('media').count();tx.oncomplete=()=>resolve([garments.result,media.result]);tx.onerror=()=>reject(tx.error);});db.close();return result;
  });
  expect(counts).toEqual([0,0]);
  await page.getByRole('button',{name:'切换示例模式'}).click();await expect(page.getByText('示例模式 · 示例数据')).toBeVisible();
  await page.getByRole('link',{name:'我的衣橱',exact:true}).click();await expect(page.locator('article')).toHaveCount(8);
});
