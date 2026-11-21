import 'server-only';
import { z } from 'zod';

const outputSchema = z.object({ data: z.array(z.object({ b64_json: z.string().min(1), media_type: z.string().optional() })).min(1), usage: z.object({ cost: z.number().finite().nonnegative().optional() }).optional() });

export async function removeBackgroundWithOpenRouter(image: Blob, signal?: AbortSignal): Promise<{ bytes: Uint8Array; type: string; costUsd?: number }> {
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_BACKGROUND_MODEL;
  if (!key || !model) throw new Error('在线白底模型尚未配置。');
  const configured = Number(process.env.AI_BACKGROUND_TIMEOUT_MS ?? '120000');
  const timeoutMs = Number.isSafeInteger(configured) && configured > 0 && configured <= 180000 ? configured : 120000;
  const deadline = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/images', {
      method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, n: 1,
        prompt: 'Use the supplied photo as an exact product reference. Show ONLY the visible clothing item on a solid pure white (#FFFFFF) background. Remove everything that is not physically part of the garment: the original background, hanger, display stand, pole, hook, loose price tag, furniture, plants, screenshot borders and gallery controls. Keep all garment parts, including the collar, seams, buttons, zipper, drawstrings, straps and sewn-in labels. Preserve the original garment shape, proportions, orientation, color, pattern, fabric texture, folds and visible details. Do not redesign, recolor, smooth out details, invent hidden parts, crop the garment, or add shadows, props or text. Return one image.',
        input_references: [{ type: 'image_url', image_url: { url: `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString('base64')}` } }]
      })
    });
  } catch {
    if (deadline.aborted) throw new Error('在线白底处理超时，请重试。');
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
    throw new Error('在线白底服务暂不可用，请重试。');
  }
  if (!response.ok) throw new Error('在线白底服务请求失败，请重试。');
  const parsed = outputSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('在线白底服务未返回图片。');
  const encoded = parsed.data.data[0].b64_json;
  if (encoded.length > 18 * 1024 * 1024) throw new Error('在线白底结果过大。');
  const bytes = Buffer.from(encoded, 'base64');
  const type = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : '';
  if (!type || !bytes.length || bytes.length > 12 * 1024 * 1024) throw new Error('在线白底结果不是有效图片。');
  return { bytes, type, costUsd: parsed.data.usage?.cost };
}
