import Dexie, { type Table, type Transaction } from 'dexie';
import { garmentSchema, UNCERTAIN, type Garment, type GarmentPatch, type Media, type Pause, type WardrobeRepository, type MediaRepository } from '@/modules/wardrobe';
import type { Feedback, FeedbackChoice, FeedbackRepository } from '@/modules/feedback';
import type { ActiveBatch, OutfitRecord, RecommendationStore } from '@/modules/recommendation/service';
import type { Inspiration } from '@/modules/inspiration';
import type { Preference } from '@/modules/preferences';
import type { OutfitResult } from '@/modules/session/schema';
import { DexieUnitOfWork } from '@/shared/infrastructure/unit-of-work';
import { beijingDate, beijingMidnight } from '@/shared/domain/beijing-date';

export interface StateRecord { key: string; value: unknown }

/**
 * IndexedDB schema 历史：
 * v1 衣物/图片/旧反馈/旧推荐；v2 增加 meta、推荐批次与修订号；
 * v3（第 2 轮）衣物增加版型/描述/暂停/软删除，去掉上传原图；新增灵感、长期偏好、搭配结果与推荐过程状态。
 */
export class WearWiseDatabase extends Dexie {
  garments!: Table<Garment, string>;
  media!: Table<Media, string>;
  feedback!: Table<Feedback, string>;
  outfits!: Table<OutfitRecord | { id: string; garmentIds: string[]; createdAt: string; recordVersion?: 1 }, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  inspirations!: Table<Inspiration, string>;
  preferences!: Table<Preference, string>;
  results!: Table<OutfitResult, string>;
  state!: Table<StateRecord, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ garments: 'id, category', media: 'id', feedback: 'outfitId', outfits: 'id, createdAt' });
    this.version(2).stores({ garments: 'id, category', media: 'id', feedback: 'outfitId', outfits: 'id, batchId, createdAt', meta: 'key' }).upgrade(async tx => {
      await tx.table('garments').toCollection().modify(item => { item.revision ??= 1; });
      await tx.table('outfits').toCollection().modify(item => { item.recordVersion ??= 1; });
    });
    this.version(3).stores({
      garments: 'id, category', media: 'id', feedback: 'outfitId', outfits: 'id, batchId, createdAt', meta: 'key',
      inspirations: 'id, createdAt', preferences: 'id, group', results: 'id, surface, roundId', state: 'key'
    }).upgrade(migrateToV3);
  }
}

type LegacyGarment = Record<string, unknown> & { imageId?: string; sourceImageId?: string; updatedAt?: string };
/** 将 v2 衣物记录改写为 v3 结构。不删除任何衣物。 */
export function upgradeGarmentRecord(item: LegacyGarment, now = new Date()) {
  const since = typeof item.updatedAt === 'string' ? item.updatedAt : now.toISOString();
  let pause: Pause | undefined;
  if (item.excludedPermanently === true) pause = { since, resumeOn: null };
  else if (typeof item.excludedUntil === 'string' && Date.parse(item.excludedUntil) > now.getTime()) {
    // 旧语义：到 excludedUntil 时刻恢复。新语义按北京日期 00:00 恢复，取不早于原时刻的那一天。
    const day = beijingDate(item.excludedUntil);
    const resumeOn = beijingMidnight(day).getTime() >= Date.parse(item.excludedUntil) ? day : beijingDate(beijingMidnight(day).getTime() + 86_400_000);
    pause = { since, resumeOn };
  }
  if (item.status === 'archived') item.deletedAt ??= since;
  if (pause) item.pause = pause;
  item.fit ??= UNCERTAIN;
  item.description ??= '';
  item.revision ??= 1;
  for (const key of ['excludedPermanently', 'excludedUntil', 'status', 'sourceImageId']) delete item[key];
  return item;
}

async function migrateToV3(tx: Transaction) {
  const sourceImages = new Set<string>();
  await tx.table('garments').toCollection().modify((item: LegacyGarment) => {
    if (typeof item.sourceImageId === 'string') sourceImages.add(item.sourceImageId);
    upgradeGarmentRecord(item);
  });
  // 旧推荐快照也换成新结构，旧页面继续可读；快照中的图片引用保持不变。
  await tx.table('outfits').toCollection().modify((item: { recordVersion?: number; garmentSnapshots?: LegacyGarment[] }) => {
    if (item.recordVersion === 2 && Array.isArray(item.garmentSnapshots)) item.garmentSnapshots = item.garmentSnapshots.map(s => upgradeGarmentRecord({ ...s }));
  });
  // 新规则只保留白底图：清理旧版上传原图，但仍被引用的图片不删。
  const used = new Set<string>();
  for (const g of await tx.table('garments').toArray()) used.add(g.imageId);
  for (const o of await tx.table('outfits').toArray()) for (const s of o.garmentSnapshots ?? []) used.add(s.imageId);
  for (const id of sourceImages) if (!used.has(id)) await tx.table('media').delete(id);
}

