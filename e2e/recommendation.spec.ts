import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real')); });

for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
 test(`真实衣橱到示例天气、穿搭和反馈的闭环 ${viewport.width}px`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto('/wardrobe');
  for (const [name, category] of [['白衬衫','top'],['牛仔裤','bottom'],['运动鞋','shoes']]) {
    await page.getByRole('button', { name:'＋ 添加衣物' }).click();
    await page.getByLabel('名称').fill(name);
    await page.getByLabel('颜色').fill('白色');
    await page.getByLabel('类别').selectOption(category);
    await page.getByLabel('保暖程度').selectOption('medium');
    await page.getByRole('button', {name:'确认保存'}).click();
    await expect(page.getByRole('heading', {name})).toBeVisible();
  }
  await page.getByRole('link', {name:'穿搭推荐'}).click();
  await page.getByRole('button', {name:'使用示例天气'}).click();
  await page.getByRole('button', {name:'生成穿搭'}).click();
  const outfit=page.locator('article').filter({hasText:'搭配 1'});
  await expect(outfit).toContainText('白衬衫');
  await expect(outfit).toContainText('牛仔裤');
  await expect(outfit).toContainText('运动鞋');
  await outfit.getByRole('button', {name:'喜欢', exact:true}).click();
  await expect(outfit.getByRole('button', {name:'喜欢', exact:true})).toHaveAttribute('aria-pressed','true');
  await page.reload();
  const restored=page.locator('article').filter({hasText:'搭配 1'});
  await expect(restored).toBeVisible();
  await expect(restored.getByRole('button', {name:'喜欢', exact:true})).toHaveAttribute('aria-pressed','true');
  await restored.getByRole('button', {name:'不喜欢'}).click();
  await expect(restored.getByRole('button', {name:'不喜欢'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('link', {name:'我的衣橱'}).click();
  const card=page.locator('article').filter({hasText:'白衬衫'});
  await card.getByRole('button', {name:'暂时不推荐'}).click();
  await card.getByRole('button', {name:'确认暂停'}).click();
  await expect(card.getByText(/暂停推荐，\d{4}-\d{2}-\d{2} 起恢复/)).toBeVisible();
  // 新规则：暂停衣物不改变已展示的搭配，旧结果与反馈保留。
  await page.getByRole('link', {name:'穿搭推荐'}).click();
  const kept=page.locator('article').filter({hasText:'搭配 1'});
  await expect(kept).toContainText('白衬衫');
  await expect(kept.getByRole('button', {name:'不喜欢'})).toHaveAttribute('aria-pressed','true');
});
}

test('另一标签页删除衣物时当前推荐保留，不被清空', async ({ page, context }) => {
  await page.goto('/wardrobe');
  for (const [name, category] of [['跨页上衣','top'],['跨页下装','bottom'],['跨页鞋','shoes']]) {
    await page.getByRole('button',{name:'＋ 添加衣物'}).click(); await page.getByLabel('名称').fill(name); await page.getByLabel('颜色').fill('白');
    await page.getByLabel('类别').selectOption(category); await page.getByRole('button',{name:'确认保存'}).click(); await expect(page.getByRole('heading',{name})).toBeVisible();
  }
  await page.getByRole('link',{name:'穿搭推荐'}).click(); await page.getByRole('button',{name:'使用示例天气'}).click(); await page.getByRole('button',{name:'生成穿搭'}).click();
  await expect(page.locator('article').filter({hasText:'搭配 1'})).toBeVisible();
  const other=await context.newPage(); await other.goto('/wardrobe');
  const card=other.locator('article').filter({hasText:'跨页上衣'}); await expect(card).toBeVisible();
  other.once('dialog', dialog => dialog.accept()); await card.getByRole('button',{name:'删除'}).click(); await expect(card).toHaveCount(0);
  await page.bringToFront(); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('article').filter({hasText:'搭配 1'})).toContainText('跨页上衣');
  await expect(page.getByRole('alert').filter({hasText:'衣橱已改变'})).toHaveCount(0);
  await page.reload(); await expect(page.locator('article').filter({hasText:'搭配 1'})).toContainText('跨页上衣');
  await other.close();
});

