import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { WearWiseDatabase } from '@/shared/infrastructure/database';
import { cleanup, opened, services } from './helpers';
afterEach(cleanup);

const tags = [{ text: '灰白配色', kind: 'color' as const }, { text: '叠穿', kind: 'layering' as const }];

describe('R02 灵感记录', () => {
  it('新增、读取、修改、删除；同一请求重试只保存一次；刷新后仍在', async () => {
    const { db, inspiration } = services();
    const id = crypto.randomUUID();
    const [a, b] = await Promise.all([
      inspiration.create({ name: '街拍 1', tags, analysis: '喜欢灰白配色和叠穿，但不喜欢紧身裤' }, new Blob(['p1']), id),
      inspiration.create({ name: '街拍 1', tags, analysis: '喜欢灰白配色和叠穿，但不喜欢紧身裤' }, new Blob(['p1']), id)
    ]);
    expect(a.id).toBe(b.id); expect(await db.inspirations.count()).toBe(1); expect(await db.media.count()).toBe(1);
    const { inspiration: edited } = await inspiration.update(id, { analysis: '只喜欢灰白配色', tags: [...tags, { text: '叠穿' }, { text: '通勤' }] });
    expect(edited.tags.map(t => t.text)).toEqual(['灰白配色', '叠穿', '通勤']);
    expect(edited.revision).toBe(2);
    await expect(inspiration.update(id, { name: '旧' }, 1)).rejects.toThrow('已被修改');
    const name = db.name; db.close();
    const again = services(name);
    expect((await again.inspiration.get(id))?.analysis).toBe('只喜欢灰白配色');
    expect(await (await again.inspiration.image(edited.imageId))?.text()).toBe('p1');
    await again.inspiration.remove(id);
    expect(await again.inspiration.list()).toEqual([]);
    expect(await again.inspiration.image(edited.imageId)).toBeUndefined();
  });

  it('分析为空（未确认）不能保存；写入失败时图片也回滚', async () => {
    const { db, inspiration } = services();
    await expect(inspiration.create({ name: 'x', tags: [], analysis: '  ' }, new Blob(['p']))).rejects.toThrow();
    db.inspirations.hook('creating', () => { throw new Error('注入失败'); });
    await expect(inspiration.create({ name: 'x', tags: [], analysis: 'ok' }, new Blob(['p']))).rejects.toThrow('注入失败');
    expect(await db.media.count()).toBe(0);
  });
});

describe('R02 三组长期偏好', () => {
  it('明确偏好：新增、修改、删除，刷新后读取最新有效内容', async () => {
    const { db, preferences } = services();
    const p = await preferences.addExplicit('喜欢直筒裤');
    await preferences.edit(p.id, { content: '喜欢直筒或阔腿裤' });
    await expect(preferences.edit(p.id, { content: '旧' }, 1)).rejects.toThrow('已被修改');
    const name = db.name; db.close();
    const again = services(name);
    expect((await again.preferences.listActive('explicit')).map(x => x.content)).toEqual(['喜欢直筒或阔腿裤']);
    await again.preferences.remove(p.id);
    expect(await again.preferences.listActive()).toEqual([]);
  });

  it('灵感归纳：保留来源；手改后不被覆盖，主动删除后不被恢复', async () => {
    const { preferences } = services();
    const first = await preferences.applyInspirationSummaries([
      { key: 'color:grey-white', content: '偏好灰白配色', sourceIds: ['i1'] },
      { key: 'layering', content: '喜欢叠穿', sourceIds: ['i1', 'i2'] }
    ]);
    expect(first.added).toHaveLength(2);
    const list = await preferences.listActive('inspiration');
    const color = list.find(p => p.inspiration?.key === 'color:grey-white')!, layering = list.find(p => p.inspiration?.key === 'layering')!;
    expect(layering.inspiration?.sourceIds).toEqual(['i1', 'i2']);
    await preferences.edit(color.id, { content: '偏好灰白，偶尔米色' });
    await preferences.remove(layering.id);
    const second = await preferences.applyInspirationSummaries([
      { key: 'color:grey-white', content: '偏好灰白配色（重算）', sourceIds: ['i1', 'i3'] },
      { key: 'layering', content: '喜欢叠穿（重算）', sourceIds: ['i2'] }
    ]);
    expect(second.skipped.sort()).toEqual([color.id, layering.id].sort());
    const active = await preferences.listActive('inspiration');
    expect(active.map(p => p.content)).toEqual(['偏好灰白，偶尔米色']);
    expect(active[0].inspiration?.sourceIds).toEqual(['i1', 'i3']);
  });

  it('删除灵感：其他灵感仍支持的归纳保留；失去全部依据的自动归纳移除；手改条目保留', async () => {
    const { inspiration, preferences } = services();
    const i1 = await inspiration.create({ name: 'A', tags, analysis: 'a' }, new Blob(['a']));
    const i2 = await inspiration.create({ name: 'B', tags, analysis: 'b' }, new Blob(['b']));
    await preferences.applyInspirationSummaries([
      { key: 'only-a', content: '只来自 A', sourceIds: [i1.id] },
      { key: 'a-and-b', content: 'A 和 B 都支持', sourceIds: [i1.id, i2.id] },
      { key: 'edited', content: '来自 A', sourceIds: [i1.id] }
    ]);
    const edited = (await preferences.listActive('inspiration')).find(p => p.inspiration?.key === 'edited')!;
    await preferences.edit(edited.id, { content: '用户改过' });
    const { affectedSummaryIds } = await inspiration.update(i1.id, { analysis: 'a2' });
    expect(affectedSummaryIds).toHaveLength(2);
    const result = await inspiration.remove(i1.id);
    expect(result.removedSummaryIds).toHaveLength(1);
    const left = await preferences.listActive('inspiration');
    expect(left.map(p => p.content).sort()).toEqual(['A 和 B 都支持', '用户改过']);
    expect(left.find(p => p.inspiration?.key === 'a-and-b')?.inspiration?.sourceIds).toEqual([i2.id]);
  });

  it('数据库重开后三组记录全部恢复', async () => {
    const name = `wearwise-test-${crypto.randomUUID()}`;
    const { preferences } = services(name);
    await preferences.addExplicit('不喜欢大面积亮色');
    await preferences.applyInspirationSummaries([{ key: 'k', content: '喜欢宽松上衣', sourceIds: ['x'] }]);
    opened[0].close();
    const db = new WearWiseDatabase(name); opened.push(db);
    expect((await db.preferences.toArray()).map(p => p.group).sort()).toEqual(['explicit', 'inspiration']);
  });
});
