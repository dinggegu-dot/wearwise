import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { removeBackgroundWithOpenRouter } from '@/modules/media/openrouter-background-server';
import { POST } from '@/app/api/background/remove/route';

const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const image = () => new File([new Uint8Array([255,216,255,217])], 'item.jpg', { type: 'image/jpeg' });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('OpenRouter 白底图片入口', () => {
  it('本机 127.0.0.1 与 Next 规范化的 localhost 同端口互通，其他来源仍拒绝', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'placeholder'); vi.stubEnv('OPENROUTER_BACKGROUND_MODEL', 'test/image-model');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const request = (origin: string) => {
      const form = new FormData(); form.set('junk', 'x');
      return new Request('http://localhost:3197/api/background/remove', { method: 'POST', headers: { origin }, body: form });
    };
    const local = await POST(request('http://127.0.0.1:3197'));
    expect(local.status).toBe(400);
    expect((await local.json()).error.message).toBe('请上传不超过 4 MB 的 JPEG 图片。');
    for (const origin of ['http://127.0.0.1:3198', 'https://127.0.0.1:3197', 'https://example.com', 'null']) {
      const response = await POST(request(origin));
      expect(response.status).toBe(400);
      expect((await response.json()).error.message).toBe('请求来源无效。');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('未选模型时不发起付费请求', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'placeholder'); vi.stubEnv('OPENROUTER_BACKGROUND_MODEL', '');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const form = new FormData(); form.set('image', image());
    const response = await POST(new Request('http://127.0.0.1:3000/api/background/remove', { method: 'POST', body: form }));
    expect(response.status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  });
  it('请求没有 Content-Length 时仍拒绝超限文件，不调用付费接口', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'placeholder'); vi.stubEnv('OPENROUTER_BACKGROUND_MODEL', 'test/image-model');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const form = new FormData();
    form.set('image', new File([new Uint8Array(5 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' }));
    const response = await POST(new Request('http://127.0.0.1:3000/api/background/remove', { method: 'POST', body: form }));
    expect(response.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('使用独立模型 ID 调 OpenRouter 图片编辑接口，解析真实图片字节', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'placeholder'); vi.stubEnv('OPENROUTER_BACKGROUND_MODEL', 'test/image-model');
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: [{ b64_json: png.toString('base64'), media_type: 'image/png' }], usage: { cost: 0.01 } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await removeBackgroundWithOpenRouter(image());
    expect(result.type).toBe('image/png'); expect(Buffer.from(result.bytes).equals(png)).toBe(true); expect(result.costUsd).toBe(0.01);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/images');
    const request = JSON.parse(options.body);
    expect(request.model).toBe('test/image-model'); expect(request.input_references[0].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(request.prompt).toContain('pure white');
    expect(request.prompt).toContain('hanger, display stand');
    expect(request.prompt).toContain('buttons, zipper, drawstrings');
  });
  it('白底接口回传本次模型和实际费用，供效果比较', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'placeholder'); vi.stubEnv('OPENROUTER_BACKGROUND_MODEL', 'test/image-model');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: [{ b64_json: png.toString('base64') }], usage: { cost: 0.018 } })));
    const form = new FormData(); form.set('image', image());
    const response = await POST(new Request('http://127.0.0.1:3000/api/background/remove', { method: 'POST', body: form }));
    expect(response.status).toBe(200);
    expect(response.headers.get('X-OpenRouter-Model')).toBe('test/image-model');
    expect(response.headers.get('X-OpenRouter-Cost-USD')).toBe('0.018');
  });
  it('上游只返回文字或错误时拒绝保存为白底图', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'placeholder'); vi.stubEnv('OPENROUTER_BACKGROUND_MODEL', 'test/image-model');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '已抠图' } }] })));
    await expect(removeBackgroundWithOpenRouter(image())).rejects.toThrow('未返回图片');
  });
});
