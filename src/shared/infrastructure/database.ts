import Dexie, { type Table } from 'dexie';
import { garmentSchema, type Garment, type GarmentPatch, type Media, type WardrobeRepository, type MediaRepository } from '@/modules/wardrobe';
import type { Feedback, FeedbackChoice, FeedbackRepository } from '@/modules/feedback';
import type { ActiveBatch, OutfitRecord, RecommendationStore } from '@/modules/recommendation/service';
import { DexieUnitOfWork } from '@/shared/infrastructure/unit-of-work';

export class WearWiseDatabase extends Dexie {
  garments!: Table<Garment, string>;
  media!: Table<Media, string>;
  feedback!: Table<Feedback, string>;
  outfits!: Table<OutfitRecord | { id: string; garmentIds: string[]; createdAt: string; recordVersion?: 1 }, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ garments: 'id, category', media: 'id', feedback: 'outfitId', outfits: 'id, createdAt' });
    this.version(2).stores({ garments: 'id, category', media: 'id', feedback: 'outfitId', outfits: 'id, batchId, createdAt', meta: 'key' }).upgrade(async tx => {
      await tx.table('garments').toCollection().modify(item => { item.revision ??= 1; });
      await tx.table('outfits').toCollection().modify(item => { item.recordVersion ??= 1; });
    });
  }
}
export class DexieWardrobeRepository implements WardrobeRepository {
  private readonly uow: DexieUnitOfWork;
  constructor(private readonly db: WearWiseDatabase) { this.uow = new DexieUnitOfWork(db); }
  async list() { return (await this.db.garments.toArray()).map(g => garmentSchema.parse(g)); }
  async get(id: string) { const item = await this.db.garments.get(id); return item ? garmentSchema.parse(item) : undefined; }
  async createOnce(input: Garment, media: Media) {
    const garment = garmentSchema.parse(input);
    return this.uow.write('wardrobe',async tx => {
      const existing = await tx.garments.get(garment.id); if (existing) return existing;
      if (media.id !== garment.imageId || !(media.blob instanceof Blob)) throw new Error('图片数据无效');
      await tx.media.add(media); await tx.garments.add(garment);
      const old=await tx.meta.get('wardrobeRevision'); await tx.meta.put({key:'wardrobeRevision',value:Number(old?.value??0)+1}); await tx.meta.remove('activeBatch');
      return garment;
    });
  }
  async update(id: string, expectedRevision: number, patch: GarmentPatch, media?: Media) {
    return this.uow.write('wardrobe',async tx => {
      const previous = await tx.garments.get(id); if (!previous) throw new Error('衣物不存在，请刷新后重试');
      if (previous.revision !== expectedRevision) throw new Error('衣物已被修改，请刷新后重试');
      if (media && !(media.blob instanceof Blob)) throw new Error('图片数据无效');
      const next = garmentSchema.parse({...previous,...patch,imageId:media?.id ?? previous.imageId,revision:previous.revision+1,updatedAt:new Date().toISOString()});
      if (media) await tx.media.add(media);
      await tx.garments.put(next);
      if (media && !await tx.garments.referencesImage(previous.imageId)) await tx.media.remove(previous.imageId);
      const old=await tx.meta.get('wardrobeRevision');await tx.meta.put({key:'wardrobeRevision',value:Number(old?.value??0)+1});await tx.meta.remove('activeBatch');return next;
    });
  }
  async save(input: Garment, media?: Media) {
    const garment = garmentSchema.parse(input);
    await this.uow.write('wardrobe',async tx => {
      const previous = await tx.garments.get(garment.id);
      if (media) { if (media.id !== garment.imageId || !(media.blob instanceof Blob)) throw new Error('图片数据无效'); await tx.media.put(media); }
      if (!await tx.media.get(garment.imageId)) throw new Error('图片不存在');
      if (garment.sourceImageId && !await tx.media.get(garment.sourceImageId)) throw new Error('原图不存在');
      await tx.garments.put(garment);
      const old=await tx.meta.get('wardrobeRevision');await tx.meta.put({key:'wardrobeRevision',value:Number(old?.value??0)+1});await tx.meta.remove('activeBatch');
      if (previous) for (const id of new Set([previous.imageId,previous.sourceImageId].filter((v):v is string=>!!v))) if(!await tx.garments.referencesImage(id)) await tx.media.remove(id);
    });
  }
  async remove(id: string) {
    await this.uow.write('wardrobe',async tx => {
      const previous=await tx.garments.get(id); if(!previous)return;
      await tx.garments.remove(id);
      const old=await tx.meta.get('wardrobeRevision');await tx.meta.put({key:'wardrobeRevision',value:Number(old?.value??0)+1});await tx.meta.remove('activeBatch');
      for(const imageId of new Set([previous.imageId,previous.sourceImageId].filter((v):v is string=>!!v))) if(!await tx.garments.referencesImage(imageId)) await tx.media.remove(imageId);
    });
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

export class DexieRecommendationStore implements RecommendationStore {
  private readonly uow: DexieUnitOfWork;
  constructor(private readonly db: WearWiseDatabase) { this.uow = new DexieUnitOfWork(db); }
  snapshot() { return this.uow.readWardrobeSnapshot(); }
  async saveBatch(records: OutfitRecord[], revision: number) {
    return this.uow.write('recommendation',async tx => {
      if (Number((await tx.meta.get('wardrobeRevision'))?.value ?? 0) !== revision) throw new Error('衣橱已改变，请重新生成穿搭。');
      const previous=await tx.outfits.findBatch(records[0].batchId); if(previous.length)return previous;
      await tx.outfits.addMany(records); return records;
    });
  }
  async activate(active: ActiveBatch, isCurrent: () => boolean = () => true) {
    await this.uow.write('recommendation',async tx => {
      if (Number((await tx.meta.get('wardrobeRevision'))?.value ?? 0) !== active.wardrobeRevision) throw new Error('衣橱已改变，请重新生成穿搭。');
      if (!(await tx.outfits.findBatch(active.batchId)).length) throw new Error('推荐记录不存在。');
      if (!isCurrent()) throw new Error('选择已更改，请重新生成。');
      await tx.meta.put({key:'activeBatch',value:active});
      if (!isCurrent()) throw new Error('选择已更改，请重新生成。');
    });
  }
  async clearActive() { await this.uow.write('recommendation',tx=>tx.meta.remove('activeBatch')); }
  async restore() {
    return this.uow.write('recommendation',async tx => {
      const active=(await tx.meta.get('activeBatch'))?.value as ActiveBatch | undefined;
      const revision=Number((await tx.meta.get('wardrobeRevision'))?.value ?? 0);
      return {active,revision,records:active ? await tx.outfits.findBatch(active.batchId) : []};
    });
  }
  async feedback(outfitId: string, choice: FeedbackChoice) {
    await this.uow.write('feedback',async tx => {
      const outfit=await tx.outfits.get(outfitId); if(!outfit || outfit.recordVersion!==2) throw new Error('推荐记录不存在。');
      await tx.feedback.put({outfitId,choice,updatedAt:new Date().toISOString()});
    });
  }
  getFeedback(outfitId: string) { return this.db.feedback.get(outfitId); }
}
export class DexieDemoStore {
  private readonly uow: DexieUnitOfWork;
  constructor(db: WearWiseDatabase) { this.uow = new DexieUnitOfWork(db); }
  async seed(records: {garment: Garment; media: Media}[], reset: boolean) {
    await this.uow.write('demo',async tx => {
      if (tx.mode !== 'demo') throw new Error('仅可初始化示例衣橱');
      const oldRevision=Number((await tx.meta.get('wardrobeRevision'))?.value ?? 0);
      if (!reset && (await tx.meta.get('demoSeedVersion'))?.value === 1) return;
      if (reset) { await tx.garments.clear(); await tx.media.clear(); await tx.outfits.clear(); await tx.feedback.clear(); await tx.meta.clear(); }
      for (const record of records) { await tx.media.add(record.media); await tx.garments.add(record.garment); }
      await tx.meta.put({key:'wardrobeRevision',value:oldRevision+1});
      await tx.meta.put({key:'demoSeedVersion',value:1}); await tx.meta.remove('activeBatch');
    });
  }
}
