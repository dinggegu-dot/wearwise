import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wearwise-mode', 'real'));
});

async function photo(page: Page, color: string, width = 80, height = 120) {
  const base64 = await page.evaluate(({ color, width, height }) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 8, 8);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { color, width, height });
  return { name: 'generated-test-pattern.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

async function wardrobe(page: Page) {
  await page.goto('/wardrobe');
  for (const [name, category, color, width, height] of [
    ['测试上衣', 'top', 'red', 80, 120], ['测试下装', 'bottom', 'blue', 120, 80], ['测试鞋', 'shoes', 'green', 100, 100]
  ] as const) {
    await page.getByRole('button', { name: '＋ 添加衣物' }).click();
    await page.getByLabel('名称').fill(name); await page.getByLabel('颜色').fill(color);
    await page.getByLabel('类别').selectOption(category);
    await page.getByLabel('衣物照片（可选）').setInputFiles(await photo(page, color, width, height));
    await expect(page.getByAltText('照片预览')).toBeVisible();
    await page.getByRole('button', { name: '确认保存' }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
}

async function generate(page: Page) {
  await page.getByRole('link', { name: '穿搭推荐', exact: true }).click();
  await page.getByRole('button', { name: '使用示例天气' }).click();
  await page.getByRole('button', { name: '生成穿搭' }).click();
  await expect(page.locator('.outfit-item')).toHaveCount(3);
}

async function checkImages(page: Page) {
  for (const name of ['测试上衣', '测试下装', '测试鞋']) {
    const image = page.locator('.outfit-item').filter({ hasText: name }).getByRole('img', { name, exact: true });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    // Compare the displayed Blob byte-for-byte with the persisted imageId for this name.
    expect(await image.evaluate(async (img: HTMLImageElement, name) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('wearwise-real-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const saved = await new Promise<Blob>((resolve, reject) => {
        const tx = db.transaction(['garments', 'media']);
        const garments = tx.objectStore('garments').getAll();
        garments.onsuccess = () => {
          const garment = garments.result.find(item => item.name === name);
          const media = tx.objectStore('media').get(garment.imageId);
          media.onsuccess = () => resolve(media.result.blob);
        };
        tx.onerror = () => reject(tx.error);
      }); db.close();
      const actual = new Uint8Array(await (await fetch(img.src)).arrayBuffer());
      const expected = new Uint8Array(await saved.arrayBuffer());
      return actual.length === expected.length && actual.every((byte, i) => byte === expected[i]);
    }, name)).toBe(true);
    expect(await image.evaluate(img => getComputedStyle(img).objectFit)).toBe('contain');
  }
}

for (const width of [1440, 390]) {
  test(`generated patterns: saved image identity, feedback and refresh ${width}px`, async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    const external: string[] = [];
    context.on('request', request => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(baseURL!).origin) external.push(request.url());
    });
    await wardrobe(page); await generate(page); await checkImages(page);
    await expect(page.getByText('当前使用示例天气，衣物来自你的真实衣橱。')).toBeVisible();
    const like = page.getByRole('button', { name: '喜欢', exact: true });
    await like.focus(); await page.keyboard.press('Enter'); await expect(like).toHaveAttribute('aria-pressed', 'true');
    await page.reload(); await checkImages(page); await expect(like).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(external).toEqual([]);
  });
}

test('read failure is distinct from missing media and keyboard retry recovers', async ({ page }) => {
  await wardrobe(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function(key) {
      if (this.name === 'media') throw new DOMException('injected media read failure', 'UnknownError');
      return original.call(this, key);
    };
    (window as unknown as { restoreMediaReads(): void }).restoreMediaReads = () => { IDBObjectStore.prototype.get = original; };
  });
  await generate(page);
  await expect(page.getByText('图片读取失败', { exact: true })).toHaveCount(3);
  await expect(page.getByText('暂无图片', { exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { restoreMediaReads(): void }).restoreMediaReads());
  for (const name of ['测试上衣', '测试下装', '测试鞋']) {
    await page.getByRole('button', { name: `重新加载${name}的图片`, exact: true }).focus();
    await page.keyboard.press('Enter');
  }
  await checkImages(page);
});

