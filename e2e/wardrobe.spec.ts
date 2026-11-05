import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real')); });

test('真实衣橱：取消、添加、刷新、编辑、筛选、排除和删除', async ({ page }) => {
  await page.goto('/wardrobe');
  await page.getByRole('button', { name: '＋ 添加衣物' }).click();
  await page.getByLabel('名称').fill('取消的衣服');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByText('取消的衣服')).toHaveCount(0);
  await page.getByRole('button', { name: '＋ 添加衣物' }).click();
  await page.getByLabel('名称').fill('我的白衬衫');
  await page.getByLabel('颜色').fill('白色');
  await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.getByRole('heading', { name: '我的白衬衫' })).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:'衣物已保存'})).toBeVisible();
  await page.reload();
  const card = page.locator('article').filter({ hasText: '我的白衬衫' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '编辑' }).click();
  await page.getByLabel('名称').fill('我的衬衫');
  await page.getByRole('button', { name: '确认保存' }).click();
  const updated = page.locator('article').filter({ hasText: '我的衬衫' });
  await expect(updated).toBeVisible();
  await updated.getByRole('button', { name: '排除推荐' }).click();
  await expect(updated.getByText('已排除穿搭推荐')).toBeVisible();
  await page.getByRole('button', { name: '下装', exact: true }).click();
  await expect(updated).toHaveCount(0);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await updated.getByRole('button', { name: '删除' }).click();
  await expect(updated).toHaveCount(0);
});

test('照片在确认前不入库，保存后刷新仍可读取', async ({ page }) => {
  await page.goto('/wardrobe');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 20; canvas.height = 10;
    const context = canvas.getContext('2d')!; context.fillStyle = 'red'; context.fillRect(0, 0, 20, 10);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const file = { name: '衣服.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
  await page.getByRole('button', { name: '＋ 添加衣物' }).click();
  await page.getByLabel('衣物照片（可选）').setInputFiles(file);
  await expect(page.getByAltText('照片预览')).toBeVisible();
  await page.getByRole('button', { name: 'AI 识别衣物' }).click();
  await expect(page.getByRole('alert').filter({hasText:'图片识别暂未配置'})).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(0);
  await page.getByRole('button', { name: '＋ 添加衣物' }).click();
  await page.getByLabel('名称').fill('照片上衣');
  await page.getByLabel('颜色').fill('红色');
  await page.getByLabel('衣物照片（可选）').setInputFiles(file);
  await expect(page.getByAltText('照片预览')).toBeVisible();
  await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.locator('article img')).toBeVisible();
  await page.reload();
  await expect(page.locator('article img')).toBeVisible();
  expect(await page.locator('article img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(20);
});

test('浏览器正确处理带 EXIF 旋转的 JPEG', async ({page}) => {
  await page.goto('/wardrobe');
  const jpeg = await page.evaluate(() => {
    const canvas=document.createElement('canvas');canvas.width=40;canvas.height=20;
    const context=canvas.getContext('2d')!;context.fillStyle='red';context.fillRect(0,0,40,20);
    return canvas.toDataURL('image/jpeg').split(',')[1];
  });
  const original=Buffer.from(jpeg,'base64');
  const exif=Buffer.from('ffe100224578696600004d4d002a00000008000101120003000000010006000000000000','hex');
  const oriented=Buffer.concat([original.subarray(0,2),exif,original.subarray(2)]);
  await page.getByRole('button',{name:'＋ 添加衣物'}).click();
  await page.getByLabel('名称').fill('旋转照片');await page.getByLabel('颜色').fill('红色');
  await page.getByLabel('衣物照片（可选）').setInputFiles({name:'rotated.jpg',mimeType:'image/jpeg',buffer:oriented});
  const preview=page.getByAltText('照片预览');await expect(preview).toBeVisible();
  expect(await preview.evaluate((image:HTMLImageElement)=>[image.naturalWidth,image.naturalHeight])).toEqual([20,40]);
  await page.getByRole('button',{name:'确认保存'}).click();await expect(page.getByRole('heading',{name:'旋转照片'})).toBeVisible();
  await page.reload();expect(await page.locator('article img').evaluate((image:HTMLImageElement)=>[image.naturalWidth,image.naturalHeight])).toEqual([20,40]);
});

test('大图缩放、静态 WebP 及无效文件提示', async ({page}) => {
  await page.goto('/wardrobe'); await page.getByRole('button',{name:'＋ 添加衣物'}).click();
  const images=await page.evaluate(()=>{ const c=document.createElement('canvas');c.width=2000;c.height=800;const x=c.getContext('2d')!;x.fillStyle='blue';x.fillRect(0,0,2000,800);return {png:c.toDataURL('image/png').split(',')[1],webp:c.toDataURL('image/webp').split(',')[1]}; });
  await page.getByLabel('衣物照片（可选）').setInputFiles({name:'fake.jpg',mimeType:'image/jpeg',buffer:Buffer.from(images.png,'base64')});
  await expect(page.getByRole('alert').filter({hasText:'图片损坏或格式不受支持'})).toBeVisible();
  await page.getByLabel('衣物照片（可选）').setInputFiles({name:'wide.png',mimeType:'image/png',buffer:Buffer.from(images.png,'base64')});
  let preview=page.getByAltText('照片预览');await expect(preview).toBeVisible();
  expect(await preview.evaluate((image:HTMLImageElement)=>[image.naturalWidth,image.naturalHeight])).toEqual([1600,640]);
  await page.getByLabel('衣物照片（可选）').setInputFiles({name:'wide.webp',mimeType:'image/webp',buffer:Buffer.from(images.webp,'base64')});
  preview=page.getByAltText('照片预览');await expect(preview).toBeVisible();
  await expect.poll(()=>preview.evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBe(1600);
});

test('图片编码失败时提示错误，不产生衣物', async ({page}) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.toBlob = function(callback) { callback(null); }; });
  await page.goto('/wardrobe'); await page.getByRole('button',{name:'＋ 添加衣物'}).click();
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=5;canvas.height=5;return canvas.toDataURL('image/png').split(',')[1];});
  await page.getByLabel('衣物照片（可选）').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(page.getByRole('alert').filter({hasText:'图片转换失败'})).toBeVisible();
  await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.locator('article')).toHaveCount(0);
});

