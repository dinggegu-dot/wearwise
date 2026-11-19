import { test,expect } from '@playwright/test';

test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('wearwise-mode','real'));});
const image={name:'sample.png',mimeType:'image/png',buffer:Buffer.from('fake image')};
const deferred=()=>{let release!:(value:unknown)=>void;const promise=new Promise(resolve=>{release=resolve;});return{promise,release};};

test('切换图片后只应用新图片分析，旧请求即使晚返回也不覆盖',async({page})=>{
 const a=deferred(),b=deferred();let count=0;
 await page.route('**/api/inspiration/analyze',async route=>{const target=++count===1?a:b;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await target.promise)});});
 await page.goto('/inspiration');const upload=page.locator('input[type=file]');
 await upload.setInputFiles(image);await page.getByRole('button',{name:'分析/重试'}).click();
 await upload.setInputFiles({...image,name:'second.png'});await page.getByRole('button',{name:'分析/重试'}).click();
 b.release({ok:true,data:{name:'图片B',analysis:'B分析',tags:[{text:'B标签',kind:'style'}]},requestId:'b'});
 await expect(page.getByLabel('名称')).toHaveValue('图片B');await expect(page.getByLabel('分析')).toHaveValue('B分析');
 a.release({ok:true,data:{name:'图片A',analysis:'A分析',tags:[{text:'A标签',kind:'color'}]},requestId:'a'});
 await expect(page.getByLabel('名称')).toHaveValue('图片B');await expect(page.getByLabel('分析')).toHaveValue('B分析');
});

test('离开页面后晚到分析不更新页面、不保存，并且不产生未处理拒绝',async({page})=>{
 const pending=deferred();let unhandled=0;await page.addInitScript(()=>{(window as any).__unhandled=0;window.addEventListener('unhandledrejection',()=>{(window as any).__unhandled++;});});
 await page.route('**/api/inspiration/analyze',async route=>{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await pending.promise)});});
 await page.goto('/inspiration');await page.locator('input[type=file]').setInputFiles(image);await page.getByRole('button',{name:'分析/重试'}).click();
 await page.goto('/wardrobe');pending.release({ok:true,data:{name:'迟到结果',analysis:'不应保存',tags:[]},requestId:'late'});
 await page.waitForTimeout(100);unhandled=await page.evaluate(()=> (window as any).__unhandled);
 await expect(page.getByRole('heading',{name:/我的衣橱/})).toBeVisible();expect(unhandled).toBe(0);
 await page.goto('/inspiration');await expect(page.getByText('迟到结果')).toHaveCount(0);
});
