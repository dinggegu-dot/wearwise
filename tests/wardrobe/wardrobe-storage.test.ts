import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { WardrobeError, WardrobeService, type GarmentInput } from '@/modules/wardrobe';
import { DexieMediaRepository, DexieWardrobeRepository, WearWiseDatabase } from '@/shared/infrastructure/database';

// 每个测试使用独立的测试库，结束后删除，不碰 demo/real 数据。
const opened: WearWiseDatabase[] = [];
function open(name: string) {
  const db = new WearWiseDatabase(name);
  opened.push(db);
  const repository = new DexieWardrobeRepository(db);
  return { db, repository, service: new WardrobeService(repository, new DexieMediaRepository(db)) };
}
const testName = () => `wearwise-test-${crypto.randomUUID()}`;
afterEach(async () => { for (const db of opened.splice(0)) await db.delete(); });

const tee: GarmentInput = { name: '白色 T 恤', category: 'top', color: '白色', warmth: 'light', styleTags: ['日常'], sourceType: 'manual' };
const jeans: GarmentInput = { name: '深蓝牛仔裤', category: 'bottom', color: '深蓝', warmth: 'medium', styleTags: [], sourceType: 'manual' };

describe('衣橱本地存储', () => {
  it('两件衣服在关闭并重新打开数据库后仍在，无照片的使用占位图', async () => {
    const name = testName();
    const first = open(name);
    const photo = new Blob(['photo-bytes'], { type: 'image/jpeg' });
    await first.service.add(tee, photo);
    const saved = await first.service.add(jeans);
    first.db.close();

    const reopened = open(name);
    const items = await reopened.service.list();
    expect(items.map(g => g.name).sort()).toEqual(['深蓝牛仔裤', '白色 T 恤']);
    const placeholder = await reopened.service.image(saved.imageId);
    expect(placeholder?.type).toBe('image/svg+xml');
    expect(await placeholder?.text()).toContain('暂无照片');
    const withPhoto = items.find(g => g.name === '白色 T 恤')!;
    expect(await (await reopened.service.image(withPhoto.imageId))?.text()).toBe('photo-bytes');
  });

  it('支持单件读取、分类筛选和数量统计', async () => {
    const { service } = open(testName());
    const a = await service.add(tee);
    await service.add({ ...tee, name: '条纹衬衫' });
    await service.add(jeans);

    expect((await service.get(a.id))?.name).toBe('白色 T 恤');
    expect(await service.get('missing')).toBeUndefined();
    expect((await service.list({ category: 'top' })).map(g => g.name).sort()).toEqual(['条纹衬衫', '白色 T 恤']);
    expect(await service.count()).toBe(3);
    expect(await service.count({ category: 'bottom' })).toBe(1);
  });

  it('编辑后保留原有字段，删除后图片一并清理', async () => {
    const { db, service } = open(testName());
    const garment = await service.add(tee);
    const updated = await service.update(garment.id, { name: '奶白 T 恤', warmth: 'medium' });
    expect(updated).toMatchObject({ id: garment.id, name: '奶白 T 恤', warmth: 'medium', color: '白色', createdAt: garment.createdAt });

    await service.remove(garment.id);
    expect(await service.list()).toEqual([]);
    expect(await db.media.count()).toBe(0);
    await expect(service.update(garment.id, { name: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('同一个 requestId 并发提交两次只保存一件衣物和一张图', async () => {
    const { db, service } = open(testName());
    const requestId = crypto.randomUUID();
    const [a, b] = await Promise.all([service.add(tee, undefined, { requestId }), service.add(tee, undefined, { requestId })]);
    expect(a.id).toBe(requestId);
    expect(b.id).toBe(requestId);
    expect(await db.garments.count()).toBe(1);
    expect(await db.media.count()).toBe(1);
  });

  it('写入衣物失败时整体回滚，不留下孤立图片', async () => {
    const { db, service } = open(testName());
    // 故障注入：让衣物表写入失败，图片已写入但应随事务回滚。
    db.garments.hook('creating', () => { throw new Error('模拟写入失败'); });
    const error = await service.add(tee, new Blob(['x'])).catch(e => e);
    expect(error).toBeInstanceOf(WardrobeError);
    expect(error.code).toBe('STORAGE_FAILED');
    expect(await db.garments.count()).toBe(0);
    expect(await db.media.count()).toBe(0);
  });

  it('输入不合法时报 INVALID_INPUT 且不写入任何数据', async () => {
    const { db, service } = open(testName());
    await expect(service.add({ ...tee, name: '  ' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(service.add({ ...tee, category: 'hat' as never })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await db.garments.count()).toBe(0);
    expect(await db.media.count()).toBe(0);
  });

  it('删除一件衣物不会误删其他衣物仍在引用的图片', async () => {
    const { db, repository, service } = open(testName());
    const first = await service.add(tee, new Blob(['shared']));
    const second = { ...first, id: crypto.randomUUID(), name: '同图第二件' };
    await repository.save(second);

    await service.remove(first.id);
    expect(await (await service.image(first.imageId))?.text()).toBe('shared');
    await service.remove(second.id);
    expect(await db.media.count()).toBe(0);
  });
});
