import { z } from 'zod';
import { AIError, aiAvailable, recommend } from '@/modules/recognition/infrastructure/ai-provider';
import {
  garmentSchema,
  isCandidate,
  categorySchema
} from '@/modules/wardrobe';
import { weatherSnapshotSchema, garmentSnapshotSchema } from '@/modules/session/schema';
import { readRecommendationKnowledge } from '@/modules/recommendation/knowledge';
import { STYLE_TAGS, SCENE_TAGS } from '@/shared/domain/tags';

export const runtime = 'nodejs';

// The caller supplies only enabled conditions. Unknown keys cannot reach the model.
const text = (max: number) => z.string().trim().min(1).max(max);

const preferenceSchema = z.object({ text: z.string().trim().max(500), imageIds: z.array(text(100)).max(6), styleTags: z.array(z.enum(STYLE_TAGS)).max(12).optional() }).strict()
  .refine(value => !!value.text || value.imageIds.length > 0 || !!value.styleTags?.length);
const selectedSceneSchema = z.object({ selected: z.enum(SCENE_TAGS).nullable(), custom: z.string().trim().max(100) }).strict();
const conditionsSchema = z.object({
  memory: z.array(text(500)).max(100).optional(),
  weather: weatherSnapshotSchema.optional(),
  preference: preferenceSchema.optional(),
  scene: z.union([text(100), selectedSceneSchema]).optional(),
  feedback: z.array(z.object({
  choice: z.enum(['like', 'dislike']),
  reason: z.string().trim().max(500)
}).strict()).max(30).optional(),
}).strict();

const operationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('swap-outfit'),
    currentGarmentIds: z.array(text(100)).min(1).max(8)
  }).strict(),

  z.object({
    kind: z.literal('swap-item'),
    currentGarmentIds: z.array(text(100)).min(1).max(8),
    targetGarmentId: text(100),
    targetCategory: categorySchema,
    keptGarments: z.array(garmentSnapshotSchema).max(7).optional()
  }).strict(),

  z.object({
    kind: z.literal('feedback-swap'),
    currentGarmentIds: z.array(text(100)).min(1).max(8)
  }).strict()
]);

const inputSchema = z.object({
  wardrobe: z.array(garmentSchema).min(1).max(200),
  conditions: conditionsSchema,
  operation: operationSchema.optional()
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
    const { wardrobe, conditions, operation } = parsed.data;

let knowledge: Awaited<ReturnType<typeof readRecommendationKnowledge>>;

try {
  knowledge = await readRecommendationKnowledge();
} catch {
  return fail(
    'KNOWLEDGE_UNAVAILABLE',
    '搭配知识文件暂时无法读取，请稍后重试。',
    500,
    true
  );
}
    const ids = conditions.preference?.imageIds ?? [];
    if (new Set(ids).size !== ids.length || ids.length !== images.size || ids.some(id => !images.has(id)))
      return fail('VALIDATION_ERROR', '本次喜好参考图须与启用的图片逐一对应。', 400);
    const referenceImages = ids.map(id => images.get(id)!);
    if (!(await Promise.all(referenceImages.map(validImage))).every(Boolean))
      return fail('VALIDATION_ERROR', '参考图须为不超过 4 MB 的 JPEG、PNG 或 WebP。', 400);
    if (new Set(wardrobe.map(item => item.id)).size !== wardrobe.length || wardrobe.some(item => !isCandidate(item)))
      return fail('VALIDATION_ERROR', '推荐衣橱包含重复、已删除或暂停的衣物。', 400);
    const allowed = new Set(wardrobe.map(item => item.id));
    if (operation?.kind === 'swap-item' && operation.keptGarments) {
      const keptIds = operation.keptGarments.map(item => item.id);
      const expected = operation.currentGarmentIds.filter(id => id !== operation.targetGarmentId);
      if (!operation.currentGarmentIds.includes(operation.targetGarmentId) || new Set(keptIds).size !== keptIds.length ||
          keptIds.length !== expected.length || !expected.every(id => keptIds.includes(id))) {
        return fail('VALIDATION_ERROR', '保留位置须与当前搭配一致。', 400);
      }
      for (const id of keptIds) allowed.add(id);
    }
    // Do not send database metadata or pause history to the model.
    const modelWardrobe = wardrobe.map(({ id, name, category, color, fit, warmth, material, styleTags, sceneTags, styleOther, sceneOther }) =>
      ({ id, name, category, color, fit, warmth, material, styleTags, sceneTags, styleOther, sceneOther }));
    const modelConditions = conditions.preference
      ? { ...conditions, preference: { text: conditions.preference.text, styleTags: conditions.preference.styleTags ?? [], referenceImageCount: referenceImages.length } }
      : conditions;
    const result = await recommend({
    wardrobe: modelWardrobe,
    knowledge,
    conditions: modelConditions,
    operation: operation?.kind === 'swap-item' && operation.keptGarments ? {
      ...operation,
      keptGarments: operation.keptGarments.map(({ id, name, category, color, fit, warmth, material, styleTags, sceneTags }) =>
        ({ id, name, category, color, fit, warmth, material, styleTags, sceneTags }))
    } : operation,
    referenceImages
    }, request.signal);
    if (result.garmentIds.some(id => !allowed.has(id)) || new Set(result.garmentIds).size !== result.garmentIds.length)
      return fail('AI_INVALID_RESPONSE', '推荐结果包含无效或重复衣物。', 502);
    if (operation?.kind === 'swap-item') {
      const kept = operation.currentGarmentIds.filter(id => id !== operation.targetGarmentId);
      const added = result.garmentIds.filter(id => !kept.includes(id));
      if (result.garmentIds.length !== operation.currentGarmentIds.length || !kept.every(id => result.garmentIds.includes(id)) ||
          added.length !== 1 || added[0] === operation.targetGarmentId || wardrobe.find(item => item.id === added[0])?.category !== operation.targetCategory) {
        return fail('AI_INVALID_RESPONSE', '单件替换修改了保留位置或使用了不可用替代。', 502);
      }
    }
    return Response.json({
  ok: true,
  data: {
    ...result,
    knowledgeVersion: knowledge.version
  },
  requestId
});
  } catch (e) {
    if (e instanceof AIError) return fail(e.code, e.message, e.code === 'AI_TIMEOUT' ? 504 : e.code === 'AI_UNAVAILABLE' ? 503 : 502, e.retryable);
    if (e instanceof InputError) return fail('VALIDATION_ERROR', e.message, 400);
    return fail('VALIDATION_ERROR', '推荐请求无效。', 400);
  }
}
