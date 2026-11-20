import { AIError, aiAvailable, analyzePreferenceReference } from '@/modules/recognition/infrastructure/ai-provider';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function allowedOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  if (origin === url.origin) return true;
  try {
    const source = new URL(origin);
    return LOCAL_HOSTS.has(url.hostname) && LOCAL_HOSTS.has(source.hostname)
      && source.protocol === url.protocol && source.port === url.port
      && source.origin === origin;
  } catch { return false; }
}

export async function POST(request: Request) {
  const requestId=crypto.randomUUID();
  const fail=(code:string,message:string,status:number,retryable=false)=>Response.json({ok:false,error:{code,message,retryable},requestId},{status});
  const url = new URL(request.url);
  if (!LOCAL_HOSTS.has(url.hostname)) return fail('AI_UNAVAILABLE','参考图分析尚未部署。',503);
  if (!allowedOrigin(request, url)) return fail('VALIDATION_ERROR','请求来源无效。',400);
  if (!aiAvailable()) return fail('AI_UNAVAILABLE','AI 服务尚未配置。',503);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) return fail('VALIDATION_ERROR','请选择参考图。',400);
  if (Number(request.headers.get('content-length')??0)>5*1024*1024) return fail('IMAGE_TOO_LARGE','参考图过大。',413);
  try {
    const form=await request.formData();const image=form.get('image');
    if ([...form.keys()].some(key=>key!=='image')||!(image instanceof File)||!image.size||image.size>4*1024*1024||!['image/jpeg','image/png','image/webp'].includes(image.type)) return fail('VALIDATION_ERROR','请上传不超过 4 MB 的 JPEG、PNG 或 WebP 图片。',400);
    const bytes=new Uint8Array(await image.slice(0,12).arrayBuffer());
    const jpeg=image.type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const png=image.type==='image/png'&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
    const webp=image.type==='image/webp'&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    if(!jpeg&&!png&&!webp)return fail('VALIDATION_ERROR','参考图格式无效。',400);
    const result=await analyzePreferenceReference(image,request.signal);
    return Response.json({ok:true,data:result,requestId});
  }catch(e){if(e instanceof AIError)return fail(e.code,e.message,e.code==='AI_TIMEOUT'?504:502,e.retryable);return fail('VALIDATION_ERROR','参考图分析失败。',400);}
}
