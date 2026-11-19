import { test, expect } from '@playwright/test';

test('首次直接进入真实衣橱；切换示例后数据仍隔离', async ({ page, context, baseURL }) => {
  const external: string[] = [];
  const localOrigin = new URL(baseURL!).origin;
  context.on('request', request => { const url = new URL(request.url()); if (url.origin !== localOrigin) external.push(url.toString()); });
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
  await expect(page.getByRole('button', {name:'查看天气'})).toHaveCount(0);
  await page.getByRole('button', {name:'使用示例天气'}).click();
  await page.getByRole('button', {name:'生成穿搭'}).click();
  const outfit = page.locator('article').filter({hasText:'搭配 1'});
  await expect(outfit).toBeVisible();
  await outfit.getByRole('button', {name:'喜欢', exact:true}).click();
  await expect(outfit.getByRole('button', {name:'喜欢', exact:true})).toHaveAttribute('aria-pressed','true');
  await page.reload();
  await expect(page.locator('article').filter({hasText:'搭配 1'}).getByRole('button', {name:'喜欢', exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('link', {name:'我的衣橱', exact:true}).click();
  const other=await context.newPage(); await other.goto('/recommendations');
  await other.getByRole('button',{name:'使用示例天气'}).click(); await other.getByRole('button',{name:'生成穿搭'}).click();
  await expect(other.locator('article').filter({hasText:'搭配 1'})).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name:'重置示例'}).click();
  await expect(page.locator('article')).toHaveCount(8);
  await expect(other.locator('article').filter({hasText:'搭配 1'})).toHaveCount(0);
  await other.close();
  await page.getByRole('button', {name:'切换真实衣橱'}).click();
  await expect(page.getByRole('heading', {name:'真实衣物'})).toBeVisible();
  expect(external).toEqual([]);
});

test('反馈写入失败时显示错误，可重试并持久化',async({page})=>{
  await page.addInitScript(()=>{
    const original=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,key) {
      const state=window as unknown as {failNextFeedback?:boolean};
      if(this.name==='feedback' && state.failNextFeedback) {state.failNextFeedback=false;throw new DOMException('injected feedback failure','QuotaExceededError');}
      return original.call(this,value,key);
    };
  });
  await page.goto('/');await page.getByRole('button',{name:'切换示例模式'}).click();
  await page.getByRole('link',{name:'穿搭推荐',exact:true}).click();await expect(page.getByRole('heading',{name:'穿搭推荐.'})).toBeVisible();await page.getByRole('button',{name:'使用示例天气'}).click();await page.getByRole('button',{name:'生成穿搭'}).click();
  const outfit=page.locator('article').filter({hasText:'搭配 1'});await expect(outfit).toBeVisible();
  await page.evaluate(()=>{(window as unknown as {failNextFeedback:boolean}).failNextFeedback=true;});
  await outfit.getByRole('button',{name:'喜欢',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'反馈保存失败'})).toBeVisible();
  await expect(outfit.getByRole('button',{name:'喜欢',exact:true})).toHaveAttribute('aria-pressed','false');
  await outfit.getByRole('button',{name:'喜欢',exact:true}).click();await expect(outfit.getByRole('button',{name:'喜欢',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('alert').filter({hasText:'反馈保存失败'})).toHaveCount(0);
  await page.reload();await expect(page.locator('article').filter({hasText:'搭配 1'}).getByRole('button',{name:'喜欢',exact:true})).toHaveAttribute('aria-pressed','true');
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
