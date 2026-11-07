import { test, expect } from '@playwright/test';
test('正式 Chrome 实际读取六城市实时天气', async ({page}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real'));
  await page.goto('/');
  for (const city of ['深圳','广州','上海','北京','成都','杭州']) {
    await page.getByLabel('选择城市').selectOption(city);
    const responsePromise = page.waitForResponse(response => response.url().startsWith('https://api.open-meteo.com/v1/forecast?'));
    await page.getByRole('button', {name:'查看天气'}).click();
    const response = await responsePromise; expect(response.status()).toBe(200);
    await expect(page.locator('.weather-card').getByText(new RegExp(`^${city} `))).toBeVisible();
    await expect(page.locator('.weather-card').getByText(/体感/)).toBeVisible();
  }
});

test('真实衣物与真实天气生成穿搭并保存反馈', async ({page}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => localStorage.setItem('wearwise-mode','real'));
  await page.goto('/wardrobe');
  for (const [name,category] of [['真实上衣','top'],['真实下装','bottom'],['真实鞋','shoes'],['真实外套','outerwear']]) {
    await page.getByRole('button',{name:'＋ 添加衣物'}).click();
    await page.getByLabel('名称').fill(name);await page.getByLabel('颜色').fill('黑色');await page.getByLabel('类别').selectOption(category);await page.getByLabel('保暖程度').selectOption('warm');
    await page.getByRole('button',{name:'确认保存'}).click();await expect(page.getByRole('heading',{name})).toBeVisible();
  }
  await page.getByRole('link',{name:'穿搭推荐'}).click();await page.getByLabel('选择城市').selectOption('上海');
  const response=page.waitForResponse(r=>r.url().startsWith('https://api.open-meteo.com/v1/forecast?'));
  await page.getByRole('button',{name:'查看天气'}).click();expect((await response).status()).toBe(200);
  await expect(page.getByText(/^上海 /)).toBeVisible();await page.getByRole('button',{name:'生成穿搭'}).click();
  const outfit=page.locator('article').filter({hasText:'搭配 1'});await expect(outfit).toContainText('真实上衣');
  await outfit.getByRole('button',{name:'喜欢',exact:true}).click();await expect(outfit.getByRole('button',{name:'喜欢',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.reload();await expect(page.locator('article').filter({hasText:'搭配 1'}).getByRole('button',{name:'喜欢',exact:true})).toHaveAttribute('aria-pressed','true');
});
