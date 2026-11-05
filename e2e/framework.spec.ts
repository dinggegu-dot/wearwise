import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`框架导航和页面分区 ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const external: string[] = [];
    page.on('request', request => { const url = new URL(request.url()); if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') external.push(url.toString()); });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /让穿搭变简单/ })).toBeVisible();
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '我的衣橱' }).click();
    await expect(page).toHaveURL(/\/wardrobe/);
    await expect(page.getByRole('heading', { name: '我的衣橱.' })).toBeVisible();
    await expect(page.getByRole('button', { name: /添加衣物，后续开放/ })).toBeDisabled();
    await expect(page.getByText('图片识别录入')).toBeVisible();
    await expect(page.getByText('编辑与删除')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/wardrobe-${viewport.width}.png`, fullPage: true });
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '穿搭推荐' }).click();
    await expect(page).toHaveURL(/\/recommendations/);
    await expect(page.getByRole('heading', { name: '穿搭推荐.' })).toBeVisible();
    await expect(page.getByText('天气参考')).toBeVisible();
    await expect(page.getByText('选择风格')).toBeVisible();
    await expect(page.getByRole('button', { name: /生成穿搭，后续开放/ })).toBeDisabled();
    await expect(page.getByText('留下你的想法')).toBeVisible();
    await page.screenshot({ path: `test-results/recommendations-${viewport.width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '首页' }).click();
    await expect(page).toHaveURL('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(external).toEqual([]);
    await page.screenshot({ path: `test-results/home-${viewport.width}.png`, fullPage: true });
  });
}