test('键盘可打开和取消衣物表单并返回原焦点', async ({page}) => {
  await page.goto('/wardrobe');const trigger=page.getByRole('button',{name:'＋ 添加衣物'});
  await trigger.focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('名称')).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(trigger).toBeFocused();
});

test('10 MiB 透明 PNG 可处理，超限拒绝且临时图片 URL 回收', async ({page}) => {
  await page.addInitScript(() => {
    const created = URL.createObjectURL.bind(URL), revoked = URL.revokeObjectURL.bind(URL);
    const active = new Set<string>();
    (window as unknown as {testActiveUrls: Set<string>}).testActiveUrls = active;
    URL.createObjectURL = value => { const url=created(value); active.add(url); return url; };
    URL.revokeObjectURL = url => { active.delete(url); revoked(url); };
  });
  await page.goto('/wardrobe');
  const png = Buffer.from(await page.evaluate(() => {
    const canvas=document.createElement('canvas'); canvas.width=8; canvas.height=8;
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  const exact = Buffer.alloc(10*1024*1024); png.copy(exact);
  await page.getByRole('button',{name:'＋ 添加衣物'}).click();
  await page.getByLabel('衣物照片（可选）').setInputFiles({name:'transparent.png',mimeType:'image/png',buffer:exact});
  const preview=page.getByAltText('照片预览'); await expect(preview).toBeVisible();
  const pixel=await preview.evaluate((img:HTMLImageElement)=>{
    const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;
    const context=canvas.getContext('2d')!;context.drawImage(img,0,0,1,1);
    return [...context.getImageData(0,0,1,1).data];
  });
  expect(pixel[0]).toBeGreaterThan(235); expect(pixel[1]).toBeGreaterThan(225); expect(pixel[2]).toBeGreaterThan(215); expect(pixel[3]).toBe(255);
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {testActiveUrls: Set<string>}).testActiveUrls.size)).toBe(0);
  await page.getByRole('button',{name:'＋ 添加衣物'}).click();
  await page.getByLabel('衣物照片（可选）').setInputFiles({name:'too-large.png',mimeType:'image/png',buffer:Buffer.alloc(10*1024*1024+1)});
  await expect(page.getByRole('alert').filter({hasText:'图片大小须在 10 MB 以内'})).toBeVisible();
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {testActiveUrls: Set<string>}).testActiveUrls.size)).toBe(0);
});