/** 检查图片是否仍被任何衣物（含已删除）、旧/新搭配快照、永久反馈、灵感或推荐设置引用。须在包含这些表的事务内调用。 */
export async function imageInUse(db: WearWiseDatabase, id: string) {
  if (await db.garments.filter(g => g.imageId === id).count()) return true;
  if (await db.inspirations.filter(i => i.imageId === id).count()) return true;
  if (await db.outfits.filter(o => 'garmentSnapshots' in o && o.garmentSnapshots.some(s => s.imageId === id)).count()) return true;
  if (await db.results.filter(r => r.snapshots.some(s => s.imageId === id)).count()) return true;
  if (await db.preferences.filter(p => !!p.feedback?.outfit.snapshots.some(s => s.imageId === id)).count()) return true;
  for (const record of await db.state.toArray()) if (referencesImageId(record.value, id)) return true;
  return false;
}
function referencesImageId(value: unknown, id: string): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as { imageIds?: unknown; preference?: { imageIds?: unknown } | null; applied?: { preference?: { imageIds?: unknown } | null } };
  const lists = [v.imageIds, v.preference?.imageIds, v.applied?.preference?.imageIds];
  return lists.some(list => Array.isArray(list) && list.includes(id));
}
export const imageTables = (db: WearWiseDatabase) => [db.garments, db.media, db.inspirations, db.outfits, db.results, db.preferences, db.state];

const bumpRevision = async (tx: Parameters<Parameters<DexieUnitOfWork['write']>[1]>[0]) => {
  const old = await tx.meta.get('wardrobeRevision'); await tx.meta.put({ key: 'wardrobeRevision', value: Number(old?.value ?? 0) + 1 });
};

