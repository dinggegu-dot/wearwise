import { test, expect, type Page, type Locator } from '@playwright/test';
import { fulfillRecommendation, mockRecommendation, mockWeather, weatherResult } from './helpers/recommendation';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real'));
  await mockWeather(page);
  await mockRecommendation(page);
});

const outfit = (page: Page) => page.locator('article').filter({ has: page.getByRole('heading', { name: '当前穿搭' }) });
const generate = (page: Page) => page.getByRole('button', { name: '生成穿搭', exact: true });
const recommendations = (page: Page) => page.getByRole('navigation').getByRole('link', { name: '穿搭推荐', exact: true });

async function seed(page: Page, prefix: string) {
  await page.goto('/wardrobe');
  for (const [category, suffix] of [['top','上衣'], ['bottom','长裤'], ['shoes','鞋']]) {
    const name = prefix + suffix;
    await page.getByRole('button', { name: '＋ 添加衣物' }).click();
    await page.getByLabel('名称').fill(name);
    await page.getByLabel('颜色').fill('白色');
    await page.getByLabel('类别').selectOption(category);
    await page.getByRole('button', { name: '确认保存' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }
  await recommendations(page).click();
  await expect(page.getByText('深圳 阴天')).toBeVisible();
}

async function feedback(page: Page, choice: '喜欢' | '不喜欢', reason = '') {
  await outfit(page).getByRole('button', { name: choice === '喜欢' ? '♡ 喜欢' : choice, exact: true }).click();
  if (reason) await page.getByRole('dialog').getByRole('textbox').fill(reason);
  await page.getByRole('button', { name: '提交反馈' }).click();
  await page.getByRole('button', { name: '暂时不换，返回' }).click();
}

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeAttached();
  for (let index = 0; index < 60; index++) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('键盘无法到达目标：' + await target.evaluate(element => element.outerHTML.slice(0, 200)));
}

for (const width of [1440, 390]) {
  test(`衣橱到真实天气输入、模拟推荐与反馈闭环 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page, '闭环');
    await generate(page).click();
    for (const item of ['上衣','长裤','鞋']) await expect(outfit(page)).toContainText('闭环' + item);
    await feedback(page, '喜欢', '颜色搭配好');
    await page.reload();
    await expect(outfit(page)).toContainText('闭环上衣');
    await feedback(page, '不喜欢', '颜色不喜欢');
    await page.getByRole('navigation').getByRole('link', { name: '我的衣橱' }).click();
    await page.locator('article').filter({ hasText: '闭环上衣' }).getByRole('button', { name: '暂时不推荐' }).click();
    await page.getByRole('button', { name: '确认暂停' }).click();
    await recommendations(page).click();
    await expect(outfit(page)).toContainText('当前搭配包含已暂停衣物：闭环上衣');
    await generate(page).click();
    await expect(page.locator('.outfit-panel [role=alert]')).toContainText('衣橱不足');
    await expect(outfit(page)).toContainText('闭环上衣');
  });
}

test('另一标签页删除衣物时保留当前搭配快照', async ({ page, context }) => {
  await seed(page, '跨页');
  await generate(page).click();
  await expect(outfit(page)).toContainText('跨页上衣');
  const other = await context.newPage();
  await mockWeather(other);
  await other.goto('/wardrobe');
  const card = other.locator('article').filter({ hasText: '跨页上衣' });
  other.once('dialog', dialog => dialog.accept());
  await card.getByRole('button', { name: '删除' }).click();
  await expect(card).toHaveCount(0);
  await page.bringToFront();
  await expect(outfit(page)).toContainText('跨页上衣');
  await page.reload();
  await expect(outfit(page)).toContainText('当前搭配包含已删除衣物：跨页上衣');
  await other.close();
});

test('刷新恢复已应用城市和天气，改城市仅在成功生成后生效', async ({ page }) => {
  await seed(page, '天气');
  await page.getByLabel('选择城市').selectOption('北京');
  await expect(page.getByText('北京 阴天')).toBeVisible();
  await generate(page).click();
  await expect(outfit(page)).toContainText('北京');
  await page.reload();
  await expect(page.getByLabel('选择城市')).toHaveValue('北京');
  await expect(outfit(page)).toContainText('北京');
  await page.getByLabel('选择城市').selectOption('上海');
  await expect(page.getByText('上海 阴天')).toBeVisible();
  await expect(outfit(page)).toContainText('北京');
  await generate(page).click();
  await expect(outfit(page)).toContainText('上海');
});

test('只用键盘完成衣橱、推荐和反馈闭环', async ({ page }) => {
  await page.goto('/wardrobe');
  for (const [name, arrows, category] of [['键盘上衣', 0, 'top'], ['键盘长裤', 1, 'bottom'], ['键盘鞋', 4, 'shoes']] as const) {
    await tabTo(page, page.getByRole('button', { name: '＋ 添加衣物' }));
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('名称')).toBeFocused();
    await page.keyboard.type(name);
    await tabTo(page, page.getByLabel('类别'));
    for (let index = 0; index < arrows; index++) await page.keyboard.press('ArrowDown');
    await expect(page.getByLabel('类别')).toHaveValue(category);
    await tabTo(page, page.getByLabel('颜色'));
    await page.keyboard.type('白色');
    await tabTo(page, page.getByRole('button', { name: '确认保存' }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }
  await tabTo(page, recommendations(page));
  await page.keyboard.press('Enter');
  await tabTo(page, generate(page));
  await page.keyboard.press('Enter');
  await expect(outfit(page)).toContainText('键盘上衣');
  await tabTo(page, outfit(page).getByRole('button', { name: '♡ 喜欢' }));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('button', { name: '提交反馈' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '反馈已保存' })).toBeVisible();
});

test('过期的新城市天气阻止新生成，已应用搭配仍可反馈', async ({ page }) => {
  await seed(page, '过期');
  await generate(page).click();
  await expect(outfit(page)).toContainText('深圳');
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: weatherResult(1700000000000) }));
  await page.getByLabel('选择城市').selectOption('上海');
  await expect(page.getByRole('region', { name: '今日天气' }).getByRole('alert')).toContainText('暂时无法获取天气');
  await generate(page).click();
  await expect(page.locator('.outfit-panel [role=alert]')).toContainText('天气暂时无法获取');
  await expect(outfit(page)).toContainText('深圳');
  await feedback(page, '喜欢');
});

test('生成时报告实际等待、防止重复提交并保留旧轮反馈，成功新轮才清除', async ({ page }) => {
  await seed(page, '等候');
  await generate(page).click();
  await expect(outfit(page)).toBeVisible();
  await feedback(page, '不喜欢', '不喜欢黑色');
  let generationCalls = 0;
  let swapFeedback: unknown;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/recommendation', async route => {
    const input = route.request().postDataJSON();
    if (input.operation) {
      swapFeedback = input.conditions.feedback;
      return fulfillRecommendation(route);
    }
    if (++generationCalls === 1) {
      await gate;
      return route.fulfill({ status: 504, json: {
        ok: false, requestId: 'r11-timeout', error: { code: 'AI_TIMEOUT', message: 'AI 请求超时。', retryable: true },
      } });
    }
    return fulfillRecommendation(route);
  });
  await generate(page).click();
  try {
    await expect(page.getByRole('timer')).toHaveText(/已等待 [1-9]\d* 秒/);
    const waiting = page.getByRole('button', { name: '正在生成…' });
    await expect(waiting).toBeDisabled();
    await waiting.evaluate((button: HTMLButtonElement) => button.click());
    expect(generationCalls).toBe(1);
  } finally { release(); }
  await expect(page.locator('.outfit-panel [role=alert]')).toContainText('请求编号 r11-timeout');
  await expect(page.getByRole('timer')).toHaveCount(0);
  await expect(outfit(page)).toContainText('等候上衣');
  await outfit(page).getByRole('button', { name: '换一套' }).click();
  await expect.poll(() => swapFeedback).toEqual([{ choice: 'dislike', reason: '不喜欢黑色' }]);
  await generate(page).click();
  await expect(page.getByText('请求编号 r11-timeout')).toHaveCount(0);
  await expect(generate(page)).toBeEnabled();
  swapFeedback = 'pending';
  await outfit(page).getByRole('button', { name: '换一套' }).click();
  await expect.poll(() => swapFeedback).toBeUndefined();
});

test('生成过程中切换模式，迟到结果无法写入旧模式', async ({ page }) => {
  await seed(page, '竞态');
  let release!: () => void;
  let seen = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/recommendation', async route => {
    seen = true;
    await gate;
    await fulfillRecommendation(route).catch(() => undefined);
  });
  await generate(page).click();
  await expect.poll(() => seen).toBe(true);
  try {
    await page.getByRole('button', { name: '切换示例模式' }).click();
    await expect(page.getByText('示例模式 · 示例数据')).toBeVisible();
  } finally { release(); }
  await expect(outfit(page)).toHaveCount(0);
  await page.getByRole('button', { name: '切换真实衣橱' }).click();
  await expect(page.getByText('真实衣橱 · 仅本浏览器保存')).toBeVisible();
  await expect(outfit(page)).toHaveCount(0);
  await page.reload();
  await expect(outfit(page)).toHaveCount(0);
});
