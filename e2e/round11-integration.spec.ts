import { test, expect, type Page, type Route } from '@playwright/test';
import { mockWeather } from './helpers/recommendation';

async function uploadedImage(route: Route) {
  const request = route.request();
  const response = new Response(new Uint8Array(request.postDataBuffer()!), {
    headers: { 'Content-Type': request.headers()['content-type'] },
  });
  const file = (await response.formData()).get('image') as File;
  return Buffer.from(await file.arrayBuffer());
}

async function pixel(page: Page, image: Buffer) {
  return page.evaluate(async data => {
    const source = new Image();
    source.src = 'data:image/jpeg;base64,' + data;
    await source.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.drawImage(source, 0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }, image.toString('base64'));
}

test('虚线相框支持加号、文字与键盘，取消保持当前草稿', async ({ page }) => {
  await mockWeather(page);
  await page.goto('/wardrobe');
  await page.getByRole('button', { name: '＋ 添加衣物' }).click();
  await page.getByLabel('名称').fill('取消选图后保留名称');
  const pick = page.getByRole('button', { name: '选择衣物照片（可选）' });
  let opened = 0;
  page.on('filechooser', () => { opened++; });
  for (const open of [() => pick.locator('span').click(), () => pick.getByText('选择衣物照片（可选）').click(), () => pick.press('Enter')]) {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open()]);
    await chooser.setFiles([]);
    await expect(page.getByLabel('名称')).toHaveValue('取消选图后保留名称');
  }
  expect(opened).toBe(3);
});

test('同一张多衣物图可分别框选上下装，白底、识别和重试用同一目标', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWeather(page);
  await page.route('**/api/capabilities', route => route.fulfill({ json: { recognition: { available: true } } }));
  const backgrounds: Buffer[] = [], recognized: Buffer[] = [];
  await page.route('**/api/background/remove', async route => {
    const image = await uploadedImage(route);
    backgrounds.push(image);
    await route.fulfill({ contentType: 'image/jpeg', body: image });
  });
  await page.route('**/api/recognition', async route => {
    const image = await uploadedImage(route);
    recognized.push(image);
    const [red, , blue] = await pixel(page, image);
    const top = red > blue;
    await route.fulfill({ json: { ok: true, data: { candidate: {
      candidateId: crypto.randomUUID(),
      name: top ? '红色上衣' : '蓝色长裤',
      category: top ? 'top' : 'bottom',
      color: top ? '红色' : '蓝色',
      fit: '不确定', warmth: 'unknown', material: '不确定',
      styleTags: [], sceneTags: [], styleOther: [], sceneOther: [], description: '合成色块', warnings: [],
    } } } });
  });
  await page.goto('/wardrobe');
  const payload = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 320;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ff0000'; context.fillRect(0, 0, 160, 160);
    context.fillStyle = '#0000ff'; context.fillRect(0, 160, 160, 160);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  for (const [index, name, category] of [[0, '红色上衣', 'top'], [1, '蓝色长裤', 'bottom']] as const) {
    await page.getByRole('button', { name: '＋ 添加衣物' }).click();
    await page.getByLabel('衣物照片（可选）').setInputFiles({ name: 'synthetic-outfit.png', mimeType: 'image/png', buffer: Buffer.from(payload, 'base64') });
    await expect(page.getByRole('button', { name: '确认保存' })).toBeDisabled();
    const before = recognized.length;
    expect(backgrounds).toHaveLength(before);
    await page.getByRole('button', { name: '框选目标衣物' }).click();
    const bounds = await page.getByAltText('待框选的上传照片').boundingBox();
    expect(bounds).toBeTruthy();
    const { x, y, width, height } = bounds!;
    expect(height).toBeLessThan(480);
    await page.mouse.move(x + width * .1, y + height * (index === 0 ? .05 : .55));
    await page.mouse.down();
    await page.mouse.move(x + width * .9, y + height * (index === 0 ? .45 : .95), { steps: 6 });
    await page.mouse.up();
    await page.getByRole('button', { name: '使用框选范围' }).click();
    await expect(page.getByLabel('名称')).toHaveValue(name);
    await expect(page.getByLabel('类别')).toHaveValue(category);
    await expect(page.getByRole('button', { name: '确认保存' })).toBeEnabled();
    expect(recognized[before].equals(backgrounds[before])).toBe(true);
    await page.getByRole('button', { name: '重新识别衣物' }).click();
    await expect.poll(() => recognized.length).toBe(before + 2);
    await expect(page.getByRole('button', { name: '确认保存' })).toBeEnabled();
    expect(recognized[before + 1].equals(backgrounds[before])).toBe(true);
    await page.getByRole('button', { name: '重新处理白底图' }).click();
    await expect.poll(() => backgrounds.length).toBe(before + 2);
    await expect(page.getByRole('button', { name: '确认保存' })).toBeEnabled();
    expect(backgrounds[before + 1].equals(backgrounds[before])).toBe(true);
    await page.getByRole('button', { name: '确认保存' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }
  await page.reload();
  for (const name of ['红色上衣', '蓝色长裤']) {
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name }) });
    await expect(card).toBeVisible();
    const channels = await card.locator('img').evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
    });
    expect(channels[name === '红色上衣' ? 0 : 2]).toBeGreaterThan(240);
  }
});
