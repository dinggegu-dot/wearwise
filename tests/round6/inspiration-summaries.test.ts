import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { summarizeInspirations } from '@/modules/inspiration/summaries';
import { cleanup, services } from '../round2/helpers';

afterEach(cleanup);

describe('第六轮灵感归纳', () => {
  it('只提取明确喜欢或不喜欢；客观描述与标签不产生偏好', () => {
    expect(summarizeInspirations([{ id: 'a', analysis: '灰白配色，宽松版型，适合通勤。' }])).toEqual([]);
    expect(summarizeInspirations([{ id: 'a', analysis: '喜欢灰白配色和叠穿，但不喜欢紧身裤。' }])).toEqual([
      { key: 'like:灰白配色', content: '喜欢灰白配色', sourceIds: ['a'] },
      { key: 'like:叠穿', content: '喜欢叠穿', sourceIds: ['a'] },
      { key: 'dislike:紧身裤', content: '不喜欢紧身裤', sourceIds: ['a'] },
    ]);
  });

  it('两张灵感的同一喜好合并来源；编辑、删除后重算，手改与删除标记得到保护', async () => {
    const { inspiration, preferences } = services();
    const first = await inspiration.create({ name: 'A', tags: [{ text: '灰白', kind: 'color' }], analysis: '喜欢灰白配色和叠穿' }, new Blob(['a']));
    const second = await inspiration.create({ name: 'B', tags: [], analysis: '我喜欢灰白色搭配，不喜欢紧身裤' }, new Blob(['b']));
    const reconcile = async () => preferences.reconcileInspirationSummaries(summarizeInspirations(await inspiration.list()));
    await reconcile();
    let active = await preferences.listActive('inspiration');
    expect(active).toHaveLength(3);
    expect(active.find(item => item.inspiration?.key === 'like:灰白配色')?.inspiration?.sourceIds.sort()).toEqual([first.id, second.id].sort());
    const gray = active.find(item => item.inspiration?.key === 'like:灰白配色')!;
    const layering = active.find(item => item.inspiration?.key === 'like:叠穿')!;
    await preferences.edit(gray.id, { content: '我手动改过的灰白偏好' }, gray.revision);
    await preferences.remove(layering.id);
    await inspiration.update(first.id, { analysis: '只描述灰白配色' }, first.revision);
    await reconcile();
    active = await preferences.listActive('inspiration');
    expect(active.find(item => item.id === gray.id)?.content).toBe('我手动改过的灰白偏好');
    expect(active.find(item => item.inspiration?.key === 'like:叠穿')).toBeUndefined();
    await inspiration.remove(second.id);
    await reconcile();
    active = await preferences.listActive('inspiration');
    expect(active.map(item => item.id)).toEqual([gray.id]);
    expect(active[0].inspiration?.sourceIds).toEqual([]);
    const third = await inspiration.create({ name: 'C', tags: [], analysis: '喜欢叠穿' }, new Blob(['c']));
    await reconcile();
    expect(third.id).toBeTruthy();
    expect((await preferences.listActive('inspiration')).find(item => item.inspiration?.key === 'like:叠穿')).toBeUndefined();
  });

  it('推荐只在记忆开关开启时读取归纳文本，不读取灵感照片或客观分析', async () => {
    const { inspiration, preferences, session } = services();
    await inspiration.create({ name: '街拍', tags: [{ text: '叠穿', kind: 'layering' }], analysis: '喜欢叠穿，照片背景是街道。' }, new Blob(['photo']));
    await preferences.reconcileInspirationSummaries(summarizeInspirations(await inspiration.list()));
    const on = await session.newRoundContext();
    expect(on.longTerm.map(item => item.content)).toEqual(['喜欢叠穿']);
    expect(JSON.stringify(on.longTerm)).not.toContain('照片背景');
    const draft = await session.getSettingsDraft();
    await session.saveSettingsDraft({ ...draft, memory: false });
    const off = await session.newRoundContext();
    expect(off.longTerm).toEqual([]);
    expect((await inspiration.list()).map(item => item.analysis)).toEqual(['喜欢叠穿，照片背景是街道。']);
  });
});
