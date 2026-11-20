import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { POST } from '@/app/api/preference/analyze/route';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('本次喜好参考图分析草稿', () => {
  it('本机别名可调用，其他来源无法触发付费分析', async () => {
    vi.stubEnv('OPENROUTER_API_KEY','placeholder'); vi.stubEnv('AI_MODEL','test-vision');
    const fetcher=vi.fn(); vi.stubGlobal('fetch',fetcher);
    const request=(origin:string) => {
      const form=new FormData(); form.set('junk','x');
      return new Request('http://localhost:3197/api/preference/analyze',{method:'POST',headers:{origin},body:form});
    };
    const local=await POST(request('http://127.0.0.1:3197'));
    expect((await local.json()).error.message).toBe('请上传不超过 4 MB 的 JPEG、PNG 或 WebP 图片。');
    for (const origin of ['http://127.0.0.1:3198','https://example.com','null']) {
      const response=await POST(request(origin));
      expect((await response.json()).error.message).toBe('请求来源无效。');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('把视觉分析作为可修改的文字和固定风格标签返回', async () => {
    vi.stubEnv('OPENROUTER_API_KEY','placeholder'); vi.stubEnv('AI_MODEL','test-vision');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({ choices:[{ message:{ content:JSON.stringify({text:'图中有蓝白配色和层次',styleTags:['Minimalist Style','Y2K']}) } }] })));
    const form=new FormData();form.set('image',new File([new Uint8Array([255,216,255,217])],'photo.jpg',{type:'image/jpeg'}));
    const response=await POST(new Request('http://127.0.0.1:3000/api/preference/analyze',{method:'POST',body:form}));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({text:'图中有蓝白配色和层次；其他观察：Y2K',styleTags:['简约风']});
  });
  it('缺少配置时不发送图片', async () => {
    vi.stubEnv('OPENROUTER_API_KEY',''); vi.stubEnv('AI_MODEL',''); const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    const form=new FormData();form.set('image',new File(['x'],'photo.jpg',{type:'image/jpeg'}));
    const response=await POST(new Request('http://127.0.0.1:3000/api/preference/analyze',{method:'POST',body:form}));
    expect(response.status).toBe(503);expect(fetcher).not.toHaveBeenCalled();
  });
});
