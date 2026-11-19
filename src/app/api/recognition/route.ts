import { AIError, aiAvailable, recognizeGarment } from '@/modules/recognition/infrastructure/ai-provider';
const MAX_BODY = 5 * 1024 * 1024, MAX_FILE = 4 * 1024 * 1024;
const statuses: Record<string, number> = { AI_UNAVAILABLE:503, AI_TIMEOUT:504, AI_PROVIDER_ERROR:502, AI_INVALID_RESPONSE:502 };
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const failure = (code:string,message:string,status:number,retryable=false) => Response.json({ok:false,error:{code,message,retryable},requestId},{status});
  const requestUrl = new URL(request.url), host = request.headers.get('host') ?? '';
  let hostname = ''; try { hostname = new URL(`http://${host}`).hostname; } catch { return failure('VALIDATION_ERROR','请求地址无效。',400); }
  const forwardedHost = request.headers.get('x-forwarded-host')?.trim().toLowerCase();
  if (!['127.0.0.1','localhost'].includes(hostname) || (forwardedHost && forwardedHost !== host.toLowerCase())) return failure('RECOGNITION_UNAVAILABLE','图片识别仅支持本地运行。',503);
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.protocol !== requestUrl.protocol || originUrl.host.toLowerCase() !== host.toLowerCase() || originUrl.username || originUrl.password) return failure('VALIDATION_ERROR','请求来源无效。',400);
    } catch { return failure('VALIDATION_ERROR','请求来源无效。',400); }
  }
  if (!aiAvailable()) return failure('RECOGNITION_UNAVAILABLE','图片识别暂未配置，请手动录入。',503);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) return failure('VALIDATION_ERROR','请选择 JPEG 图片。',400);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return failure('IMAGE_TOO_LARGE','图片过大。',413);
  if (!request.body) return failure('VALIDATION_ERROR','请选择 JPEG 图片。',400);
  try {
    const reader = request.body.getReader(), chunks:Uint8Array[]=[]; let size=0;
    while (true) { const {value,done}=await reader.read(); if(done) break; size+=value.byteLength; if(size>MAX_BODY) { await reader.cancel(); return failure('IMAGE_TOO_LARGE','图片过大。',413); } chunks.push(value); }
    const body = new Uint8Array(size); let offset=0; for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
    const parsed = await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')!},body}).formData();
    const fields = [...parsed.entries()]; const image = parsed.get('image');
    if (fields.length !== 1 || !(image instanceof File) || image.type !== 'image/jpeg' || !image.size) return failure('VALIDATION_ERROR','请选择 JPEG 图片。',400);
    if (image.size > MAX_FILE) return failure('IMAGE_TOO_LARGE','图片过大。',413);
    const bytes = Buffer.from(await image.arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return failure('VALIDATION_ERROR','图片格式无效。',400);
    // 使用 Next 已锁定的可选 sharp 解码；不可用时关闭识别，不向模型发送未经验证的图片。
    let sharp: typeof import('sharp').default;
    try { sharp = (await import('sharp')).default; }
    catch { return failure('RECOGNITION_UNAVAILABLE','图片解码组件不可用，请手动录入。',503); }
    try {
      const decoder = sharp(bytes, { failOn:'warning', limitInputPixels: 2_560_000 });
      const metadata = await decoder.metadata();
      if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height || metadata.width > 1600 || metadata.height > 1600) throw new Error('invalid dimensions');
      await decoder.raw().toBuffer();
    } catch { return failure('VALIDATION_ERROR','图片损坏或尺寸无效，请重新选择。',400); }
    const candidate = await recognizeGarment(image,request.signal);
    return Response.json({ok:true,data:{candidate},requestId});
  } catch (error) {
    if (error instanceof AIError) return failure(error.code,error.message,statuses[error.code] ?? 502,error.retryable);
    return failure('VALIDATION_ERROR','图片处理失败，请重试或手动录入。',400);
  }
}
