import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { POST } from '@/app/api/recommendation/route';
import { testGarment } from '../fixtures/recommendation';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const garment = testGarment('shirt-1');
const valid = { wardrobe: [garment], knowledge: { version: 'r1', rules: ['颜色协调'] }, conditions: { scene: '日常通勤' } };
const request = (body: unknown) => new Request('http://127.0.0.1:3000/api/recommendation', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const modelResponse = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
const reference = new File([readFileSync(path.resolve('tests/fixtures/synthetic-shirt.jpg'))], 'shirt.jpg', { type: 'image/jpeg' });
const multipart = (body: unknown, files: Array<[string, File]>) => {
  const form = new FormData(); form.set('input', JSON.stringify(body));
  for (const [id, file] of files) form.append(`image:${id}`, file);
  return new Request('http://127.0.0.1:3000/api/recommendation', { method: 'POST', body: form });
};

describe('第 3 轮推荐输入边界', () => {
  beforeEach(() => { vi.stubEnv('OPENROUTER_API_KEY', 'test-key'); vi.stubEnv('AI_MODEL', 'test-model'); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('完整验证第二轮衣物，仅把允许字段与已启用条件发送给模型', async () => {
    const fetcher = vi.fn().mockResolvedValue(modelResponse({ garmentIds: ['shirt-1'], reason: '颜色协调' }));
    vi.stubGlobal('fetch', fetcher);
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ garmentIds: ['shirt-1'], reason: '颜色协调' });
    const prompt = JSON.parse(fetcher.mock.calls[0][1].body).messages[0].content[0].text as string;
    expect(prompt).toContain('"scene":"日常通勤"');
    expect(prompt).not.toContain('createdAt');
    expect(prompt).not.toContain('sourceType');
    expect(prompt).not.toContain('pause');
    expect(prompt).not.toContain('imageId');
  });

  it.each([
    ['暂停衣物', { ...valid, wardrobe: [testGarment('shirt-1', { pause: { since: '2026-11-10T00:00:00.000Z', resumeOn: '2099-01-01' } })] }],
    ['已删除衣物', { ...valid, wardrobe: [testGarment('shirt-1', { deletedAt: '2026-11-10T00:00:00.000Z' })] }],
    ['重复衣物', { ...valid, wardrobe: [garment, garment] }],
    ['不完整衣物', { ...valid, wardrobe: [{ id: 'shirt-1' }] }],
    ['未知条件', { ...valid, conditions: { scene: '通勤', disabledWeather: '深圳晴天' } }],
    ['未知知识字段', { ...valid, knowledge: { rules: ['颜色协调'], privateNotes: '不要发送' } }],
    ['空知识', { ...valid, knowledge: { rules: [] } }],
  ])('拒绝%s且不调用模型', async (_name, input) => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const response = await POST(request(input));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('拒绝模型返回重复或衣橱外的 ID', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(modelResponse({ garmentIds: ['shirt-1', 'shirt-1'], reason: '重复' }))
      .mockResolvedValueOnce(modelResponse({ garmentIds: ['other'], reason: '不存在' }));
    vi.stubGlobal('fetch', fetcher);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await POST(request(valid));
      expect(response.status).toBe(502);
      expect((await response.json()).error.code).toBe('AI_INVALID_RESPONSE');
    }
  });

  it('参考图是本次喜好唯一启用条件时，把实际图片送给模型且不发送本地图片 ID', async () => {
    const fetcher = vi.fn().mockResolvedValue(modelResponse({ garmentIds: ['shirt-1'], reason: '参考图的简约风格' }));
    vi.stubGlobal('fetch', fetcher);
    const input = { ...valid, conditions: { preference: { text: '', imageIds: ['reference-1'] } } };
    const response = await POST(multipart(input, [['reference-1', reference]]));
    expect(response.status).toBe(200);
    expect((await response.json()).data.garmentIds).toEqual(['shirt-1']);
    const content = JSON.parse(fetcher.mock.calls[0][1].body).messages[0].content;
    expect(content[0].text).toContain('"referenceImageCount":1');
    expect(content[0].text).not.toContain('reference-1');
    expect(content[1]).toMatchObject({ type: 'image_url', image_url: { url: expect.stringMatching(/^data:image\/jpeg;base64,/) } });
  });

  it.each([
    ['只有图片 ID，没有图片', request({ ...valid, conditions: { preference: { text: '', imageIds: ['reference-1'] } } })],
    ['图片与启用 ID 不符', multipart({ ...valid, conditions: { preference: { text: '', imageIds: ['reference-1'] } } }, [['other', reference]])],
    ['关闭喜好却附加图片', multipart(valid, [['reference-1', reference]])],
    ['伪装图片类型', multipart({ ...valid, conditions: { preference: { text: '', imageIds: ['reference-1'] } } }, [['reference-1', new File(['not an image'], 'fake.jpg', { type: 'image/jpeg' })]])],
    ['试图提供远程地址', request({ ...valid, conditions: { preference: { text: '', imageIds: ['reference-1'], imageUrl: 'https://example.com/photo.jpg' } } })],
  ])('拒绝%s，且不向 OpenRouter 发送请求', async (_name, input) => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const response = await POST(input);
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
