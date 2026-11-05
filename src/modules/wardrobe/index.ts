import { z } from 'zod';

export const categorySchema = z.enum(['top', 'bottom', 'outerwear', 'dress', 'shoes']);
export const warmthSchema = z.enum(['light', 'medium', 'warm', 'unknown']);
export const garmentSchema = z.object({
  id: z.string().min(1), name: z.string().trim().min(1).max(100), category: categorySchema,
  color: z.string().trim().min(1).max(50), warmth: warmthSchema, material: z.string().max(100).optional(),
  styleTags: z.array(z.string().trim().min(1).max(30)).max(20), imageId: z.string().min(1),
  sourceImageId: z.string().min(1).optional(), sourceType: z.enum(['photo', 'shopping_screenshot', 'manual', 'demo']),
  status: z.enum(['confirmed', 'archived']), excludedUntil: z.string().datetime().optional(),
  excludedPermanently: z.boolean(), createdAt: z.string().datetime(), updatedAt: z.string().datetime()
}).strict();
export type Garment = z.infer<typeof garmentSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Warmth = z.infer<typeof warmthSchema>;
export type GarmentInput = Pick<Garment, 'name' | 'category' | 'color' | 'warmth' | 'styleTags' | 'material' | 'sourceType'>;
export type GarmentPatch = Partial<Pick<Garment, 'name' | 'category' | 'color' | 'warmth' | 'styleTags' | 'material' | 'excludedPermanently'>>;
export interface GarmentFilter { category?: Category }
// requestId 由界面在打开表单时生成一次；重复提交同一个 requestId 只会保存一件衣物。
export interface AddOptions { requestId?: string }
export interface Media { id: string; blob: Blob }
// 中文只用于显示，存储与接口一律使用英文枚举值。
export const categoryLabels: Record<Category, string> = { top: '上衣', bottom: '下装', outerwear: '外套', dress: '连衣裙', shoes: '鞋' };
export const warmthLabels: Record<Warmth, string> = { light: '轻薄', medium: '适中', warm: '保暖', unknown: '未知' };

export type WardrobeErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'STORAGE_FAILED';
export class WardrobeError extends Error {
  constructor(readonly code: WardrobeErrorCode, message: string, options?: { cause?: unknown }) { super(message, options); this.name = 'WardrobeError'; }
}

export interface WardrobeRepository {
  list(filter?: GarmentFilter): Promise<Garment[]>;
  get(id: string): Promise<Garment | undefined>;
  create(garment: Garment, media: Media): Promise<Garment>;
  save(garment: Garment, media?: Media): Promise<void>;
  remove(id: string): Promise<void>;
}
export interface MediaRepository { get(id: string): Promise<Blob | undefined> }

export class WardrobeService {
  constructor(private readonly wardrobe: WardrobeRepository, private readonly media: MediaRepository) {}
  list(filter?: GarmentFilter) { return this.run(() => this.wardrobe.list(filter)); }
  get(id: string) { return this.run(() => this.wardrobe.get(id)); }
  async count(filter?: GarmentFilter) { return (await this.list(filter)).filter(g => g.status === 'confirmed').length; }
  image(id: string) { return this.run(() => this.media.get(id)); }
  async add(input: GarmentInput, blob?: Blob, options: AddOptions = {}) {
    const now = new Date().toISOString();
    const imageId = crypto.randomUUID();
    const garment = this.parse({ ...input, id: options.requestId ?? crypto.randomUUID(), imageId, status: 'confirmed', excludedPermanently: false, createdAt: now, updatedAt: now });
    return this.run(() => this.wardrobe.create(garment, { id: imageId, blob: blob ?? placeholderImage(garment.category) }));
  }
  async update(id: string, input: GarmentPatch) {
    const previous = await this.get(id);
    if (!previous) throw new WardrobeError('NOT_FOUND', '衣物不存在，请刷新后重试');
    const garment = this.parse({ ...previous, ...input, updatedAt: new Date().toISOString() });
    await this.run(() => this.wardrobe.save(garment));
    return garment;
  }
  remove(id: string) { return this.run(() => this.wardrobe.remove(id)); }
  private parse(value: unknown) {
    const result = garmentSchema.safeParse(value);
    if (!result.success) throw new WardrobeError('INVALID_INPUT', '衣物信息不完整或格式不正确，请检查后重试', { cause: result.error });
    return result.data;
  }
  private async run<T>(work: () => Promise<T>) {
    try { return await work(); }
    catch (error) {
      if (error instanceof WardrobeError) throw error;
      throw new WardrobeError('STORAGE_FAILED', '本地保存失败，请稍后重试；反复失败请检查浏览器存储空间', { cause: error });
    }
  }
}

// 没有照片时使用的本地占位图，每件衣物各存一份，删除衣物时随之清理。
export function placeholderImage(category: Category) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" rx="18" fill="#f5f0e8"/><text x="120" y="116" text-anchor="middle" font-size="24" fill="#918c7e">${categoryLabels[category]}</text><text x="120" y="148" text-anchor="middle" font-size="16" fill="#b3ad9f">暂无照片</text></svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}
