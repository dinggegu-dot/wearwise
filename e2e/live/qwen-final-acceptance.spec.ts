import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { testGarment } from '../../tests/fixtures/recommendation';

const image = readFileSync(path.resolve('tests/fixtures/synthetic-shirt.jpg'));
const categories = new Set(['top', 'bottom', 'outerwear', 'dress', 'shoes']);
const warmths = new Set(['light', 'medium', 'warm', 'unknown']);
const tagKinds = new Set(['color', 'style', 'fit', 'layering', 'scene']);
type ApiResponse<T> = { ok: boolean; data?: T; error?: { code: string; message: string } };

test('当前 Qwen 模型真实完成识图、灵感和推荐并符合 API Schema', async ({ request }) => {
  test.setTimeout(240000);
  const results: Array<Record<string, unknown>> = [];

  const recognitionStart = performance.now();
  const recognitionResponse = await request.post('/api/recognition', {
    multipart: { image: { name: 'synthetic-shirt.jpg', mimeType: 'image/jpeg', buffer: image } },
  });
  const recognition = await recognitionResponse.json() as ApiResponse<{ candidate: Record<string, unknown> }>;
  const recognitionMs = Math.round(performance.now() - recognitionStart);
  expect(recognitionResponse.status(), JSON.stringify(recognition)).toBe(200);
  if (!recognition.ok || !recognition.data) throw new Error(`识图 API 未成功：${JSON.stringify(recognition)}`);
  const candidate = recognition.data.candidate;
  expect(candidate.name).toEqual(expect.any(String)); expect((candidate.name as string).length).toBeGreaterThan(0);
  expect(categories.has(String(candidate.category))).toBe(true);
  expect(candidate.color).toEqual(expect.any(String)); expect(candidate.fit).toEqual(expect.any(String));
  expect(warmths.has(String(candidate.warmth))).toBe(true);
  expect(candidate.styleTags).toEqual(expect.any(Array)); expect(candidate.description).toEqual(expect.any(String));
  expect(candidate.warnings).toEqual(expect.any(Array));
  expect(candidate.candidateId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
  results.push({ task: 'recognition', elapsedMs: recognitionMs, schema: 'PASS', candidate: {
    name: candidate.name, category: candidate.category, color: candidate.color, fit: candidate.fit,
    warmth: candidate.warmth, material: candidate.material, styleTags: candidate.styleTags,
    description: candidate.description, warnings: candidate.warnings,
  } });

  const inspirationStart = performance.now();
  const inspirationResponse = await request.post('/api/inspiration/analyze', {
    multipart: { image: { name: 'synthetic-shirt.jpg', mimeType: 'image/jpeg', buffer: image } },
  });
  const inspiration = await inspirationResponse.json() as ApiResponse<{ name: string; tags: Array<{ text: string; kind: string }>; analysis: string }>;
  const inspirationMs = Math.round(performance.now() - inspirationStart);
  expect(inspirationResponse.status(), JSON.stringify(inspiration)).toBe(200);
  if (!inspiration.ok || !inspiration.data) throw new Error(`灵感分析 API 未成功：${JSON.stringify(inspiration)}`);
  expect(inspiration.data.name.length).toBeGreaterThan(0);
  expect(inspiration.data.analysis.length).toBeGreaterThan(0);
  expect(Array.isArray(inspiration.data.tags)).toBe(true);
  for (const tag of inspiration.data.tags) {
    expect(tag.text.length).toBeGreaterThan(0); expect(tagKinds.has(tag.kind)).toBe(true);
  }
  results.push({ task: 'inspiration', elapsedMs: inspirationMs, schema: 'PASS', result: inspiration.data });

  const wardrobe = [
    testGarment('test-shirt-01', { name: '虚构白衬衫', category: 'top', color: '白色', styleTags: ['简约'] }),
    testGarment('test-trousers-02', { name: '虚构深色长裤', category: 'bottom', color: '深蓝', styleTags: ['日常'] }),
  ];
  const recommendationStart = performance.now();
  const recommendationResponse = await request.post('/api/recommendation', {
    data: { wardrobe, knowledge: { rules: ['颜色协调', '适合日常'] }, conditions: { scene: '日常通勤' } },
  });
  const recommendation = await recommendationResponse.json() as ApiResponse<{ garmentIds: string[]; reason: string }>;
  const recommendationMs = Math.round(performance.now() - recommendationStart);
  expect(recommendationResponse.status(), JSON.stringify(recommendation)).toBe(200);
  if (!recommendation.ok || !recommendation.data) throw new Error(`推荐 API 未成功：${JSON.stringify(recommendation)}`);
  expect(recommendation.data.garmentIds.length).toBeGreaterThan(0);
  expect(recommendation.data.garmentIds.every(id => wardrobe.some(item => item.id === id))).toBe(true);
  expect(recommendation.data.reason.trim().length).toBeGreaterThan(0);
  results.push({ task: 'recommendation', elapsedMs: recommendationMs, schema: 'PASS', result: recommendation.data });

  const record = { model: 'qwen/qwen3.8-max-0902', results };
  console.info(`REAL_OPENROUTER_ACCEPTANCE ${JSON.stringify(record)}`);
  await test.info().attach('qwen-openrouter-acceptance.json', { body: JSON.stringify(record, null, 2), contentType: 'application/json' });
});
