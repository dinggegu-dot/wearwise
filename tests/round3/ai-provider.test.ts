import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { AIError, OpenRouterAdapter } from '@/modules/recognition/infrastructure/ai-provider';

beforeEach(() => {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-only-key');
  vi.stubEnv('AI_MODEL', 'test-vision-model');
  vi.stubEnv('AI_TIMEOUT_MS', '30000');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('OpenRouter adapter errors', () => {
  it('maps provider rejection to a generic provider error without leaking response details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider detail', { status: 429 })));
    await expect(new OpenRouterAdapter().complete('recommendation', 'prompt'))
      .rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR', message: '视觉模型请求失败。', retryable: true });
  });

  it('keeps authorization rejection non-retryable and never exposes provider details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider detail', { status: 401 })));
    await expect(new OpenRouterAdapter().complete('recommendation', 'prompt'))
      .rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR', message: '视觉模型请求失败。', retryable: false });
  });

  it('maps a network connection failure to a retryable provider error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('private network detail')));
    await expect(new OpenRouterAdapter().complete('recommendation', 'prompt'))
      .rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR', message: '视觉模型服务暂不可用。', retryable: true });
  });

  it('rejects malformed provider payloads as invalid responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ choices: [] })));
    await expect(new OpenRouterAdapter().complete('recommendation', 'prompt'))
      .rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  });

  it('maps request timeout and preserves user cancellation', async () => {
    const deadlines: AbortController[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const controller = new AbortController(); deadlines.push(controller); return controller.signal;
    });
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init.signal as AbortSignal;
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })));
    const adapter = new OpenRouterAdapter();
    const timedOut = adapter.complete('recommendation', 'prompt');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    deadlines[0].abort(new DOMException('timeout', 'TimeoutError'));
    await expect(timedOut).rejects.toMatchObject({ code: 'AI_TIMEOUT' });

    const user = new AbortController();
    const canceled = adapter.complete('recommendation', 'prompt', undefined, user.signal);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    user.abort(new DOMException('cancel', 'AbortError'));
    await expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reports missing local configuration without attempting a request', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(new OpenRouterAdapter().complete('recommendation', 'prompt'))
      .rejects.toBeInstanceOf(AIError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
