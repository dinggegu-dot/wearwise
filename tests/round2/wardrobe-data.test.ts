import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { availability } from '@/modules/wardrobe';
import { cleanup, garment, services } from './helpers';
afterEach(cleanup);

describe('R02 衣物资料、暂停与删除', () => {
  it('保存版型、厚薄、材质、风格、描述与白底图引用；无法判断的写“不确定”', async () => {
    const { wardrobe } = services();
    const saved = await wardrobe.add(garment('灰色卫衣', 'top', { fit: '宽松', material: '棉', styleTags: ['休闲'], description: '落肩宽松卫衣' }), new Blob(['white-bg']));
    expect(saved).toMatchObject({ fit: '宽松', warmth: 'medium', material: '棉', styleTags: ['休闲'], description: '落肩宽松卫衣' });
    expect(await (await wardrobe.image(saved.imageId))?.text()).toBe('white-bg');
    const unsure = await wardrobe.add(garment('未知', 'bottom', { warmth: 'unknown' }), new Blob(['x']));
    expect(unsure.fit).toBe('不确定'); expect(unsure.description).toBe('');
  });

  it('总数与分类数量：暂停衣物继续计入，删除衣物扣除；缩略图按最近添加', async () => {
    const { wardrobe } = services();
    const a = await wardrobe.add(garment('A', 'top'), new Blob(['a']));
    const b = await wardrobe.add(garment('B', 'top'), new Blob(['b']));
    await wardrobe.add(garment('C', 'shoes'), new Blob(['c']));
    await wardrobe.pause(a.id, '2999-01-01');
    expect(await wardrobe.counts()).toEqual({ total: 3, byCategory: { top: 2, bottom: 0, outerwear: 0, dress: 0, shoes: 1 } });
    await wardrobe.remove(b.id);
    expect((await wardrobe.counts()).total).toBe(2); expect((await wardrobe.counts()).byCategory.top).toBe(1);
    expect((await wardrobe.list()).map(g => g.name).sort()).toEqual(['A', 'C']);
    expect((await wardrobe.thumbnails(1))[0]).toMatchObject({ name: 'C' });
  });

  it('暂停按北京时间恢复日 00:00 到期，读取时重新判断，可提前恢复', async () => {
    const { wardrobe } = services();
    const item = await wardrobe.add(garment('外套', 'outerwear'), new Blob(['x']));
    const now = new Date('2026-11-09T04:00:00Z'); // 北京 11-09 12:00
    const paused = await wardrobe.pause(item.id, '2026-11-10', undefined, now);
    expect(paused.pause).toEqual({ since: now.toISOString(), resumeOn: '2026-11-10' });
    expect(availability(paused, new Date('2026-11-09T15:59:59Z'))).toBe('paused');   // 北京 23:59:59
    expect(availability(paused, new Date('2026-11-09T16:00:00Z'))).toBe('available'); // 北京 11-10 00:00
    expect((await wardrobe.candidates(new Date('2026-11-09T15:59:59Z'))).length).toBe(0);
    expect((await wardrobe.candidates(new Date('2026-11-09T16:00:00Z'))).length).toBe(1);
    await expect(wardrobe.pause(item.id, '2026-11-09', undefined, now)).rejects.toThrow('晚于今天');
    await expect(wardrobe.pause(item.id, '2026-02-30', undefined, now)).rejects.toThrow('有效的恢复日期');
    const resumed = await wardrobe.resume(item.id);
    expect(resumed.pause).toBeUndefined(); expect(availability(resumed, now)).toBe('available');
  });

  it('删除后不出现在衣橱与候选中，状态核对返回 deleted，不能再编辑', async () => {
    const { wardrobe } = services();
    const item = await wardrobe.add(garment('裙子', 'dress'), new Blob(['x']));
    await wardrobe.remove(item.id);
    expect(await wardrobe.candidates()).toEqual([]);
    expect(await wardrobe.statuses([item.id, 'none'])).toEqual({ [item.id]: 'deleted', none: 'missing' });
    await expect(wardrobe.update(item.id, { name: '新' })).rejects.toThrow('不存在');
    await expect(wardrobe.pause(item.id, '2999-01-01')).rejects.toThrow('不存在');
  });

  it('暂停与恢复使用修订号，旧修订不能覆盖', async () => {
    const { wardrobe } = services();
    const item = await wardrobe.add(garment('上衣', 'top'), new Blob(['x']));
    await wardrobe.pause(item.id, '2999-01-01', item.revision);
    await expect(wardrobe.resume(item.id, item.revision)).rejects.toThrow('已被修改');
  });

  it('换白底图时旧图仍被搭配快照引用则保留，否则清理', async () => {
    const { wardrobe, session } = services();
    const top = await wardrobe.add(garment('T', 'top'), new Blob(['old']));
    const b = await wardrobe.add(garment('B', 'bottom'), new Blob(['b']));
    const s = await wardrobe.add(garment('S', 'shoes'), new Blob(['s']));
    await session.saveSettingsDraft({ ...(await session.getSettingsDraft()), weather: false });
    await session.commitNewRound({ weather: null, result: { garmentIds: [top.id, b.id, s.id], reason: 'r' } });
    const next = await wardrobe.update(top.id, { name: 'T2' }, undefined, { id: 'new-img', blob: new Blob(['new']) });
    expect(await (await wardrobe.image(top.imageId))?.text()).toBe('old');
    await wardrobe.update(next.id, {}, undefined, { id: 'newer-img', blob: new Blob(['newer']) });
    expect(await wardrobe.image('new-img')).toBeUndefined();
  });
});