test('刷新后天气控件与已保存推荐使用的城市一致', async ({ page }) => {
  await page.clock.install();
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({current_units:{temperature_2m:'°C',apparent_temperature:'°C'},current:{time:Math.floor(Date.now()/1000),temperature_2m:20,apparent_temperature:19,weather_code:3}})}));
  await page.goto('/wardrobe');
  for (const [name,category] of [['北京上衣','top'],['北京下装','bottom'],['北京鞋','shoes']]) {
    await page.getByRole('button',{name:'＋ 添加衣物'}).click(); await page.getByLabel('名称').fill(name); await page.getByLabel('颜色').fill('白');
    await page.getByLabel('类别').selectOption(category); await page.getByRole('button',{name:'确认保存'}).click(); await expect(page.getByRole('heading',{name})).toBeVisible();
  }
  await page.getByRole('link',{name:'穿搭推荐'}).click(); await page.getByLabel('选择城市').selectOption('北京');
  await page.getByRole('button',{name:'查看天气'}).click(); await expect(page.getByText('北京 阴天')).toBeVisible();
  await page.getByRole('button',{name:'生成穿搭'}).click(); await expect(page.locator('article').filter({hasText:'搭配 1'})).toBeVisible();
  await page.reload(); await expect(page.locator('article').filter({hasText:'搭配 1'})).toBeVisible();
  await expect(page.getByLabel('选择城市')).toHaveValue('北京'); await expect(page.getByText('北京 阴天')).toBeVisible();
  await page.clock.fastForward('05:01');
  await expect(page.getByText(/天气已过期/)).toBeVisible();
  await expect(page.getByRole('button', {name:'生成穿搭'})).toBeDisabled();
  await expect(page.locator('article').filter({hasText:'搭配 1'}).getByRole('button', {name:'喜欢',exact:true})).toBeDisabled();
});

