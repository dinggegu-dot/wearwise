import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { OTHER_TAG, SCENE_TAGS, STYLE_TAGS, mapTag, resolveTags } from '@/shared/domain/tags';
import { garmentSchema } from '@/modules/wardrobe';
import { applyDraft, defaultSettingsDraft, sceneText, stateKeys } from '@/modules/session';
import { WearWiseDatabase, upgradeGarmentTags, upgradeScene } from '@/shared/infrastructure/database';
import { cleanup, garment, opened, services } from './helpers';
afterEach(cleanup);

const t = '2026-11-01T02:00:00.000Z';

describe('标签词表：风格与场景分开，映射不到的进入“其他”', () => {
  it('场景词表包含 v4 列出的 6 项，风格超过 6 项，合计超过 9 项', () => {
    expect([...SCENE_TAGS]).toEqual(expect.arrayContaining(['学习', '上班', '约会', '朋友聚会', '运动健身', '户外']));
    expect(STYLE_TAGS.length).toBeGreaterThan(6);
    expect(STYLE_TAGS.length + SCENE_TAGS.length).toBeGreaterThan(9);
    expect(STYLE_TAGS).not.toContain(OTHER_TAG);
    expect(SCENE_TAGS).not.toContain(OTHER_TAG);
  });

  it('同义表达统一到固定词表，无歧义的才映射', () => {
    expect(mapTag('style', ' 极简 ')).toBe('简约');
    expect(mapTag('style', '休闲风')).toBe('休闲');
    expect(mapTag('scene', '聚会')).toBe('朋友聚会');
    expect(mapTag('scene', '健身')).toBe('运动健身');
    expect(mapTag('style', '上班')).toBeUndefined();   // 场景词不当作风格
    expect(mapTag('style', '日常')).toBeUndefined();
  });

  it('映射不到的保留原文并补“其他”；去重；“其他”≠“不确定”', () => {
    expect(resolveTags('style', ['休闲', '极简', '休闲', 'Y2K', '不确定'])).toEqual({ tags: ['休闲', '简约', OTHER_TAG], other: ['Y2K', '不确定'] });
    expect(resolveTags('scene', [])).toEqual({ tags: [], other: [] });
  });

  it('编辑时保留“其他”则沿用原说明；删除“其他”则清空说明', () => {
    expect(resolveTags('style', ['简约', OTHER_TAG], ['Y2K'])).toEqual({ tags: ['简约', OTHER_TAG], other: ['Y2K'] });
    expect(resolveTags('style', ['简约'], ['Y2K'])).toEqual({ tags: ['简约'], other: [] });
  });
});

describe('衣物资料：保存时按词表校验', () => {
  const base = { id: 'g', name: '衬衫', category: 'top', color: '白', warmth: 'light', imageId: 'i', sourceType: 'manual', createdAt: t, updatedAt: t };

  it('不接受词表外的值，“其他”与说明必须同时出现', () => {
    expect(() => garmentSchema.parse({ ...base, styleTags: ['日常'] })).toThrow('不在固定词表中');
    expect(() => garmentSchema.parse({ ...base, styleTags: [OTHER_TAG] })).toThrow('需保留原始识别词或说明');
    expect(() => garmentSchema.parse({ ...base, styleTags: ['简约'], styleOther: ['Y2K'] })).toThrow('不应保留其他说明');
    expect(() => garmentSchema.parse({ ...base, styleTags: [], sceneTags: ['上班', '上班'] })).toThrow('重复');
  });

  it('旧记录缺场景与说明字段时按空读取', () => {
    expect(garmentSchema.parse({ ...base, styleTags: ['简约'] })).toMatchObject({ sceneTags: [], styleOther: [], sceneOther: [] });
  });

  it('新增时接受 AI 原始输出：映射到固定值，其余记为“其他”；刷新后仍可读取', async () => {
    const { wardrobe } = services();
    const saved = await wardrobe.add(garment('格纹衬衫', 'top', { styleTags: ['复古风', 'Y2K'], sceneTags: ['上班', '聚会', '音乐节'] }), new Blob(['w']));
    expect(saved).toMatchObject({ styleTags: ['复古', OTHER_TAG], styleOther: ['Y2K'], sceneTags: ['上班', '朋友聚会', OTHER_TAG], sceneOther: ['音乐节'] });
    expect(await wardrobe.get(saved.id)).toEqual(saved);
    const plain = await wardrobe.add(garment('白 T', 'top', { styleTags: ['休闲'] }), new Blob(['w']));
    expect(plain).toMatchObject({ sceneTags: [], styleOther: [], sceneOther: [] });
  });

  it('编辑：保留“其他”沿用说明，改选或删除“其他”同步更新；未修改的标签组不变', async () => {
    const { wardrobe } = services();
    const saved = await wardrobe.add(garment('格纹衬衫', 'top', { styleTags: ['Y2K'], sceneTags: ['音乐节'] }), new Blob(['w']));
    const kept = await wardrobe.update(saved.id, { styleTags: ['简约', OTHER_TAG] });
    expect(kept).toMatchObject({ styleTags: ['简约', OTHER_TAG], styleOther: ['Y2K'], sceneTags: [OTHER_TAG], sceneOther: ['音乐节'] });
    const removed = await wardrobe.update(saved.id, { styleTags: ['简约'], sceneTags: ['户外'] });
    expect(removed).toMatchObject({ styleTags: ['简约'], styleOther: [], sceneTags: ['户外'], sceneOther: [] });
    const renamed = await wardrobe.update(saved.id, { name: '新名字' });
    expect(renamed).toMatchObject({ styleTags: ['简约'], sceneTags: ['户外'] });
  });
});