test('user report: feedback has a visible selected state and saved confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await wardrobe(page); await generate(page);
  const article = page.locator('.outfit-panel article').first();
  const like = article.getByRole('button', { name: '喜欢', exact: true });
  const dislike = article.getByRole('button', { name: '不喜欢', exact: true });
  const originalColor = await like.evaluate(button => getComputedStyle(button).backgroundColor);
  await like.click(); await expect(like).toHaveAttribute('aria-pressed', 'true');
  expect(await like.evaluate(button => getComputedStyle(button).backgroundColor)).not.toBe(originalColor);
  await expect(article.getByRole('status', { name: '反馈状态' })).toHaveText('反馈已保存：喜欢');
  await dislike.click(); await expect(dislike).toHaveAttribute('aria-pressed', 'true');
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await expect(article.getByRole('status', { name: '反馈状态' })).toHaveText('反馈已保存：不喜欢');
  await page.reload(); await expect(dislike).toHaveAttribute('aria-pressed', 'true');
  await expect(article.getByRole('status', { name: '反馈状态' })).toHaveText('反馈已保存：不喜欢');
});

test('user report: failed feedback is not shown as saved and can be retried', async ({ page }) => {
  await wardrobe(page); await generate(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put; let fail = true;
    IDBObjectStore.prototype.put = function(value, key) {
      if (this.name === 'feedback' && fail) { fail = false; throw new DOMException('injected feedback failure', 'QuotaExceededError'); }
      return original.call(this, value, key);
    };
  });
  const article = page.locator('.outfit-panel article').first();
  const like = article.getByRole('button', { name: '喜欢', exact: true });
  await like.click(); await expect(page.getByRole('alert').filter({ hasText: '反馈保存失败' })).toBeVisible();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await expect(article.getByText('反馈已保存：喜欢', { exact: true })).toHaveCount(0);
  await like.click(); await expect(article.getByRole('status', { name: '反馈状态' })).toHaveText('反馈已保存：喜欢');
  await expect(page.getByRole('alert').filter({ hasText: '反馈保存失败' })).toHaveCount(0);
});

test('user report: cancelling photo reselection keeps the garment dialog and draft', async ({ page }) => {
  await page.goto('/wardrobe'); await page.getByRole('button', { name: '＋ 添加衣物' }).click();
  const dialog = page.getByRole('dialog', { name: '添加衣物' });
  await page.getByLabel('名称').fill('换图草稿'); await page.getByLabel('颜色').fill('红色');
  const input = page.getByLabel('衣物照片（可选）');
  await input.setInputFiles(await photo(page, 'red')); await expect(page.getByAltText('照片预览')).toBeVisible();
  const originalPreview = await page.getByAltText('照片预览').getAttribute('src');
  // A native file input bubbles cancel on chooser cancellation or selecting the same file.
  // Keep this distinct from Escape on the garment dialog itself.
  await input.dispatchEvent('cancel', { bubbles: true, cancelable: false });
  await expect(dialog).toBeVisible(); await expect(page.getByLabel('名称')).toHaveValue('换图草稿');
  await expect(page.getByAltText('照片预览')).toHaveAttribute('src', originalPreview!);
  await expect(input).toHaveAttribute('aria-describedby', 'wardrobe-photo-hint');
  await expect(page.locator('#wardrobe-photo-hint')).toContainText('如果选错照片');
  await input.setInputFiles(await photo(page, 'blue', 60, 90));
  await expect(page.getByAltText('照片预览')).not.toHaveAttribute('src', originalPreview!);
  await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.getByRole('heading', { name: '换图草稿', exact: true })).toBeVisible();
  await page.reload();
  const card = page.locator('article').filter({ hasText: '换图草稿' });
  await expect(card).toBeVisible();
  const image = card.locator('img');
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(60);
  const pixel = await image.evaluate((img: HTMLImageElement) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  });
  expect(pixel[2]).toBeGreaterThan(200); expect(pixel[0]).toBeLessThan(40);
  await card.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('名称').fill('不保存的改名'); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '换图草稿', exact: true })).toBeVisible();
});

