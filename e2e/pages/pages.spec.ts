import { test, expect } from '@playwright/test';

test('静态子路径导航、直接刷新和本地衣橱保存', async ({ page }) => {
  const failed: string[]=[];
  page.on('response', response=>{if(response.status()>=400) failed.push(`${response.status()} ${response.url()}`);});
  await page.goto('/wearwise/');
  await expect(page.getByText('真实衣橱 · 仅本浏览器保存')).toBeVisible();
  await page.getByRole('link',{name:'我的衣橱',exact:true}).click();
  await expect(page).toHaveURL(/\/wearwise\/wardrobe\/$/);
  await page.reload();
  await page.getByRole('button',{name:'＋ 添加衣物'}).click();
  await page.getByLabel('名称').fill('静态版上衣'); await page.getByLabel('颜色').fill('白色');
  await page.getByRole('button',{name:'确认保存'}).click();
  await expect(page.getByRole('heading',{name:'静态版上衣'})).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading',{name:'静态版上衣'})).toBeVisible();
  await page.getByRole('link',{name:'穿搭推荐',exact:true}).click();
  await expect(page).toHaveURL(/\/wearwise\/recommendations\/$/);
  await page.reload(); await expect(page.getByRole('heading',{name:'穿搭推荐.'})).toBeVisible();
  for (const [title, path] of [['穿搭灵感', 'inspiration'], ['我的偏好', 'preferences']]) {
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: title }).click();
    await expect(page).toHaveURL(new RegExp('/wearwise/' + path + '/$'));
    await page.reload();
    await expect(page.getByRole('heading', { name: title + '.' })).toBeVisible();
  }
  expect(failed).toEqual([]);
});

test('静态版实际衣橱到推荐反馈并刷新恢复', async ({ page }) => {
  await page.goto('/wearwise/');
  await expect(page.getByText('真实衣橱 · 仅本浏览器保存')).toBeVisible();
  await page.getByRole('link',{name:'我的衣橱',exact:true}).click();
  for (const [name,category] of [['静态白衬衫','top'],['静态牛仔裤','bottom'],['静态运动鞋','shoes']]) {
    await page.getByRole('button',{name:'＋ 添加衣物'}).click();
    await page.getByLabel('名称').fill(name);
    await page.getByLabel('颜色').fill('白色');
    await page.getByLabel('类别').selectOption(category);
    await page.getByLabel('保暖程度').selectOption('medium');
    await page.getByRole('button',{name:'确认保存'}).click();
    await expect(page.getByRole('heading',{name})).toBeVisible();
  }
  await page.getByRole('link',{name:'穿搭推荐',exact:true}).click();
  await page.getByRole('button',{name:'使用示例天气'}).click();
  await page.getByRole('button',{name:'生成穿搭'}).click();
  const outfit=page.locator('article').filter({hasText:'搭配 1'});
  for (const name of ['静态白衬衫','静态牛仔裤','静态运动鞋']) await expect(outfit).toContainText(name);
  await outfit.getByRole('button',{name:'喜欢',exact:true}).click();
  await expect(outfit.getByRole('button',{name:'喜欢',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.reload();
  await expect(page.locator('article').filter({hasText:'搭配 1'}).getByRole('button',{name:'喜欢',exact:true})).toHaveAttribute('aria-pressed','true');
});
