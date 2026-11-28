import { mockWeather } from './helpers/recommendation';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real')); });

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
  test(`框架导航和页面分区 ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockWeather(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /让穿搭变简单/ })).toBeVisible();
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '我的衣橱' }).click();
    await expect(page).toHaveURL(/\/wardrobe/);
    await expect(page.getByRole('heading', { name: '我的衣橱.' })).toBeVisible();
    await expect(page.getByRole('button', { name: '＋ 添加衣物' })).toBeEnabled();
    await expect(page.getByText('添加第一件衣物，开始整理你的衣橱。')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/wardrobe-${viewport.width}.png`, fullPage: true });
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '穿搭推荐' }).click();
    await expect(page).toHaveURL(/\/recommendations/);
    await expect(page.getByRole('heading', { name: '穿搭推荐.' })).toBeVisible();
    await expect(page.getByText('天气参考')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: '本次喜好' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: '本次场景' })).toBeVisible();
    await expect(page.getByRole('button', { name: '生成穿搭' })).toBeEnabled();
    await expect(page.getByText('还没有穿搭推荐')).toBeVisible();
    await page.screenshot({ path: `test-results/recommendations-${viewport.width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const nav = page.getByRole('navigation', { name: '主导航' });
    for (const [title, path] of [['穿搭灵感', '/inspiration'], ['我的偏好', '/preferences']]) {
      const link = nav.getByRole('link', { name: title });
      await link.click();
      await expect(page).toHaveURL(path);
      await expect(link).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { name: title + '.' })).toBeVisible();
      if (title === '穿搭灵感') await expect(page.getByText('上传灵感')).toBeVisible();
      else await expect(page.getByRole('button', { name: '添加偏好' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '首页' }).click();
    await expect(page).toHaveURL('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/home-${viewport.width}.png`, fullPage: true });
  });
}