test('missing Blob has an explicit placeholder and keeps names and reason', async ({ page }) => {
  await wardrobe(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wearwise-real-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('media', 'readwrite'); tx.objectStore('media').clear();
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
  });
  await generate(page);
  await expect(page.getByText('暂无图片', { exact: true })).toHaveCount(3);
  await expect(page.locator('.outfit-item img')).toHaveCount(0);
  await expect(page.locator('.outfit-panel')).toContainText('根据体感');
  for (const name of ['测试上衣', '测试下装', '测试鞋']) await expect(page.locator('figcaption').filter({ hasText: name })).toBeVisible();
});

test('user report: editing shows the saved photo and only replaces it after confirmation', async ({ page }) => {
  await wardrobe(page);
  const card = page.locator('article').filter({ hasText: '测试上衣' });
  const originalImage = card.locator('img');
  await expect.poll(() => originalImage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(80);
  const originalBytes = await originalImage.evaluate(async (img: HTMLImageElement) => [...new Uint8Array(await (await fetch(img.src)).arrayBuffer())]);
  await card.getByRole('button', { name: '编辑', exact: true }).click();
  const saved = page.getByAltText('已保存的衣物照片');
  await expect(saved).toBeVisible();
  expect(await saved.evaluate(async (img: HTMLImageElement) => [...new Uint8Array(await (await fetch(img.src)).arrayBuffer())])).toEqual(originalBytes);
  const input = page.getByLabel('衣物照片（可选）');
  expect(await input.evaluate((element: HTMLInputElement) => element.files?.length)).toBe(0);
  await input.dispatchEvent('cancel', { bubbles: true, cancelable: false });
  await expect(saved).toBeVisible();
  await page.getByLabel('材质（可选）').fill('保留原照片的修改');
  await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload(); await card.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(saved).toBeVisible();
  expect(await saved.evaluate(async (img: HTMLImageElement) => [...new Uint8Array(await (await fetch(img.src)).arrayBuffer())])).toEqual(originalBytes);
  await input.setInputFiles(await photo(page, 'blue', 60, 90));
  await expect(page.getByAltText('照片预览')).toBeVisible(); await expect(saved).toHaveCount(0);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await card.getByRole('button', { name: '编辑', exact: true }).click(); await expect(saved).toBeVisible();
  expect(await saved.evaluate(async (img: HTMLImageElement) => [...new Uint8Array(await (await fetch(img.src)).arrayBuffer())])).toEqual(originalBytes);
  await input.setInputFiles(await photo(page, 'blue', 60, 90)); await expect(page.getByAltText('照片预览')).toBeVisible();
  await page.getByRole('button', { name: '确认保存' }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload(); await card.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(saved).toBeVisible();
  await expect.poll(() => saved.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(60);
});

test('decode failure is explicit; leaving the page releases every card URL', async ({ page }) => {
  await wardrobe(page);
  await page.evaluate(() => {
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    const state = { created: [] as string[], revoked: [] as string[] };
    (window as unknown as { cardUrls: typeof state }).cardUrls = state;
    URL.createObjectURL = () => { const url = create(new Blob(['invalid image'], { type: 'image/jpeg' })); state.created.push(url); return url; };
    URL.revokeObjectURL = url => { state.revoked.push(url); revoke(url); };
  });
  await generate(page);
  await expect(page.getByText('图片读取失败', { exact: true })).toHaveCount(3);
  await expect(page.locator('.outfit-item img')).toHaveCount(0);
  const cardUrls = await page.evaluate(() => [...(window as unknown as { cardUrls: { created: string[] } }).cardUrls.created]);
  expect(cardUrls.length).toBeGreaterThanOrEqual(3);
  await page.getByRole('link', { name: '我的衣橱', exact: true }).click();
  await expect(page.getByRole('button', { name: '＋ 添加衣物' })).toBeVisible();
  await expect.poll(() => page.evaluate(urls => {
    const { revoked } = (window as unknown as { cardUrls: { revoked: string[] } }).cardUrls;
    return urls.every(url => revoked.includes(url));
  }, cardUrls)).toBe(true);
});

test('image loading is announced; late decode after mode switch cannot show old images', async ({ page }) => {
  await wardrobe(page);
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!.set!;
    // Delay img src assignment, leaving real storage and recommendation services intact.
    Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, set(value: string) { setTimeout(() => setter.call(this, value), 500); } });
    const set = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      if (this instanceof HTMLImageElement && name === 'src') { setTimeout(() => set.call(this, name, value), 500); return; }
      return set.call(this, name, value);
    };
  });
  await generate(page);
  await expect(page.getByText('图片加载中…', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '切换示例模式' }).click();
  await page.getByRole('button', { name: '使用示例天气' }).click();
  await page.getByRole('button', { name: '生成穿搭' }).click();
  await expect(page.locator('.outfit-item img').first()).toBeVisible();
  await expect(page.locator('.outfit-item').filter({ hasText: '测试上衣' })).toHaveCount(0);
});

