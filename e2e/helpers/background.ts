import type { Page, Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Synthetic upstream image; exercises browser decoding and persistence without paid AI.
export const whiteImage = readFileSync(path.resolve('tests/fixtures/synthetic-white-shirt.png'));
export const backgroundResult = (route: Route) => route.fulfill({ contentType: 'image/png', body: whiteImage });
export async function mockBackground(page: Page) {
  await page.route('**/api/background/remove', backgroundResult);
}
