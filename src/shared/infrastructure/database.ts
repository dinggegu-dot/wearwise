import Dexie, { type Table } from 'dexie';
import { garmentSchema, type Garment, type Media, type WardrobeRepository, type MediaRepository } from '@/modules/wardrobe';
import type { Feedback, FeedbackRepository } from '@/modules/feedback';

export class WearWiseDatabase extends Dexie {
  garments!: Table<Garment, string>;
  media!: Table<Media, string>;
  feedback!: Table<Feedback, string>;
  outfits!: Table<{ id: string; garmentIds: string[]; createdAt: string }, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ garments: 'id, category', media: 'id', feedback: 'outfitId', outfits: 'id, createdAt' });
  }
}
export class DexieWardrobeRepository implements WardrobeRepository {
  constructor(private readonly db: WearWiseDatabase) {}
  async list() { return (await this.db.garments.toArray()).map(g => garmentSchema.parse(g)); }
  async get(id: string) { const item = await this.db.garments.get(id); return item ? garmentSchema.parse(item) : undefined; }
  async save(input: Garment, media?: Media) {
    const garment = garmentSchema.parse(input);
    await this.db.transaction('rw', this.db.garments, this.db.media, async () => {
      const previous = await this.db.garments.get(garment.id);
      if (media) {
        if (media.id !== garment.imageId || !(media.blob instanceof Blob)) throw new Error('图片数据无效');
        await this.db.media.put(media);
      }
      if (!await this.db.media.get(garment.imageId)) throw new Error('图片不存在');
      if (garment.sourceImageId && !await this.db.media.get(garment.sourceImageId)) throw new Error('原图不存在');
      await this.db.garments.put(garment);
      if (previous) for (const id of new Set([previous.imageId, previous.sourceImageId].filter((v): v is string => !!v))) await this.removeIfUnreferenced(id);
    });
  }
  async remove(id: string) {
    await this.db.transaction('rw', this.db.garments, this.db.media, async () => {
      const previous = await this.db.garments.get(id);
      if (!previous) return;
      await this.db.garments.delete(id);
      for (const imageId of new Set([previous.imageId, previous.sourceImageId].filter((v): v is string => !!v))) await this.removeIfUnreferenced(imageId);
    });
  }
  private async removeIfUnreferenced(id: string) {
    // 在同一事务内检查所有引用，避免删除其他衣物共享的图片。
    const used = await this.db.garments.filter(g => g.imageId === id || g.sourceImageId === id).first();
    if (!used) await this.db.media.delete(id);
  }
}
export class DexieMediaRepository implements MediaRepository {
  constructor(private readonly db: WearWiseDatabase) {}
  async get(id: string) { return (await this.db.media.get(id))?.blob; }
}
export class DexieFeedbackRepository implements FeedbackRepository {
  constructor(private readonly db: WearWiseDatabase) {}
  async put(feedback: Feedback) { await this.db.feedback.put(feedback); }
  get(outfitId: string) { return this.db.feedback.get(outfitId); }
}
