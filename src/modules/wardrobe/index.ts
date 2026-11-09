import { z } from 'zod';
import { beijingDate, isDateOnly } from '@/shared/domain/beijing-date';

export const categorySchema = z.enum(['top', 'bottom', 'outerwear', 'dress', 'shoes']);
export type Category = z.infer<typeof categorySchema>;
export const categories = categorySchema.options;
/** 厚薄。unknown 即界面上的“不确定”。 */
export const warmthSchema = z.enum(['light', 'medium', 'warm', 'unknown']);
/** 无法从图片判断的文字字段统一写“不确定”，不为填满字段而编造。 */
export const UNCERTAIN = '不确定';
const dateOnly = z.string().refine(isDateOnly, '日期格式应为 YYYY-MM-DD');

/**
 * 暂停推荐。resumeOn 为北京日期，自当天 00:00 起恢复候选资格；
 * null 仅来自旧版“永久排除”的迁移，表示需用户手动恢复或补设日期。
 */
export const pauseSchema = z.object({ since: z.string().datetime(), resumeOn: dateOnly.nullable() }).strict();
export type Pause = z.infer<typeof pauseSchema>;

export const garmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  category: categorySchema,
  color: z.string().trim().min(1).max(50),
  /** 版型，如宽松、修身、直筒；无法判断时为“不确定”。 */
  fit: z.string().trim().min(1).max(50).default(UNCERTAIN),
  warmth: warmthSchema,
  material: z.string().max(100).optional(),
  styleTags: z.array(z.string().trim().min(1).max(30)).max(20),
  /** 自然语言描述，用户确认后的版本。 */
  description: z.string().max(1000).default(''),
  /** 白底图引用：衣橱展示与平铺搭配使用的唯一图片。上传原图不保留。 */
  imageId: z.string().min(1),
  sourceType: z.enum(['photo', 'shopping_screenshot', 'manual', 'demo']),
  pause: pauseSchema.optional(),
  /** 删除为软删除：衣物不再出现在衣橱和新候选中，旧搭配快照仍可读取图片。 */
  deletedAt: z.string().datetime().optional(),
  revision: z.number().int().positive().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).strict();
export type Garment = z.infer<typeof garmentSchema>;
export type GarmentInput = Pick<Garment, 'name' | 'category' | 'color' | 'warmth' | 'styleTags' | 'sourceType'> & Partial<Pick<Garment, 'material' | 'fit' | 'description'>>;
export type GarmentPatch = Partial<Pick<Garment, 'name' | 'category' | 'color' | 'fit' | 'warmth' | 'styleTags' | 'material' | 'description'>>;
export type Availability = 'available' | 'paused' | 'deleted' | 'missing';
export interface Media { id: string; blob: Blob }

/** 按北京时间判断：未删除、未暂停或已到恢复日期，才是新搭配/替换单品的候选。 */
export function availability(garment: Garment | undefined, now: Date = new Date()): Availability {
  if (!garment) return 'missing';
  if (garment.deletedAt) return 'deleted';
  if (garment.pause && (garment.pause.resumeOn === null || garment.pause.resumeOn > beijingDate(now))) return 'paused';
  return 'available';
}
export const isCandidate = (garment: Garment | undefined, now: Date = new Date()) => availability(garment, now) === 'available';

export interface WardrobeRepository {
  /** 未删除的衣物（含暂停）。 */
  list(): Promise<Garment[]>;
  /** 按 ID 读取，包含已删除记录，用于旧搭配状态核对。 */
  get(id: string): Promise<Garment | undefined>;
  save(garment: Garment, media?: Media): Promise<void>;
  createOnce(garment: Garment, media: Media): Promise<Garment>;
  update(id: string, expectedRevision: number, patch: GarmentPatch, media?: Media): Promise<Garment>;
  setPause(id: string, expectedRevision: number, pause: Pause | undefined): Promise<Garment>;
  remove(id: string): Promise<void>;
}
export interface MediaRepository { get(id: string): Promise<Blob | undefined> }
export interface WardrobeCounts { total: number; byCategory: Record<Category, number> }

export class WardrobeService {
  constructor(private readonly wardrobe: WardrobeRepository, private readonly media: MediaRepository) {}
  /** 衣橱列表：已删除衣物不出现，暂停衣物继续出现。 */
  list() { return this.wardrobe.list(); }
  image(id: string) { return this.media.get(id); }
  get(id: string) { return this.wardrobe.get(id); }
  /** 衣物总数：暂停衣物计入，删除衣物扣除。 */
  async count() { return (await this.list()).length; }
  async counts(): Promise<WardrobeCounts> {
    const items = await this.list();
    const byCategory = Object.fromEntries(categories.map(c => [c, 0])) as Record<Category, number>;
    for (const item of items) byCategory[item.category]++;
    return { total: items.length, byCategory };
  }
  /** 首页衣橱概况用的缩略图引用，按最近添加排序。 */
  async thumbnails(limit = 6) {
    return (await this.list()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, Math.max(0, limit))
      .map(({ id, name, category, imageId }) => ({ id, name, category, imageId }));
  }
  /** 当前可作为新候选的衣物，每次调用都按北京时间重新判断暂停是否到期。 */
  async candidates(now: Date = new Date()) { return (await this.list()).filter(g => isCandidate(g, now)); }
  /** 核对一组衣物（例如旧搭配）当前的状态。 */
  async statuses(ids: string[], now: Date = new Date()) {
    return Object.fromEntries(await Promise.all(ids.map(async id => [id, availability(await this.wardrobe.get(id), now)] as const))) as Record<string, Availability>;
  }
  /** 保存用户确认后的衣物资料与白底图。requestId 相同的重试只保存一次。 */
  async add(input: GarmentInput, whiteBackground: Blob, requestId = crypto.randomUUID()) {
    const now = new Date().toISOString();
    const imageId = crypto.randomUUID();
    const garment = garmentSchema.parse({ ...input, id: requestId, imageId, revision: 1, createdAt: now, updatedAt: now });
    return this.wardrobe.createOnce(garment, { id: imageId, blob: whiteBackground });
  }
  /** 修改资料；传入 media 即替换白底图。expectedRevision 不一致时拒绝覆盖。 */
  async update(id: string, input: GarmentPatch, expectedRevision?: number, media?: Media) {
    const previous = await this.wardrobe.get(id);
    if (!previous || previous.deletedAt) throw new Error('衣物不存在，请刷新后重试');
    return this.wardrobe.update(id, expectedRevision ?? previous.revision, input, media);
  }
  /** 暂时不推荐，直到北京时间 resumeOn 当天 00:00。 */
  async pause(id: string, resumeOn: string, expectedRevision?: number, now: Date = new Date()) {
    if (!isDateOnly(resumeOn)) throw new Error('请选择有效的恢复日期');
    if (resumeOn <= beijingDate(now)) throw new Error('恢复日期需晚于今天');
    const previous = await this.requireLive(id);
    return this.wardrobe.setPause(id, expectedRevision ?? previous.revision, { since: now.toISOString(), resumeOn });
  }
  /** 提前恢复推荐。 */
  async resume(id: string, expectedRevision?: number) {
    const previous = await this.requireLive(id);
    return this.wardrobe.setPause(id, expectedRevision ?? previous.revision, undefined);
  }
  remove(id: string) { return this.wardrobe.remove(id); }
  private async requireLive(id: string) {
    const previous = await this.wardrobe.get(id);
    if (!previous || previous.deletedAt) throw new Error('衣物不存在，请刷新后重试');
    return previous;
  }
}
