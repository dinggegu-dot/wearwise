import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { WearWiseDatabase, DexieMediaRepository, DexieWardrobeRepository, DexieRecommendationStore } from '@/shared/infrastructure/database';
import { WardrobeService, availability } from '@/modules/wardrobe';
import { RecommendationService } from '@/modules/recommendation/service';
import { RuleRecommendationEngine } from '@/modules/recommendation';
import { cleanup, opened } from './helpers';
afterEach(cleanup);

const t = '2026-11-01T02:00:00.000Z';
const base = { category: 'top', color: '白', warmth: 'medium', styleTags: [], sourceType: 'photo', revision: 1, createdAt: t, updatedAt: t };

/** 用 v2 schema 写入一份旧版数据（与 #21~#23 基线一致）。 */
async function legacyDatabase(name: string) {
  const old = new Dexie(name);
  old.version(1).stores({ garments: 'id, category', media: 'id', feedback: 'outfitId', outfits: 'id, createdAt' });
  old.version(2).stores({ garments: 'id, category', media: 'id', feedback: 'outfitId', outfits: 'id, batchId, createdAt', meta: 'key' });
  await old.table('garments').bulkAdd([
    { ...base, id: 'plain', name: '普通', imageId: 'img-plain', sourceImageId: 'src-plain', status: 'confirmed', excludedPermanently: false },
    { ...base, id: 'forever', name: '永久排除', imageId: 'img-forever', status: 'confirmed', excludedPermanently: true },
    { ...base, id: 'until', name: '临时排除', imageId: 'img-until', status: 'confirmed', excludedPermanently: false, excludedUntil: '2999-03-04T05:00:00.000Z' },
    { ...base, id: 'midnight', name: '零点恢复', imageId: 'img-midnight', status: 'confirmed', excludedPermanently: false, excludedUntil: '2999-03-03T16:00:00.000Z' },
    { ...base, id: 'archived', name: '已归档', imageId: 'img-archived', status: 'archived', excludedPermanently: false },
    { ...base, id: 'shared-src', name: '原图被快照使用', imageId: 'img-x', sourceImageId: 'src-in-snapshot', status: 'confirmed', excludedPermanently: false }
  ]);
  for (const id of ['img-plain', 'src-plain', 'img-forever', 'img-until', 'img-midnight', 'img-archived', 'img-x', 'src-in-snapshot']) await old.table('media').add({ id, blob: new Blob([id]) });
  const snapshot = { ...base, id: 'plain', name: '普通（旧名）', imageId: 'src-in-snapshot', status: 'confirmed', excludedPermanently: false };
  await old.table('outfits').add({ recordVersion: 2, id: 'o1', batchId: 'b1', position: 0, garmentIds: ['plain'], garmentSnapshots: [snapshot], weather: { city: '深圳', temperature: 20, apparentTemperature: 20, dataTime: t, fetchedAt: t, example: true }, style: '日常休闲', reason: 'r', warnings: [], wardrobeRevision: 3, createdAt: t });
  await old.table('outfits').add({ id: 'legacy-v1', garmentIds: ['plain'], createdAt: t, recordVersion: 1 });
  await old.table('feedback').add({ outfitId: 'o1', choice: 'like', updatedAt: t });
  await old.table('meta').bulkAdd([{ key: 'wardrobeRevision', value: 3 }, { key: 'activeBatch', value: { batchId: 'b1', city: '深圳', style: '日常休闲', weatherFingerprint: JSON.stringify(['深圳', 'example', t, 20, 20]), wardrobeRevision: 3 } }]);
  old.close();
}

describe('R02 数据库 v2 → v3 迁移', () => {
  it('不清空衣橱：衣物、白底图、旧反馈与旧推荐全部保留并改写为新结构', async () => {
    const name = `wearwise-test-${crypto.randomUUID()}`; await legacyDatabase(name);
    const db = new WearWiseDatabase(name); opened.push(db);
    await db.open(); expect(db.verno).toBe(3);
    const wardrobe = new WardrobeService(new DexieWardrobeRepository(db), new DexieMediaRepository(db));
    expect(await db.garments.count()).toBe(6);
    const all = Object.fromEntries((await db.garments.toArray()).map(g => [g.id, g]));
    for (const g of Object.values(all)) {
      expect(g).toMatchObject({ fit: '不确定', description: '' });
      expect(g).not.toHaveProperty('status'); expect(g).not.toHaveProperty('excludedPermanently'); expect(g).not.toHaveProperty('sourceImageId');
    }
    expect(all.forever.pause).toEqual({ since: t, resumeOn: null });
    expect(all.until.pause?.resumeOn).toBe('2999-03-05');      // 旧时刻为北京 13:00，次日 00:00 起恢复，不早于原定时间
    expect(all.midnight.pause?.resumeOn).toBe('2999-03-04');   // 恰为北京 00:00
    expect(all.archived.deletedAt).toBe(t);
    expect(availability(all.forever)).toBe('paused');
    expect((await wardrobe.list()).map(g => g.id).sort()).toEqual(['forever', 'midnight', 'plain', 'shared-src', 'until']);
    // 只保留白底图：未被引用的原图清理，被旧搭配快照引用的保留。
    expect(await wardrobe.image('src-plain')).toBeUndefined();
    expect(await wardrobe.image('src-in-snapshot')).toBeDefined();
    for (const id of ['img-plain', 'img-forever', 'img-until', 'img-archived', 'img-x']) expect(await wardrobe.image(id)).toBeDefined();
    expect((await db.feedback.get('o1'))?.choice).toBe('like');
    expect(await db.outfits.get('legacy-v1')).toBeDefined();
    const restored = await new RecommendationService(new DexieRecommendationStore(db), new RuleRecommendationEngine()).restore();
    expect(restored[0].garmentSnapshots[0]).toMatchObject({ name: '普通（旧名）', fit: '不确定' });
    expect(restored[0].garmentSnapshots[0]).not.toHaveProperty('status');
  });
});
