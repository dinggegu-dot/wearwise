import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
test.describe.configure({ timeout: 120000 });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wearwise-mode','real'));
  await page.route('**/api/capabilities', route => route.fulfill({ json: { recognition: { available: false } } }));
});
async function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve,reject) => { const r=indexedDB.open('wearwise-real-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); });
    const result = await new Promise<{ garments: Array<Record<string,unknown>>; media: number }>((resolve,reject) => {
      const tx=db.transaction(['garments','media'],'readonly'),g=tx.objectStore('garments').getAll(),m=tx.objectStore('media').count();tx.oncomplete=()=>resolve({garments:g.result,media:m.result});tx.onerror=()=>reject(tx.error);
    }); db.close();return result;
  });
}
test('R5-01/03 五类计数、V1.2多选、其他说明、详情与刷新持久化', async ({ page }) => {
  await page.goto('/wardrobe');
  await expect(page.getByRole('button',{name:'全部',exact:true})).toHaveText('全部 0');
  for (const [category,label] of [['top','上衣'],['bottom','下装'],['outerwear','外套'],['dress','连衣裙'],['shoes','鞋履']]) {
    await page.getByRole('button',{name:label,exact:true}).click(); await page.getByRole('button',{name:'＋ 添加衣物'}).click();
    await expect(page.getByLabel('类别')).toHaveValue(category);
    await page.getByLabel('名称').fill(label === '外套' ? '米白针织开衫' : `我的${label}`);
    const styles=page.getByRole('group',{name:'风格标签 可多选'}),scenes=page.getByRole('group',{name:'场景标签 可多选'});
    await expect(styles.getByRole('checkbox')).toHaveCount(10); await expect(scenes.getByRole('checkbox')).toHaveCount(7);
    await styles.getByRole('checkbox',{name:'简约风',exact:true}).check(); await styles.getByRole('checkbox',{name:'学院风',exact:true}).check();
    await scenes.getByRole('checkbox',{name:'学习',exact:true}).check(); await scenes.getByRole('checkbox',{name:'上班',exact:true}).check();
    if (category === 'outerwear') {
      await styles.getByRole('checkbox',{name:'其他',exact:true}).check(); await page.getByRole('button',{name:'确认保存'}).click();
      await expect(page.getByRole('alert').filter({hasText:'填写对应说明'})).toBeVisible(); await page.getByLabel('风格其他说明（每行一条）').fill('Y2K');
    }
    await page.getByRole('button',{name:'确认保存'}).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button',{name:label,exact:true})).toHaveText(`${label} 1`);
  }
  await page.getByRole('button',{name:'全部',exact:true}).click(); await expect(page.getByRole('button',{name:'全部',exact:true})).toHaveText('全部 5');
  const cardigan=page.locator('.wardrobe-grid article').filter({hasText:'米白针织开衫'});
  await cardigan.getByRole('button',{name:'查看详情'}).click(); const detail=page.getByRole('dialog',{name:'衣物详情'});
  await expect(detail.getByText('外套',{exact:true})).toBeVisible();await expect(detail.getByText('其他：Y2K')).toBeVisible();await expect(detail.getByText('学习',{exact:true})).toBeVisible();
  await expect(detail.getByText('上传原图')).toHaveCount(0);await page.getByRole('button',{name:'编辑衣物',exact:true}).click();
  await page.getByLabel('名称').fill('取消改名');await page.getByRole('button',{name:'取消',exact:true}).click();await expect(cardigan).toBeVisible();
  await page.reload();const data=await stored(page);expect(data.garments).toHaveLength(5);expect(data.media).toBe(5);
  expect(data.garments.find(g=>g.name==='米白针织开衫')).toMatchObject({category:'outerwear',styleTags:['简约风','学院风','其他'],styleOther:['Y2K'],sceneTags:['学习','上班'],sceneOther:[]});
});