describe('推荐页本次喜好与本次场景', () => {
  it('喜好标签只用固定风格词表；只选标签也算有内容；关闭时保留但不应用', () => {
    const draft = defaultSettingsDraft();
    const on = applyDraft({ ...draft, weather: false, preference: { enabled: true, text: '', imageIds: [], styleTags: ['简约', '简约'] } }, null);
    expect(on.preference).toEqual({ text: '', imageIds: [], styleTags: ['简约'] });
    const off = applyDraft({ ...draft, weather: false, preference: { enabled: false, text: '', imageIds: [], styleTags: ['简约'] } }, null);
    expect(off.preference).toBeNull();
  });

  it('场景：固定选项与自填分开记录，依据文字合并展示；自填不变成公共标签', () => {
    const draft = { ...defaultSettingsDraft(), weather: false };
    const both = applyDraft({ ...draft, scene: { enabled: true, selected: '户外', custom: ' 去爬山 ' } }, null);
    expect(both.scene).toEqual({ selected: '户外', custom: '去爬山' });
    expect(sceneText(both.scene)).toBe('户外（去爬山）');
    expect(sceneText(applyDraft({ ...draft, scene: { enabled: true, selected: null, custom: '面试' } }, null).scene)).toBe('面试');
    expect(applyDraft({ ...draft, scene: { enabled: true, selected: null, custom: ' ' } }, null).scene).toBeNull();
  });

  it('草稿不接受词表外的喜好标签或场景', async () => {
    const { session } = services();
    const draft = await session.getSettingsDraft();
    await expect(session.saveSettingsDraft({ ...draft, scene: { enabled: true, selected: '聚会' as never, custom: '' } })).rejects.toThrow();
    await expect(session.saveSettingsDraft({ ...draft, preference: { ...draft.preference, styleTags: [OTHER_TAG as never] } })).rejects.toThrow();
  });
});