export class DexieWardrobeRepository implements WardrobeRepository {
  private readonly uow: DexieUnitOfWork;
  constructor(private readonly db: WearWiseDatabase) { this.uow = new DexieUnitOfWork(db); }
  async list() { return (await this.db.garments.toArray()).map(g => garmentSchema.parse(g)).filter(g => !g.deletedAt); }
  async get(id: string) { const item = await this.db.garments.get(id); return item ? garmentSchema.parse(item) : undefined; }
  async createOnce(input: Garment, media: Media) {
    const garment = garmentSchema.parse(input);
    return this.uow.write('wardrobe', async tx => {
      const existing = await tx.garments.get(garment.id); if (existing) return existing;
      if (media.id !== garment.imageId || !(media.blob instanceof Blob)) throw new Error('图片数据无效');
      await tx.media.add(media); await tx.garments.add(garment);
      await bumpRevision(tx);
      return garment;
    });
  }
  async update(id: string, expectedRevision: number, patch: GarmentPatch, media?: Media) {
    return this.uow.write('wardrobe', async tx => {
      const previous = await tx.garments.get(id); if (!previous || previous.deletedAt) throw new Error('衣物不存在，请刷新后重试');
      if (previous.revision !== expectedRevision) throw new Error('衣物已被修改，请刷新后重试');
      if (media && !(media.blob instanceof Blob)) throw new Error('图片数据无效');
      const next = garmentSchema.parse({ ...previous, ...patch, imageId: media?.id ?? previous.imageId, revision: previous.revision + 1, updatedAt: new Date().toISOString() });
      if (media) await tx.media.add(media);
      await tx.garments.put(next);
      // 旧白底图若仍被旧搭配快照引用则保留。
      if (media && !await tx.media.inUse(previous.imageId)) await tx.media.remove(previous.imageId);
      await bumpRevision(tx); return next;
    });
  }
  async setPause(id: string, expectedRevision: number, pause: Pause | undefined) {
    return this.uow.write('wardrobe', async tx => {
      const previous = await tx.garments.get(id); if (!previous || previous.deletedAt) throw new Error('衣物不存在，请刷新后重试');
      if (previous.revision !== expectedRevision) throw new Error('衣物已被修改，请刷新后重试');
      const { pause: _old, ...rest } = previous;
      const next = garmentSchema.parse({ ...rest, ...(pause ? { pause } : {}), revision: previous.revision + 1, updatedAt: new Date().toISOString() });
      await tx.garments.put(next); await bumpRevision(tx); return next;
    });
  }
  async save(input: Garment, media?: Media) {
    const garment = garmentSchema.parse(input);
    await this.uow.write('wardrobe', async tx => {
      const previous = await tx.garments.get(garment.id);
      if (media) { if (media.id !== garment.imageId || !(media.blob instanceof Blob)) throw new Error('图片数据无效'); await tx.media.put(media); }
      if (!await tx.media.get(garment.imageId)) throw new Error('图片不存在');
      await tx.garments.put(garment); await bumpRevision(tx);
      if (previous && previous.imageId !== garment.imageId && !await tx.media.inUse(previous.imageId)) await tx.media.remove(previous.imageId);
    });
  }
  /** 软删除：保留记录与白底图，供旧搭配快照展示；衣橱与新候选不再包含它。 */
  async remove(id: string) {
    await this.uow.write('wardrobe', async tx => {
      const previous = await tx.garments.get(id); if (!previous || previous.deletedAt) return;
      const now = new Date().toISOString();
      await tx.garments.put({ ...previous, deletedAt: now, revision: previous.revision + 1, updatedAt: now });
      await bumpRevision(tx);
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

/** 旧版推荐页（第 8 轮前继续使用）的批次存储。衣橱变更不再清除已展示的批次。 */
export class DexieRecommendationStore implements RecommendationStore {
  private readonly uow: DexieUnitOfWork;
  constructor(private readonly db: WearWiseDatabase) { this.uow = new DexieUnitOfWork(db); }
  snapshot() { return this.uow.readWardrobeSnapshot(); }
  async saveBatch(records: OutfitRecord[], revision: number) {
    return this.uow.write('recommendation', async tx => {
      if (Number((await tx.meta.get('wardrobeRevision'))?.value ?? 0) !== revision) throw new Error('衣橱已改变，请重新生成穿搭。');
      const previous = await tx.outfits.findBatch(records[0].batchId); if (previous.length) return previous;
      await tx.outfits.addMany(records); return records;
    });
  }
  async activate(active: ActiveBatch, isCurrent: () => boolean = () => true) {
    await this.uow.write('recommendation', async tx => {
      if (Number((await tx.meta.get('wardrobeRevision'))?.value ?? 0) !== active.wardrobeRevision) throw new Error('衣橱已改变，请重新生成穿搭。');
      if (!(await tx.outfits.findBatch(active.batchId)).length) throw new Error('推荐记录不存在。');
      if (!isCurrent()) throw new Error('选择已更改，请重新生成。');
      await tx.meta.put({ key: 'activeBatch', value: active });
      if (!isCurrent()) throw new Error('选择已更改，请重新生成。');
    });
  }
  async clearActive() { await this.uow.write('recommendation', tx => tx.meta.remove('activeBatch')); }
  async restore() {
    return this.uow.write('recommendation', async tx => {
      const active = (await tx.meta.get('activeBatch'))?.value as ActiveBatch | undefined;
      const revision = Number((await tx.meta.get('wardrobeRevision'))?.value ?? 0);
      return { active, revision, records: active ? await tx.outfits.findBatch(active.batchId) : [] };
    });
  }
  async feedback(outfitId: string, choice: FeedbackChoice) {
    await this.uow.write('feedback', async tx => {
      const outfit = await tx.outfits.get(outfitId); if (!outfit || outfit.recordVersion !== 2) throw new Error('推荐记录不存在。');
      await tx.feedback.put({ outfitId, choice, updatedAt: new Date().toISOString() });
    });
  }
  getFeedback(outfitId: string) { return this.db.feedback.get(outfitId); }
}
export class DexieDemoStore {
  private readonly uow: DexieUnitOfWork;
  constructor(db: WearWiseDatabase) { this.uow = new DexieUnitOfWork(db); }
  async seed(records: { garment: Garment; media: Media }[], reset: boolean) {
    await this.uow.write('demo', async tx => {
      if (tx.mode !== 'demo') throw new Error('仅可初始化示例衣橱');
      const oldRevision = Number((await tx.meta.get('wardrobeRevision'))?.value ?? 0);
      if (!reset && (await tx.meta.get('demoSeedVersion'))?.value === 1) return;
      if (reset) { await tx.garments.clear(); await tx.media.clear(); await tx.outfits.clear(); await tx.feedback.clear(); await tx.meta.clear(); await tx.clearRound2(); }
      for (const record of records) { await tx.media.add(record.media); await tx.garments.add(record.garment); }
      await tx.meta.put({ key: 'wardrobeRevision', value: oldRevision + 1 });
      await tx.meta.put({ key: 'demoSeedVersion', value: 1 }); await tx.meta.remove('activeBatch');
    });
  }
}