test('R5-04/05 批量混合状态、独立编辑、部分保存故障重试与完成', async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => {
    const add=IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add=function(value,key) { const w=window as unknown as {failRound5?:boolean};if(this.name==='garments'&&w.failRound5){w.failRound5=false;throw new DOMException('Round5 test quota','QuotaExceededError');}return add.call(this,value,key); };
  });
  await page.route('**/api/capabilities',route=>route.fulfill({json:{recognition:{available:true}}}));
  let count=0, release!:()=>void; const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/recognition',async route=>{ const index=++count;if(index===2)await gate;await route.fulfill({json:{ok:true,data:{candidate:{candidateId:crypto.randomUUID(),name:`批量衣物${index}`,category:'top',color:'红色',fit:'宽松',warmth:'medium',material:'不确定',styleTags:['Minimalist Style'],description:'模拟AI候选，真实本机白底图',warnings:[]}}}}).catch(()=>{}); });
  await page.goto('/wardrobe');await page.getByRole('button',{name:'批量添加',exact:true}).click();
  const sample=path.resolve('tests/fixtures/synthetic-shirt.jpg');
  const payload = {name:'synthetic-shirt.jpg',mimeType:'image/jpeg',buffer:readFileSync(sample)};
  await page.getByLabel('选择多张照片').setInputFiles([payload,{name:'bad.jpg',mimeType:'image/jpeg',buffer:Buffer.from('not an image')},payload]);
  const rows=page.locator('.batch-row');await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).getByRole('status')).toHaveText('处理成功',{timeout:90000});await expect(rows.nth(1).getByRole('status')).toHaveText('处理失败');await expect(rows.nth(2).getByRole('status')).toHaveText('处理中');
  await expect(rows.nth(1).getByRole('checkbox')).toBeDisabled();await expect(rows.nth(2).getByRole('checkbox')).toBeDisabled();
  await rows.nth(0).getByRole('button',{name:'编辑',exact:true}).click();await page.getByLabel('名称',{exact:true}).fill('批量确认上衣');await page.getByRole('checkbox',{name:'学习',exact:true}).check();await page.getByRole('button',{name:'完成检查'}).click();
  await rows.nth(0).getByRole('checkbox').check();await page.evaluate(()=>{(window as unknown as {failRound5:boolean}).failRound5=true;});
  await page.getByRole('button',{name:'保存所选衣物'}).click();await expect(rows.nth(0).getByRole('alert')).toContainText('保存失败');expect((await stored(page)).garments).toHaveLength(0);
  await page.getByRole('button',{name:'保存所选衣物'}).evaluate((b:HTMLButtonElement)=>{b.click();b.click();});
  await expect(rows.nth(0).getByRole('status')).toHaveText('已加入衣橱');await expect(page.getByText('已选0件 · 已保存1件，其余项目继续保留')).toBeVisible();
  expect((await stored(page)).garments).toHaveLength(1);await expect(rows.nth(0).getByRole('checkbox')).toBeDisabled();
  await page.setViewportSize({width:1536,height:1024});
  await page.getByRole('dialog').evaluate(dialog=>{dialog.scrollTop=0;});
  expect(await rows.first().locator('.wardrobe-image').evaluate(image=>image.getBoundingClientRect().height)).toBeLessThanOrEqual(100);
  await expect(page.getByRole('heading',{name:'批量添加衣物',exact:true})).toBeInViewport();
  await expect(page.getByRole('button',{name:'完成',exact:true})).toBeInViewport();
  await page.screenshot({path:'test-results/round5/batch-partial-desktop.png',fullPage:true});
  release();await expect(rows.nth(2).getByRole('status')).toHaveText('处理成功',{timeout:90000});
  await rows.nth(2).getByRole('checkbox').check();await page.getByRole('button',{name:'保存所选衣物'}).click();await expect(rows.nth(2).getByRole('status')).toHaveText('已加入衣橱');
  await rows.nth(1).getByRole('button',{name:'重试',exact:true}).click();await expect(rows.nth(1).getByRole('status')).toHaveText('处理失败');await rows.nth(1).getByRole('button',{name:'移除',exact:true}).click();
  await page.getByRole('button',{name:'完成',exact:true}).click();await page.reload();const data=await stored(page);expect(data.garments).toHaveLength(2);expect(data.media).toBe(2);expect(new Set(data.garments.map(g=>g.id)).size).toBe(2);
  expect(data.garments.find(g=>g.name==='批量确认上衣')).toMatchObject({styleTags:['简约风'],sceneTags:['学习']});
});