describe('数据库 v3 → v4 迁移', () => {
  it('单条记录：旧标签原文保留到“其他”，场景补空', () => {
    expect(upgradeGarmentTags({ styleTags: ['日常', '简约', '休闲风'] })).toMatchObject({ styleTags: ['简约', '休闲', OTHER_TAG], styleOther: ['日常'], sceneTags: [], sceneOther: [] });
    expect(upgradeGarmentTags({})).toMatchObject({ styleTags: [], sceneTags: [] });
    expect(upgradeScene('聚会')).toEqual({ selected: '朋友聚会', custom: '' });
    expect(upgradeScene('去爬山')).toEqual({ selected: null, custom: '去爬山' });
  });

  it('不清空数据：衣物、草稿、本轮条件、旧快照和永久反馈都能按新结构读取', async () => {
    const name = `wearwise-test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    const stores = { garments: 'id, category', media: 'id', feedback: 'outfitId', outfits: 'id, batchId, createdAt', meta: 'key', inspirations: 'id, createdAt', preferences: 'id, group', results: 'id, surface, roundId', state: 'key' };
    old.version(1).stores({ garments: 'id, category', media: 'id', feedback: 'outfitId', outfits: 'id, createdAt' });
    old.version(2).stores({ garments: 'id, category', media: 'id', feedback: 'outfitId', outfits: 'id, batchId, createdAt', meta: 'key' });
    old.version(3).stores(stores);
    const g = (id: string, styleTags: string[]) => ({ id, name: id, category: 'top', color: '白', fit: '不确定', warmth: 'medium', styleTags, description: '', imageId: `img-${id}`, sourceType: 'photo', revision: 1, createdAt: t, updatedAt: t });
    await old.table('garments').bulkAdd([g('a', ['日常', '休闲']), g('b', []), { ...g('c', ['通勤']), deletedAt: t }]);
    for (const id of ['img-a', 'img-b', 'img-c']) await old.table('media').add({ id, blob: new Blob([id]) });
    const snapshot = { id: 'a', name: 'a（旧名）', category: 'top', color: '白', fit: '不确定', warmth: 'medium', styleTags: ['日常'], imageId: 'img-a' };
    const result = { id: 'res1', surface: 'recommendations', roundId: 'r1', garmentIds: ['a'], snapshots: [snapshot], flatLay: [{ garmentId: 'a', slot: 'top', layer: 2 }], reason: '旧结果', basis: { label: '上班', memory: true, weather: null, preference: true, scene: '上班' }, createdAt: t };
    await old.table('results').add(result);
    await old.table('preferences').add({ id: 'p1', group: 'feedback', content: '', state: 'active', userEdited: false, feedback: { choice: 'like', outfit: { resultId: 'res1', garmentIds: ['a'], snapshots: [snapshot] } }, revision: 1, createdAt: t, updatedAt: t });
    await old.table('state').bulkAdd([
      { key: stateKeys.settingsDraft, value: { memory: true, weather: false, preference: { enabled: true, text: '想穿浅色', imageIds: [] }, scene: { enabled: true, value: '聚会' }, updatedAt: t } },
      { key: stateKeys.round, value: { roundId: 'r1', applied: { memory: true, weather: null, preference: { text: '想穿浅色', imageIds: [] }, scene: '去爬山', appliedAt: t }, currentResultId: 'res1', adjustments: [], feedback: [], startedAt: t, revision: 1 } }
    ]);
    old.close();

    const db = new WearWiseDatabase(name); opened.push(db);
    await db.open(); expect(db.verno).toBe(4);
    const ctx = services(name);
    expect(await db.garments.count()).toBe(3);
    expect(await ctx.wardrobe.get('a')).toMatchObject({ styleTags: ['休闲', OTHER_TAG], styleOther: ['日常'], sceneTags: [], sceneOther: [] });
    expect(await ctx.wardrobe.get('c')).toMatchObject({ styleTags: ['通勤'], deletedAt: t });
    expect((await ctx.wardrobe.list()).map(x => x.id).sort()).toEqual(['a', 'b']);
    expect(await ctx.session.getSettingsDraft()).toMatchObject({ preference: { enabled: true, text: '想穿浅色', styleTags: [] }, scene: { enabled: true, selected: '朋友聚会', custom: '' } });
    const view = await ctx.session.readRound();
    expect(view.round?.applied).toMatchObject({ preference: { text: '想穿浅色', styleTags: [] }, scene: { selected: null, custom: '去爬山' } });
    // 旧快照只用于展示：保留当时的标签原文，缺少的场景字段按空读取。
    expect(view.current?.snapshots[0]).toMatchObject({ name: 'a（旧名）', styleTags: ['日常'], sceneTags: [] });
    const [feedback] = await ctx.preferences.listActive('feedback');
    expect(feedback.feedback?.outfit.snapshots[0]).toMatchObject({ styleTags: ['日常'], sceneTags: [] });
    expect(await ctx.wardrobe.image('img-a')).toBeDefined();
  });
});
