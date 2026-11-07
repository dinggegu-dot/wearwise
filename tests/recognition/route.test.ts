import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { POST } from '@/app/api/recognition/route';
import { GET } from '@/app/api/capabilities/route';
import { recognizeWithQwen } from '@/modules/recognition/infrastructure/qwen';
import { readFileSync } from 'node:fs';
const stubImage = readFileSync('tests/fixtures/generated-ui.jpg');
function request(file = new File([stubImage], 'photo.jpg', {type:'image/jpeg'})) {
  const form = new FormData(); form.set('image',file);
  return new Request('http://127.0.0.1:3000/api/recognition',{method:'POST',headers:{host:'127.0.0.1:3000',origin:'http://127.0.0.1:3000'},body:form});
}
beforeEach(() => { (globalThis as unknown as Record<symbol, number>)[Symbol.for('wearwise.qwen.calls')] = 0; vi.stubEnv('AI_ENABLE','0'); vi.stubEnv('DASHSCOPE_API_KEY',''); vi.stubEnv('QWEN_MODEL',''); vi.stubEnv('AI_MAX_CALLS_PER_PROCESS','0'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function enable() { vi.stubEnv('AI_ENABLE','1'); vi.stubEnv('DASHSCOPE_API_KEY','test-not-a-real-key'); vi.stubEnv('QWEN_MODEL','test-model'); vi.stubEnv('QWEN_BASE_URL','https://dashscope.aliyuncs.com/compatible-mode/v1'); vi.stubEnv('AI_MAX_CALLS_PER_PROCESS','99'); }
describe('识别 HTTP 及模型边界',()=>{
 it('未配置时清楚不可用，且无上游请求',async()=>{
  const fetcher=vi.fn(); vi.stubGlobal('fetch',fetcher);
  expect((await (await GET()).json()).recognition.available).toBe(false);
  const response=await POST(request()); expect(response.status).toBe(503); expect((await response.json()).error.code).toBe('RECOGNITION_UNAVAILABLE'); expect(fetcher).not.toHaveBeenCalled();
 });
 it('无效图片拒绝且不调用模型',async()=>{
  enable(); const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const response=await POST(request(new File(['invalid'],'x.jpg',{type:'image/jpeg'})));
  expect(response.status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
 });
 it('JPEG 头部伪装的损坏图片不会触发计费请求',async()=>{
  enable(); const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const response=await POST(request(new File([new Uint8Array([0xff,0xd8,0xff,0xd9])],'broken.jpg',{type:'image/jpeg'})));
  expect(response.status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
 });
 it('有效候选经严格校验，正式 ID 在应用层生成',async()=>{
  enable();const candidate={name:'白衬衫',category:'top',color:'白',warmth:'unknown',styleTags:[],warnings:[]};
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({kind:'garment',candidate})}}]})));
  vi.stubGlobal('fetch',fetcher);const response=await POST(request());const body=await response.json();
  expect(response.status).toBe(200);expect(body.data.candidate).toMatchObject(candidate);expect(body.data.candidate.candidateId).toMatch(/^[0-9a-f-]{36}$/);expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('进程调用上限阻止第二次上游请求',async()=>{
  enable();vi.stubEnv('AI_MAX_CALLS_PER_PROCESS','1');
  const candidate={name:'白衬衫',category:'top',color:'白',warmth:'unknown',styleTags:[],warnings:[]};
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({kind:'garment',candidate})}}]})));
  vi.stubGlobal('fetch',fetcher);expect((await POST(request())).status).toBe(200);
  const next=await POST(request());expect(next.status).toBe(429);expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('跨来源请求不可触发模型',async()=>{
  enable();const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const form=new FormData();form.set('image',new File([stubImage],'photo.jpg',{type:'image/jpeg'}));
  const response=await POST(new Request('http://127.0.0.1:3000/api/recognition',{method:'POST',headers:{host:'127.0.0.1:3000',origin:'https://example.com'},body:form}));
  expect(response.status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
 });
 it('非衣物及多主体结果清楚拒绝且不创建候选',async()=>{
  enable(); const responses=['no_garment','ambiguous'].map(kind=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({kind,message:'无法判断'})}}]})));
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(responses[0]).mockResolvedValueOnce(responses[1]));
  for (const code of ['NO_GARMENT','AMBIGUOUS_IMAGE']) {
   const response=await POST(request());const body=await response.json();
   expect(response.status).toBe(422);expect(body.error.code).toBe(code);expect(body.data).toBeUndefined();
  }
 });
 it('识别超时与用户取消都会中止上游请求',async()=>{
  enable();const deadlines:AbortController[]=[];
  vi.spyOn(AbortSignal,'timeout').mockImplementation(()=>{const controller=new AbortController();deadlines.push(controller);return controller.signal;});
  vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise((_resolve,reject)=>{
   const signal=init.signal as AbortSignal;
   if(signal.aborted) reject(signal.reason); else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
  })));
  const timeout=recognizeWithQwen(new Blob([stubImage]));
  await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));
  deadlines[0].abort(new DOMException('timeout','TimeoutError'));
  await expect(timeout).rejects.toMatchObject({code:'MODEL_TIMEOUT'});
  const user=new AbortController();const cancel=recognizeWithQwen(new Blob([stubImage]),user.signal);
  await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
  user.abort(new DOMException('cancel','AbortError'));
  await expect(cancel).rejects.toMatchObject({name:'AbortError'});
 });
 it('超出模型接口图片大小上限时不请求上游',async()=>{
  enable();const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const response=await POST(request(new File([new Uint8Array(4*1024*1024+1)],'large.jpg',{type:'image/jpeg'})));
  expect(response.status).toBe(413);expect((await response.json()).error.code).toBe('IMAGE_TOO_LARGE');expect(fetcher).not.toHaveBeenCalled();
 });
 it('无效模型字段不返回候选且不泄露供应商信息',async()=>{
  enable();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({kind:'garment',candidate:{name:'x',category:'spaceship'}})}}]}))));
  const response=await POST(request());const body=await response.json(); expect(response.status).toBe(502);expect(body.error.code).toBe('MODEL_INVALID_RESPONSE');expect(JSON.stringify(body)).not.toContain('test-not-a-real-key');
 });
});
