import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { POST as recognize } from '@/app/api/recognition/route';
import { POST as analyze } from '@/app/api/inspiration/analyze/route';
import { POST as recommend } from '@/app/api/recommendation/route';
import { testGarment } from '../fixtures/recommendation';
import { readFileSync } from 'node:fs';

const fixture = readFileSync('tests/fixtures/generated-ui.jpg');
const routes = [
  { name: '衣物识别', post: recognize, request: () => {
    const form = new FormData(); form.set('image', new File([fixture], 'garment.jpg', { type: 'image/jpeg' }));
    return new Request('http://127.0.0.1:3000/api/recognition', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }, body: form });
  } },
  { name: '灵感分析', post: analyze, request: () => {
    const form = new FormData(); form.set('image', new File([fixture], 'inspiration.jpg', { type: 'image/jpeg' }));
    return new Request('http://127.0.0.1:3000/api/inspiration/analyze', { method: 'POST', body: form });
  } },
  { name: '推荐', post: recommend, request: () => new Request('http://127.0.0.1:3000/api/recommendation', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wardrobe: [testGarment('garment-1')], knowledge: { rules: ['颜色协调'] }, conditions: {} }),
  }) },
];

beforeEach(() => {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-only-openrouter-key');
  vi.stubEnv('AI_MODEL', 'test-vision-model');
  vi.stubEnv('AI_TIMEOUT_MS', '30000');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function expectFailure(response: Response, expected: { status: number; code: string; retryable: boolean }) {
  const body = await response.json();
  expect(response.status).toBe(expected.status);
  expect(body).toMatchObject({ ok: false, error: { code: expected.code, retryable: expected.retryable } });
  expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(body)).not.toContain('test-only-openrouter-key');
  expect(JSON.stringify(body)).not.toContain('private upstream detail');
  return body;
}

describe('OpenRouter 失败经过正式 API 路由的映射', () => {
  it.each(routes)('$name：供应商 429/5xx 使用通用错误并允许稍后重试', async ({ post, request }) => {
    for (const status of [429, 503]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private upstream detail', { status })));
      await expectFailure(await post(request()), { status: 502, code: 'AI_PROVIDER_ERROR', retryable: true });
    }
  });

  it.each(routes)('$name：网络断开映射为可重试的供应商错误', async ({ post, request }) => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed: private network detail')));
    await expectFailure(await post(request()), { status: 502, code: 'AI_PROVIDER_ERROR', retryable: true });
  });

  it.each(routes)('$name：上游超时映射为 504 且可重试', async ({ post, request }) => {
    const deadlines: AbortController[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const controller = new AbortController(); deadlines.push(controller); return controller.signal;
    });
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init.signal as AbortSignal;
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })));
    const pending = post(request());
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    deadlines[0].abort(new DOMException('deadline elapsed', 'TimeoutError'));
    await expectFailure(await pending, { status: 504, code: 'AI_TIMEOUT', retryable: true });
  });

  it.each(routes)('$name：错误响应格式映射为 502，且不允许自动重试', async ({ post, request }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ choices: [] })));
    await expectFailure(await post(request()), { status: 502, code: 'AI_INVALID_RESPONSE', retryable: false });
  });
});
