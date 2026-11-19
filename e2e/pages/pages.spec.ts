import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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

test('静态网站加载固定 BiRefNet 模型，白底图片保存后刷新仍可读取', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/wearwise/wardrobe/');
  await expect(page.getByText('真实衣橱 · 仅本浏览器保存')).toBeVisible();
  await page.getByRole('button', { name: '＋ 添加衣物' }).click();
  const modelResponse = page.waitForResponse(response => response.url().endsWith('/wearwise/models/birefnet/model_fp16.onnx'));
  await page.getByLabel('衣物照片（可选）').setInputFiles(path.resolve('tests/fixtures/synthetic-shirt.jpg'));
  const response = await modelResponse;
  expect(response.status()).toBe(200);
  // Chrome may evict a 94 MiB response body from its inspector cache; verify the exact exported asset instead.
  const model = await readFile(path.resolve('out/models/birefnet/model_fp16.onnx'));
  expect(model.length).toBe(98484532);
  expect(createHash('sha256').update(model).digest('hex')).toBe('eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516');
  await expect(page.getByText('已在本机完成白底抠图。')).toBeVisible({ timeout: 90000 });
  const whiteCorner = (selector: string) => page.locator(selector).evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
  });
  expect((await whiteCorner('img[alt="照片预览"]')).every(channel => channel > 248)).toBe(true);
  await page.getByLabel('名称').fill('静态白底测试衣物');
  await page.getByLabel('颜色').fill('红色');
  await page.getByRole('button', { name: '确认保存' }).click();
  const saved = page.locator('article').filter({ hasText: '静态白底测试衣物' });
  await expect(saved).toBeVisible();
  await page.reload();
  await expect(saved.locator('img')).toBeVisible();
  expect((await saved.locator('img').evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
  })).every(channel => channel > 248)).toBe(true);
});