test('查看详情、替换照片及首页数量随添加删除变化',async({page})=>{
  await page.goto('/'); await expect(page.getByText('衣橱中有 0 件衣物')).toBeVisible();
  await page.getByRole('link',{name:'我的衣橱',exact:true}).click();
  const photos=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;const context=canvas.getContext('2d')!;
    context.fillStyle='red';context.fillRect(0,0,8,8);const red=canvas.toDataURL('image/png').split(',')[1];
    context.fillStyle='blue';context.fillRect(0,0,8,8);return {red,blue:canvas.toDataURL('image/png').split(',')[1]};
  });
  await page.getByRole('button',{name:'＋ 添加衣物'}).click();
  await page.getByLabel('名称').fill('可换照片'); await page.getByLabel('颜色').fill('红');
  await page.getByLabel('风格标签（用逗号分隔）').fill('休闲');await page.getByLabel('材质（可选）').fill('棉');
  await page.getByLabel('衣物照片（可选）').setInputFiles({name:'red.png',mimeType:'image/png',buffer:Buffer.from(photos.red,'base64')});
  await expect(page.getByAltText('照片预览')).toBeVisible();await page.getByRole('button',{name:'确认保存'}).click();
  let card=page.locator('article').filter({hasText:'可换照片'});await expect(card).toBeVisible();
  await card.getByText('查看详情').click();await expect(card.getByText('风格：休闲')).toBeVisible();await expect(card.getByText('材质：棉')).toBeVisible();
  await card.getByRole('button',{name:'编辑'}).click();
  await page.getByLabel('材质（可选）').fill('亚麻');
  await page.getByLabel('衣物照片（可选）').setInputFiles({name:'blue.png',mimeType:'image/png',buffer:Buffer.from(photos.blue,'base64')});
  await expect(page.getByAltText('照片预览')).toBeVisible();await page.getByRole('button',{name:'确认保存'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);await page.reload();
  card=page.locator('article').filter({hasText:'可换照片'});await card.getByText('查看详情').click();await expect(card.getByText('材质：亚麻')).toBeVisible();const image=card.locator('img');await expect(image).toBeVisible();
  const pixel=await image.evaluate((img:HTMLImageElement)=>{const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const context=canvas.getContext('2d')!;context.drawImage(img,0,0,1,1);return [...context.getImageData(0,0,1,1).data];});
  expect(pixel[2]).toBeGreaterThan(200);expect(pixel[0]).toBeLessThan(30);
  await page.getByRole('link',{name:'首页',exact:true}).click();await expect(page.getByText('衣橱中有 1 件衣物')).toBeVisible();
  await page.getByRole('link',{name:'我的衣橱',exact:true}).click();
  card=page.locator('article').filter({hasText:'可换照片'});page.once('dialog',dialog=>dialog.accept());await card.getByRole('button',{name:'删除'}).click();await expect(card).toHaveCount(0);
  await page.getByRole('link',{name:'首页',exact:true}).click();await expect(page.getByText('衣橱中有 0 件衣物')).toBeVisible();
});

test('衣橱写入故障时保留草稿，无孤立图且可重试',async({page})=>{
  await page.addInitScript(()=>{
    const original=IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add=function(value, key) {
      const state=window as unknown as {failNextGarmentWrite?:boolean};
      if(this.name==='garments' && state.failNextGarmentWrite) {state.failNextGarmentWrite=false;throw new DOMException('injected failure','QuotaExceededError');}
      return original.call(this,value,key);
    };
  });
  await page.goto('/wardrobe');await page.getByRole('button',{name:'＋ 添加衣物'}).click();
  await page.getByLabel('名称').fill('故障后恢复');await page.getByLabel('颜色').fill('白');
  await page.evaluate(()=>{(window as unknown as {failNextGarmentWrite:boolean}).failNextGarmentWrite=true;});
  await page.getByRole('button',{name:'确认保存'}).click();
  await expect(page.getByRole('dialog',{name:'添加衣物'})).toBeVisible();await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('dialog form')).toHaveAttribute('aria-describedby','wardrobe-form-error');
  await expect(page.getByLabel('名称')).toHaveValue('故障后恢复');
  const dbCounts=()=>page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('wearwise-real-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const result=await new Promise<number[]>((resolve,reject)=>{const transaction=db.transaction(['garments','media'],'readonly');const a=transaction.objectStore('garments').count();const b=transaction.objectStore('media').count();transaction.oncomplete=()=>resolve([a.result,b.result]);transaction.onerror=()=>reject(transaction.error);});db.close();return result;
  });
  expect(await dbCounts()).toEqual([0,0]);
  await page.getByRole('button',{name:'确认保存'}).click();await expect(page.getByRole('heading',{name:'故障后恢复'})).toBeVisible();
  expect(await dbCounts()).toEqual([1,1]);
});