test('replace photo invalidates old batch; regenerated card reads new image, exclusion removes it', async ({ page }) => {
  await wardrobe(page); await generate(page); await checkImages(page);
  await page.getByRole('link', { name: '我的衣橱', exact: true }).click();
  const card = page.locator('article').filter({ hasText: '测试上衣' });
  await card.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('衣物照片（可选）').setInputFiles(await photo(page, 'purple', 60, 90));
  await expect(page.getByAltText('照片预览')).toBeVisible(); await page.getByRole('button', { name: '确认保存' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: '穿搭推荐', exact: true }).click();
  await expect(page.locator('.outfit-item')).toHaveCount(0);
  await page.getByRole('button', { name: '使用示例天气' }).click(); await page.getByRole('button', { name: '生成穿搭' }).click();
  await checkImages(page);
  expect(await page.getByRole('img', { name: '测试上衣', exact: true }).evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([60, 90]);
  await page.getByRole('link', { name: '我的衣橱', exact: true }).click(); await card.getByRole('button', { name: '排除推荐' }).click();
  await page.getByRole('link', { name: '穿搭推荐', exact: true }).click();
  await page.getByRole('button', { name: '使用示例天气' }).click(); await page.getByRole('button', { name: '生成穿搭' }).click();
  await expect(page.locator('.outfit-item')).toHaveCount(0); await expect(page.getByRole('alert').filter({ hasText: '可用衣物不足' })).toBeVisible();
});

test('cold weather fixture renders both dress and separates with the stored coat', async ({ page }) => {
  await wardrobe(page);
  for (const [name, category, color] of [['测试连衣裙', 'dress', 'orange'], ['测试外套', 'outerwear', 'black']]) {
    await page.getByRole('button', { name: '＋ 添加衣物' }).click();
    await page.getByLabel('名称').fill(name); await page.getByLabel('颜色').fill(color);
    await page.getByLabel('类别').selectOption(category); await page.getByLabel('保暖程度').selectOption('warm');
    await page.getByLabel('衣物照片（可选）').setInputFiles(await photo(page, color));
    await expect(page.getByAltText('照片预览')).toBeVisible(); await page.getByRole('button', { name: '确认保存' }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ status: 200, json: {
    current_units: { temperature_2m: '°C', apparent_temperature: '°C' },
    current: { time: Math.floor(Date.now() / 1000), temperature_2m: 5, apparent_temperature: 4, weather_code: 3 }
  } }));
  await page.getByRole('link', { name: '穿搭推荐', exact: true }).click();
  await page.getByRole('button', { name: '查看天气', exact: true }).click();
  await expect(page.getByText('5°C · 体感 4°C')).toBeVisible(); await page.getByRole('button', { name: '生成穿搭' }).click();
  const articles = page.locator('.outfit-panel article'); await expect(articles).toHaveCount(2);
  const combinations: string[][] = [];
  for (const article of await articles.all()) {
    const names = await article.locator('figcaption').allTextContents(); combinations.push(names.sort());
    expect(names).toContain('测试外套'); expect(names).toContain('测试鞋');
    for (const image of await article.locator('img').all()) {
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    }
  }
  expect(combinations).toEqual(expect.arrayContaining([
    ['测试连衣裙', '测试鞋', '测试外套'].sort(), ['测试上衣', '测试下装', '测试鞋', '测试外套'].sort()
  ]));
});
