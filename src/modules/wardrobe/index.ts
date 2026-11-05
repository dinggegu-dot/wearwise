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
export type GarmentInput = Pick<Garment, 'name' | 'category' | 'color' | 'warmth' | 'styleTags' | 'material' | 'sourceType'>;
export interface Media { id: string; blob: Blob }
export interface WardrobeRepository {
  list(): Promise<Garment[]>;
  get(id: string): Promise<Garment | undefined>;
  save(garment: Garment, media?: Media): Promise<void>;
  remove(id: string): Promise<void>;
}
export interface MediaRepository { get(id: string): Promise<Blob | undefined> }

export class WardrobeService {
  constructor(private readonly wardrobe: WardrobeRepository, private readonly media: MediaRepository) {}
  list() { return this.wardrobe.list(); }
  image(id: string) { return this.media.get(id); }
  async add(input: GarmentInput, blob: Blob) {
    const now = new Date().toISOString();
    const imageId = crypto.randomUUID();
    const garment = garmentSchema.parse({ ...input, id: crypto.randomUUID(), imageId, status: 'confirmed', excludedPermanently: false, createdAt: now, updatedAt: now });
    await this.wardrobe.save(garment, { id: imageId, blob });
    return garment;
  }
  async update(id: string, input: Partial<Pick<Garment, 'name' | 'category' | 'color' | 'warmth' | 'styleTags' | 'material' | 'excludedPermanently'>>) {
    const previous = await this.wardrobe.get(id);
    if (!previous) throw new Error('衣物不存在，请刷新后重试');
    const garment = garmentSchema.parse({ ...previous, ...input, updatedAt: new Date().toISOString() });
    await this.wardrobe.save(garment);
    return garment;
  }
  remove(id: string) { return this.wardrobe.remove(id); }
}