test('模拟识别候选可修改材质并确认后保存',async({page})=>{
  await page.route('**/api/capabilities',route=>route.fulfill({status:200,json:{recognition:{available:true}}}));
  await page.route('**/api/recognition',route=>route.fulfill({status:200,json:{ok:true,data:{candidate:{candidateId:'8f68ab7e-2c2b-4ed5-a705-e88fd76ddbc3',name:'模型上衣',category:'top',color:'白',warmth:'unknown',material:'棉',styleTags:['日常'],warnings:[]}}}}));
  await page.goto('/wardrobe');await page.getByRole('button',{name:'＋ 添加衣物'}).click();
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;return canvas.toDataURL('image/png').split(',')[1];});
  await page.getByLabel('衣物照片（可选）').setInputFiles({name:'candidate.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(page.getByAltText('照片预览')).toBeVisible();await page.getByRole('button',{name:'AI 识别衣物'}).click();
  await expect(page.getByLabel('名称')).toHaveValue('模型上衣');await expect(page.getByLabel('材质（可选）')).toHaveValue('棉');
  await expect(page.locator('article')).toHaveCount(0);
  await page.getByLabel('名称').fill('确认的上衣');await page.getByLabel('材质（可选）').fill('亚麻');
  await page.getByRole('button',{name:'确认保存'}).click();const item=page.locator('article').filter({hasText:'确认的上衣'});await expect(item).toBeVisible();
  await item.getByText('查看详情').click();await expect(item.getByText('材质：亚麻')).toBeVisible();
});

test('切换模式会取消在途识别，晚返回候选不会写入衣橱',async({page})=>{
  let started!:()=>void,release!:()=>void;
  const seen=new Promise<void>(resolve=>{started=resolve;});const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/capabilities',route=>route.fulfill({status:200,json:{recognition:{available:true}}}));
  await page.route('**/api/recognition',async route=>{started();await gate;await route.fulfill({status:200,json:{ok:true,data:{candidate:{candidateId:'8f68ab7e-2c2b-4ed5-a705-e88fd76ddbc3',name:'晚到候选',category:'top',color:'白',warmth:'unknown',styleTags:[],warnings:[]}}}}).catch(()=>{});});
  await page.goto('/wardrobe');await page.getByRole('button',{name:'＋ 添加衣物'}).click();
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;return canvas.toDataURL('image/png').split(',')[1];});
  await page.getByLabel('衣物照片（可选）').setInputFiles({name:'candidate.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(page.getByAltText('照片预览')).toBeVisible();await page.getByRole('button',{name:'AI 识别衣物'}).click();await seen;
  const aborted=page.waitForEvent('requestfailed',{predicate:request=>request.url().endsWith('/api/recognition')});
  await page.getByRole('button',{name:'切换示例模式'}).evaluate((button:HTMLButtonElement)=>button.click());
  await expect(page.getByText('示例模式 · 示例数据')).toBeVisible();await aborted;release();
  await page.getByRole('button',{name:'切换真实衣橱'}).click();await expect(page.getByText('晚到候选')).toHaveCount(0);await expect(page.locator('article')).toHaveCount(0);
});

test('读取衣橱失败不显示空衣橱，重试后才显示真实空态',async({page})=>{
  await page.addInitScript(()=>{
    const proto=IDBObjectStore.prototype;
    const getAll=proto.getAll,openCursor=proto.openCursor;
    const fail=(store:IDBObjectStore)=>{const state=window as unknown as {allowReads?:boolean};if(store.name==='garments'&&!state.allowReads){throw new DOMException('injected read failure','UnknownError');}};
    proto.getAll=function(query,count){fail(this);return getAll.call(this,query,count);};
    proto.openCursor=function(query,direction){fail(this);return openCursor.call(this,query,direction);};
  });
  await page.goto('/wardrobe');await expect(page.getByRole('alert').filter({hasText:'无法读取衣橱'})).toBeVisible();
  await expect(page.getByText('添加第一件衣物，开始整理你的衣橱。')).toHaveCount(0);
  await page.evaluate(()=>{(window as unknown as {allowReads:boolean}).allowReads=true;});
  await page.getByRole('button',{name:'重试'}).click();
  await expect(page.getByRole('alert').filter({hasText:'无法读取衣橱'})).toHaveCount(0);
  await expect(page.getByText('添加第一件衣物，开始整理你的衣橱。')).toBeVisible();
});

