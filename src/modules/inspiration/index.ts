import { z } from 'zod';
import type { Media } from '@/modules/wardrobe';

export const inspirationTagKindSchema = z.enum(['color', 'style', 'fit', 'layering', 'scene']);
/** 标签：AI 生成的带 kind（配色/风格/版型/层次/场景）；用户“＋ 添加标签”时可不填 kind。 */
export const inspirationTagSchema = z.object({ text: z.string().trim().min(1).max(30), kind: inspirationTagKindSchema.optional() }).strict();
export const inspirationSchema = z.object({
  id: z.string().min(1),
  imageId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  tags: z.array(inspirationTagSchema).max(30),
  /** 用户确认（可能已改写）后的 AI 分析。未确认、分析失败的灵感不入库。 */
  analysis: z.string().trim().min(1).max(2000),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).strict();
export type Inspiration = z.infer<typeof inspirationSchema>;
export type InspirationTag = z.infer<typeof inspirationTagSchema>;
export type InspirationInput = Pick<Inspiration, 'name' | 'tags' | 'analysis'>;
export type InspirationPatch = Partial<InspirationInput>;

export interface InspirationStore {
  list(): Promise<Inspiration[]>;
  get(id: string): Promise<Inspiration | undefined>;
  createOnce(record: Inspiration, media: Media): Promise<Inspiration>;
  /** 修改成功后返回受影响、且未被用户手改的灵感归纳 ID，供第 6 轮重新核对。 */
  update(id: string, expectedRevision: number, patch: InspirationPatch, media?: Media): Promise<{ inspiration: Inspiration; affectedSummaryIds: string[] }>;
  /** 删除灵感并在同一事务中解除归纳来源：失去全部依据的自动归纳被移除。 */
  remove(id: string): Promise<{ removedSummaryIds: string[]; affectedSummaryIds: string[] }>;
}

export class InspirationService {
  constructor(private readonly store: InspirationStore, private readonly media: { get(id: string): Promise<Blob | undefined> }) {}
  list() { return this.store.list(); }
  get(id: string) { return this.store.get(id); }
  image(id: string) { return this.media.get(id); }
  /** 保存用户确认后的灵感：图片、名称、标签和分析。requestId 相同的重试只保存一次。 */
  async create(input: InspirationInput, image: Blob, requestId = crypto.randomUUID()) {
    const now = new Date().toISOString(), imageId = crypto.randomUUID();
    const record = inspirationSchema.parse({ ...input, tags: dedupeTags(input.tags), id: requestId, imageId, revision: 1, createdAt: now, updatedAt: now });
    return this.store.createOnce(record, { id: imageId, blob: image });
  }
  async update(id: string, patch: InspirationPatch, expectedRevision?: number, image?: Blob) {
    const previous = await this.store.get(id);
    if (!previous) throw new Error('灵感不存在，请刷新后重试');
    return this.store.update(id, expectedRevision ?? previous.revision, patch.tags ? { ...patch, tags: dedupeTags(patch.tags) } : patch, image ? { id: crypto.randomUUID(), blob: image } : undefined);
  }
  remove(id: string) { return this.store.remove(id); }
}

function dedupeTags(tags: InspirationTag[]) {
  const seen = new Set<string>();
  return tags.map(t => ({ ...t, text: t.text.trim() })).filter(t => t.text && !seen.has(t.text) && seen.add(t.text));
}
