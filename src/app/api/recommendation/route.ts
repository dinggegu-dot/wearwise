import { z } from 'zod';
import { AIError, aiAvailable, recommend } from '@/modules/recognition/infrastructure/ai-provider';
import { garmentSchema, isCandidate } from '@/modules/wardrobe';
import { weatherSnapshotSchema } from '@/modules/session/schema';

// The caller supplies only enabled conditions. Unknown keys cannot reach the model.
const text = (max: number) => z.string().trim().min(1).max(max);
const knowledgeSchema = z.object({ version: text(100).optional(), rules: z.array(text(500)).min(1).max(100) }).strict();
const preferenceSchema = z.object({ text: z.string().trim().max(500), imageIds: z.array(text(100)).max(6) }).strict()
  .refine(value => !!value.text || value.imageIds.length > 0);
const conditionsSchema = z.object({
  memory: z.array(text(500)).max(100).optional(),
  weather: weatherSnapshotSchema.optional(),
  preference: preferenceSchema.optional(),
  scene: text(100).optional(),
  feedback: z.array(z.object({ choice: z.enum(['like', 'dislike']), reason: text(500) }).strict()).max(30).optional(),
}).strict();
const inputSchema = z.object({
  wardrobe: z.array(garmentSchema).min(1).max(200),
  knowledge: knowledgeSchema,
  conditions: conditionsSchema,
}).strict();

const MAX_BODY = 26 * 1024 * 1024;
const MAX_IMAGE = 4 * 1024 * 1024;
class InputError extends Error {}
async function readBody(request: Request): Promise<{ value: unknown; images: Map<string, File> }> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.startsWith('application/json')) return { value: await request.json(), images: new Map() };
  if (!contentType.startsWith('multipart/form-data;') || !request.body) throw new InputError('推荐请求格式无效。');
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) throw new InputError('推荐参考图过大。');
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw new InputError('推荐参考图过大。'); }
    chunks.push(value);
  }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  const form = await new Request(request.url, { method: 'POST', headers: { 'content-type': contentType }, body }).formData();
  const input = form.getAll('input');
  if (input.length !== 1 || typeof input[0] !== 'string' || input[0].length > 256 * 1024) throw new InputError('推荐输入格式无效。');
  const images = new Map<string, File>();
  for (const [key, value] of form) {
    if (key === 'input') continue;
    if (!key.startsWith('image:') || !(value instanceof File) || images.has(key.slice(6))) throw new InputError('推荐参考图格式无效。');
    images.set(key.slice(6), value);
  }
  return { value: JSON.parse(input[0]), images };
}
async function validImage(image: File): Promise<boolean> {
  if (!image.size || image.size > MAX_IMAGE) return false;
  const b = new Uint8Array(await image.slice(0, 12).arrayBuffer());
  return image.type === 'image/jpeg' && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
    || image.type === 'image/png' && b.slice(0, 8).every((v, i) => v === [137,80,78,71,13,10,26,10][i])
    || image.type === 'image/webp' && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const fail = (code: string, message: string, status: number, retryable = status === 504) =>
    Response.json({ ok: false, error: { code, message, retryable }, requestId }, { status });
  if (!aiAvailable()) return fail('AI_UNAVAILABLE', 'AI 服务尚未配置。', 503);
  try {
    const { value, images } = await readBody(request);
    const parsed = inputSchema.safeParse(value);
    if (!parsed.success) return fail('VALIDATION_ERROR', '推荐输入格式无效。', 400);
    const { wardrobe, knowledge, conditions } = parsed.data;
    const ids = conditions.preference?.imageIds ?? [];
    if (new Set(ids).size !== ids.length || ids.length !== images.size || ids.some(id => !images.has(id)))
      return fail('VALIDATION_ERROR', '本次喜好参考图须与启用的图片逐一对应。', 400);
    const referenceImages = ids.map(id => images.get(id)!);
    if (!(await Promise.all(referenceImages.map(validImage))).every(Boolean))
      return fail('VALIDATION_ERROR', '参考图须为不超过 4 MB 的 JPEG、PNG 或 WebP。', 400);
    if (new Set(wardrobe.map(item => item.id)).size !== wardrobe.length || wardrobe.some(item => !isCandidate(item)))
      return fail('VALIDATION_ERROR', '推荐衣橱包含重复、已删除或暂停的衣物。', 400);
    const allowed = new Set(wardrobe.map(item => item.id));
    // Do not send database metadata or pause history to the model.
    const modelWardrobe = wardrobe.map(({ id, name, category, color, fit, warmth, material, styleTags }) =>
      ({ id, name, category, color, fit, warmth, material, styleTags }));
    const modelConditions = conditions.preference
      ? { ...conditions, preference: { text: conditions.preference.text, referenceImageCount: referenceImages.length } }
      : conditions;
    const result = await recommend({ wardrobe: modelWardrobe, knowledge, conditions: modelConditions, referenceImages }, request.signal);
    if (result.garmentIds.some(id => !allowed.has(id)) || new Set(result.garmentIds).size !== result.garmentIds.length)
      return fail('AI_INVALID_RESPONSE', '推荐结果包含无效或重复衣物。', 502);
    return Response.json({ ok: true, data: result, requestId });
  } catch (e) {
    if (e instanceof AIError) return fail(e.code, e.message, e.code === 'AI_TIMEOUT' ? 504 : e.code === 'AI_UNAVAILABLE' ? 503 : 502, e.retryable);
    if (e instanceof InputError) return fail('VALIDATION_ERROR', e.message, 400);
    return fail('VALIDATION_ERROR', '推荐请求无效。', 400);
  }
}