test('连续重复确认只产生一件衣物和一张图片',async({page})=>{
  await page.goto('/wardrobe');await page.getByRole('button',{name:'＋ 添加衣物'}).click();
  await page.getByLabel('名称').fill('重复确认');await page.getByLabel('颜色').fill('白');
  await page.getByRole('button',{name:'确认保存'}).evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
  await expect(page.getByRole('heading',{name:'重复确认'})).toBeVisible();
  expect(await page.locator('article').count()).toBe(1);
  const counts=await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('wearwise-real-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const result=await new Promise<number[]>((resolve,reject)=>{const tx=db.transaction(['garments','media'],'readonly');const a=tx.objectStore('garments').count(),b=tx.objectStore('media').count();tx.oncomplete=()=>resolve([a.result,b.result]);tx.onerror=()=>reject(tx.error);});db.close();return result;
  });expect(counts).toEqual([1,1]);
});

test('图片压缩逐档降低质量，三档仍超限则清楚失败',async({page})=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.toBlob;
    (window as unknown as {compressionQualities:number[];failAll:boolean}).compressionQualities=[];
    HTMLCanvasElement.prototype.toBlob=function(callback,type,quality){
      const state=window as unknown as {compressionQualities:number[];failAll:boolean};state.compressionQualities.push(quality??0);
      if(state.failAll || state.compressionQualities.length<3) callback(new Blob([new Uint8Array(4*1024*1024+1)],{type:'image/jpeg'}));
      else original.call(this,callback,type,quality);
    };
  });
  await page.goto('/wardrobe');await page.getByRole('button',{name:'＋ 添加衣物'}).click();
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;return canvas.toDataURL('image/png').split(',')[1];});
  const file={name:'photo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
  await page.getByLabel('衣物照片（可选）').setInputFiles(file);await expect(page.getByAltText('照片预览')).toBeVisible();
  expect(await page.evaluate(()=>(window as unknown as {compressionQualities:number[]}).compressionQualities)).toEqual([0.85,0.75,0.65]);
  await page.evaluate(()=>{const state=window as unknown as {compressionQualities:number[];failAll:boolean};state.compressionQualities=[];state.failAll=true;});
  await page.getByLabel('衣物照片（可选）').setInputFiles([]);await page.getByLabel('衣物照片（可选）').setInputFiles(file);
  await expect(page.getByRole('alert').filter({hasText:'图片处理后仍然过大'})).toBeVisible();
  expect(await page.evaluate(()=>(window as unknown as {compressionQualities:number[]}).compressionQualities)).toEqual([0.85,0.75,0.65]);
  await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.locator('article')).toHaveCount(0);
});

test('旧照片处理晚返回时不能覆盖新选照片',async({page})=>{
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.toBlob;let first=true;
    HTMLCanvasElement.prototype.toBlob=function(callback,type,quality){
      if(first){first=false;original.call(this,blob=>setTimeout(()=>callback(blob),800),type,quality);} else original.call(this,callback,type,quality);
    };
  });
  await page.goto('/wardrobe');await page.getByRole('button',{name:'＋ 添加衣物'}).click();
  const photos=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;const context=canvas.getContext('2d')!;context.fillStyle='red';context.fillRect(0,0,8,8);const red=canvas.toDataURL('image/png').split(',')[1];context.fillStyle='blue';context.fillRect(0,0,8,8);return {red,blue:canvas.toDataURL('image/png').split(',')[1]};});
  const input=page.getByLabel('衣物照片（可选）');await input.setInputFiles({name:'red.png',mimeType:'image/png',buffer:Buffer.from(photos.red,'base64')});
  await expect(page.getByText('正在处理图片…')).toBeVisible();await input.setInputFiles({name:'blue.png',mimeType:'image/png',buffer:Buffer.from(photos.blue,'base64')});
  const preview=page.getByAltText('照片预览');await expect(preview).toBeVisible();
  await page.waitForTimeout(1000);
  const pixel=await preview.evaluate((image:HTMLImageElement)=>{const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const context=canvas.getContext('2d')!;context.drawImage(image,0,0,1,1);return [...context.getImageData(0,0,1,1).data];});
  expect(pixel[2]).toBeGreaterThan(200);expect(pixel[0]).toBeLessThan(30);
});