test('R5-09 文件选择取消、弹窗关闭与Object URL释放',async({page})=>{
  await page.addInitScript(()=>{const make=URL.createObjectURL.bind(URL),drop=URL.revokeObjectURL.bind(URL),urls=new Set<string>();(window as unknown as {round5Urls:Set<string>}).round5Urls=urls;URL.createObjectURL=value=>{const url=make(value);urls.add(url);return url;};URL.revokeObjectURL=url=>{urls.delete(url);drop(url);};});
  await page.route('**/models/birefnet/model_fp16.onnx',route=>route.fulfill({status:503,body:'test unavailable'}));
  await page.goto('/wardrobe');await page.getByRole('button',{name:'＋ 添加衣物'}).click();await page.getByLabel('名称').fill('保留草稿');
  await page.getByLabel('衣物照片（可选）').setInputFiles(path.resolve('tests/fixtures/synthetic-shirt.jpg'));await expect(page.getByRole('alert').filter({hasText:'白底处理失败'})).toBeVisible();
  await page.getByLabel('衣物照片（可选）').dispatchEvent('cancel');await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('名称')).toHaveValue('保留草稿');
  await page.getByRole('button',{name:'取消',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as unknown as {round5Urls:Set<string>}).round5Urls.size)).toBe(0);expect((await stored(page)).garments).toHaveLength(0);
});

test('R5-06 换图失败和取消保留旧记录，保存故障保留新草稿供重试',async({page})=>{
  await page.addInitScript(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){const w=window as unknown as {failRound5Update?:boolean};if(this.name==='garments'&&w.failRound5Update){w.failRound5Update=false;throw new DOMException('injected update quota','QuotaExceededError');}return put.call(this,value,key);};});
  await page.goto('/wardrobe');await page.getByRole('button',{name:'＋ 添加衣物'}).click();await page.getByLabel('名称').fill('保护原衣物');await page.getByRole('checkbox',{name:'学院风',exact:true}).check();await page.getByRole('button',{name:'确认保存'}).click();
  const old=(await stored(page)).garments[0];const card=page.locator('.wardrobe-grid article').filter({hasText:'保护原衣物'});
  const unavailable=(route:import('@playwright/test').Route)=>route.fulfill({status:503,body:'test model missing'});
  await page.route('**/models/birefnet/model_fp16.onnx',unavailable);await card.getByRole('button',{name:'编辑',exact:true}).click();
  const sample=path.resolve('tests/fixtures/synthetic-shirt.jpg');await page.getByLabel('衣物照片（可选）').setInputFiles(sample);await expect(page.getByRole('alert').filter({hasText:'白底处理失败'})).toBeVisible();await expect(page.getByRole('button',{name:'确认保存'})).toBeDisabled();expect((await stored(page)).garments[0]).toEqual(old);
  await page.getByRole('button',{name:'取消',exact:true}).click();expect((await stored(page)).garments[0]).toEqual(old);
  await page.unroute('**/models/birefnet/model_fp16.onnx',unavailable);await card.getByRole('button',{name:'编辑',exact:true}).click();await page.getByLabel('衣物照片（可选）').setInputFiles(sample);await expect(page.getByAltText('照片预览')).toBeVisible({timeout:90000});await page.getByRole('button',{name:'改为手动填写并确认'}).click();await page.getByLabel('名称').fill('确认新图片');
  await page.evaluate(()=>{(window as unknown as {failRound5Update:boolean}).failRound5Update=true;});await page.getByRole('button',{name:'确认保存'}).click();await expect(page.getByRole('alert').filter({hasText:'保存失败'})).toBeVisible();await expect(page.getByLabel('名称')).toHaveValue('确认新图片');expect((await stored(page)).garments[0]).toEqual(old);expect((await stored(page)).media).toBe(1);
  await page.getByRole('button',{name:'确认保存'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.reload();const after=await stored(page);expect(after.garments[0]).toMatchObject({name:'确认新图片',styleTags:['学院风']});expect(after.garments[0].imageId).not.toBe(old.imageId);expect(after.media).toBe(1);
});

test('R5-12 桌面和移动端视觉证据及弹窗无横向溢出',async({page})=>{
  await page.goto('/wardrobe');await page.getByRole('button',{name:'切换示例模式'}).click();await expect(page.locator('.wardrobe-grid article')).toHaveCount(8);
  await page.setViewportSize({width:1536,height:1024});await page.screenshot({path:'test-results/round5/wardrobe-desktop.png',fullPage:true});
  await page.locator('.wardrobe-grid article').first().getByRole('button',{name:'查看详情'}).click();await page.screenshot({path:'test-results/round5/detail-desktop.png',fullPage:true});await page.getByRole('button',{name:'编辑衣物',exact:true}).click();await page.screenshot({path:'test-results/round5/editor-desktop.png',fullPage:true});
  for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await page.screenshot({path:`test-results/round5/editor-mobile-${width}.png`,fullPage:true});}
  await page.getByRole('button',{name:'取消',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/round5/wardrobe-mobile.png',fullPage:true});
});