test('只用键盘完成衣橱、推荐和反馈闭环',async({page})=>{
  await page.goto('/wardrobe');
  async function tabTo(target: import('@playwright/test').Locator) {
    for(let i=0;i<50;i++) {
      if(await target.evaluate(element=>element===document.activeElement)) return;
      await page.keyboard.press('Tab');
    }
    throw new Error('键盘无法到达目标: '+await target.evaluate(element=>element.outerHTML.slice(0,200)));
  }
  for(const [name,down,category] of [['键盘上衣',0,'top'],['键盘下装',1,'bottom'],['键盘鞋履',4,'shoes']] as const) {
    await tabTo(page.getByRole('button',{name:'＋ 添加衣物'}));await page.keyboard.press('Enter');
    await expect(page.getByLabel('名称')).toBeFocused();await page.keyboard.type(name);
    await tabTo(page.getByLabel('类别'));for(let i=0;i<down;i++) await page.keyboard.press('ArrowDown');
    await expect(page.getByLabel('类别')).toHaveValue(category);
    await tabTo(page.getByLabel('颜色'));await page.keyboard.type('白色');
    await tabTo(page.getByRole('button',{name:'确认保存'}));await page.keyboard.press('Enter');
    await expect(page.getByRole('heading',{name})).toBeVisible();
  }
  await tabTo(page.getByRole('link',{name:'穿搭推荐',exact:true}));await page.keyboard.press('Enter');
  await tabTo(page.getByRole('button',{name:'使用示例天气'}));await page.keyboard.press('Enter');
  await tabTo(page.getByRole('button',{name:'生成穿搭'}));await page.keyboard.press('Enter');
  const outfit=page.locator('article').filter({hasText:'搭配 1'});await expect(outfit).toContainText('键盘上衣');
  await tabTo(outfit.getByRole('button',{name:'喜欢',exact:true}));await page.keyboard.press('Enter');
  await expect(outfit.getByRole('button',{name:'喜欢',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('切换风格和城市后旧搭配失效，历史记录不会恢复为当前推荐',async({page})=>{
  await page.goto('/wardrobe');
  for(const [name,category] of [['变更上衣','top'],['变更裤子','bottom'],['变更鞋子','shoes']]) {
    await page.getByRole('button',{name:'＋ 添加衣物'}).click();await page.getByLabel('名称').fill(name);await page.getByLabel('颜色').fill('白');
    await page.getByLabel('类别').selectOption(category);await page.getByRole('button',{name:'确认保存'}).click();await expect(page.getByRole('heading',{name})).toBeVisible();
  }
  await page.getByRole('link',{name:'穿搭推荐',exact:true}).click();await page.getByRole('button',{name:'使用示例天气'}).click();
  await page.getByRole('button',{name:'生成穿搭'}).click();await expect(page.locator('article').filter({hasText:'搭配 1'})).toBeVisible();
  await page.getByLabel('选择风格').selectOption('简约通勤');await expect(page.locator('article').filter({hasText:'搭配 1'})).toHaveCount(0);
  await page.reload();await expect(page.locator('article').filter({hasText:'搭配 1'})).toHaveCount(0);
  await page.getByRole('button',{name:'使用示例天气'}).click();await page.getByRole('button',{name:'生成穿搭'}).click();await expect(page.locator('article').filter({hasText:'搭配 1'})).toBeVisible();
  await page.getByLabel('选择城市').selectOption('上海');await expect(page.locator('article').filter({hasText:'搭配 1'})).toHaveCount(0);
  await page.reload();await expect(page.locator('article').filter({hasText:'搭配 1'})).toHaveCount(0);
});

test('获取后五分钟内观测时间先过期时禁止继续使用推荐',async({page})=>{
  await page.clock.install();
  await page.route('https://api.open-meteo.com/**',route=>route.fulfill({status:200,json:{current_units:{temperature_2m:'°C',apparent_temperature:'°C'},current:{time:Math.floor(Date.now()/1000)-10740,temperature_2m:20,apparent_temperature:19,weather_code:3}}}));
  await page.goto('/wardrobe');
  for(const [name,category] of [['时间上衣','top'],['时间裤子','bottom'],['时间鞋','shoes']]) {
    await page.getByRole('button',{name:'＋ 添加衣物'}).click();await page.getByLabel('名称').fill(name);await page.getByLabel('颜色').fill('白');
    await page.getByLabel('类别').selectOption(category);await page.getByRole('button',{name:'确认保存'}).click();await expect(page.getByRole('heading',{name})).toBeVisible();
  }
  await page.getByRole('link',{name:'穿搭推荐',exact:true}).click();await page.getByRole('button',{name:'查看天气'}).click();
  await page.getByRole('button',{name:'生成穿搭'}).click();await expect(page.locator('article').filter({hasText:'搭配 1'})).toBeVisible();
  await page.clock.fastForward('01:02');
  await expect(page.getByText(/天气已过期/)).toBeVisible();await expect(page.getByRole('button',{name:'生成穿搭'})).toBeDisabled();
  await expect(page.locator('article').filter({hasText:'搭配 1'}).getByRole('button',{name:'喜欢',exact:true})).toBeDisabled();
});

test('生成推荐过程中切换模式不会激活或显示旧模式晚结果',async({page})=>{
  await page.goto('/wardrobe');
  for(const [name,category] of [['竞态上衣','top'],['竞态裤子','bottom'],['竞态鞋','shoes']]) {
    await page.getByRole('button',{name:'＋ 添加衣物'}).click();await page.getByLabel('名称').fill(name);await page.getByLabel('颜色').fill('白');
    await page.getByLabel('类别').selectOption(category);await page.getByRole('button',{name:'确认保存'}).click();await expect(page.getByRole('heading',{name})).toBeVisible();
  }
  await page.getByRole('link',{name:'穿搭推荐',exact:true}).click();await page.getByRole('button',{name:'使用示例天气'}).click();
  await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('wearwise-real-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const tx=db.transaction(['meta'],'readwrite');const store=tx.objectStore('meta');
    const state=window as unknown as {releaseRecommendationLock?:()=>void};let stopped=false;
    state.releaseRecommendationLock=()=>{stopped=true;};
    await new Promise<void>((resolve,reject)=>{
      let first=true;const next=()=>{const request=store.get('wardrobeRevision');request.onsuccess=()=>{if(first){first=false;resolve();}if(!stopped)next();};request.onerror=()=>reject(request.error);};next();
    });tx.oncomplete=()=>db.close();
  });
  await page.getByRole('button',{name:'生成穿搭'}).click();await expect(page.getByRole('button',{name:'正在生成…'})).toBeVisible();
  await page.getByRole('button',{name:'切换示例模式'}).click();await expect(page.getByText('示例模式 · 示例数据')).toBeVisible();
  await page.evaluate(()=>(window as unknown as {releaseRecommendationLock:()=>void}).releaseRecommendationLock());
  await expect(page.getByText('竞态上衣')).toHaveCount(0);await expect(page.locator('article').filter({hasText:'搭配 1'})).toHaveCount(0);
  await page.getByRole('button',{name:'切换真实衣橱'}).click();await expect(page.getByText('真实衣橱 · 仅本浏览器保存')).toBeVisible();
  await expect(page.locator('article').filter({hasText:'搭配 1'})).toHaveCount(0);await page.reload();await expect(page.locator('article').filter({hasText:'搭配 1'})).toHaveCount(0);
});
