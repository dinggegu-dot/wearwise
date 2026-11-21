import { removeBackgroundWithOpenRouter } from '@/modules/media/openrouter-background-server';

const MAX_BODY = 5 * 1024 * 1024;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function allowedOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  if (origin === url.origin) return true;
  try {
    const source = new URL(origin);
    // Next dev can normalize a 127.0.0.1 request URL to localhost. These two
    // loopback names are equivalent only on the same scheme and port.
    return LOCAL_HOSTS.has(url.hostname) && LOCAL_HOSTS.has(source.hostname)
      && source.protocol === url.protocol && source.port === url.port
      && source.origin === origin;
  } catch { return false; }
}

async function boundedFormData(request: Request): Promise<FormData> {
  if (!request.body) throw new Error('请选择衣物图片。');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw new Error('图片过大。');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new Request(request.url, { method: 'POST', headers: { 'content-type': request.headers.get('content-type')! }, body }).formData();
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const fail = (code: string, message: string, status: number) => Response.json({ ok: false, error: { code, message, retryable: status >= 500 }, requestId }, { status });
  // Until the team deploys an authenticated server, never expose a paid image endpoint publicly.
  const url = new URL(request.url);
  if (!LOCAL_HOSTS.has(url.hostname)) return fail('AI_UNAVAILABLE', '在线白底处理尚未部署。', 503);
  if (!allowedOrigin(request, url)) return fail('VALIDATION_ERROR','请求来源无效。',400);
  if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_BACKGROUND_MODEL) return fail('AI_UNAVAILABLE', '在线白底模型尚未配置。', 503);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) return fail('VALIDATION_ERROR', '请选择衣物图片。', 400);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return fail('IMAGE_TOO_LARGE', '图片过大。', 413);
  try {
    const form = await boundedFormData(request);
    const image = form.get('image');
    if ([...form.keys()].some(key => key !== 'image') || !(image instanceof File) || image.type !== 'image/jpeg' || !image.size || image.size > 4 * 1024 * 1024)
      return fail('VALIDATION_ERROR', '请上传不超过 4 MB 的 JPEG 图片。', 400);
    const bytes=new Uint8Array(await image.slice(0,3).arrayBuffer());
    if(bytes.length<3||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255) return fail('VALIDATION_ERROR','图片格式无效。',400);
    const result = await removeBackgroundWithOpenRouter(image, request.signal);
    return new Response(new Uint8Array(result.bytes).buffer, { headers: { 'Content-Type': result.type, 'Cache-Control': 'no-store', 'X-Request-Id': requestId, 'X-OpenRouter-Model': process.env.OPENROUTER_BACKGROUND_MODEL!, ...(result.costUsd === undefined ? {} : { 'X-OpenRouter-Cost-USD': String(result.costUsd) }) } });
  } catch (error) {
    if (request.signal.aborted) return fail('AI_CANCELLED', '图片处理已取消。', 499);
    const message = error instanceof Error ? error.message : '在线白底处理失败。';
    if (message === '图片过大。') return fail('IMAGE_TOO_LARGE', message, 413);
    return fail(message.includes('超时') ? 'AI_TIMEOUT' : 'AI_PROVIDER_ERROR', message, message.includes('超时') ? 504 : 502);
  }
}
