import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { OTHER_TAG, SCENE_TAGS, STYLE_TAGS, mapTag, readTags, resolveTags, validateTags } from '@/shared/domain/tags';
import { garmentSchema } from '@/modules/wardrobe';
import { applyDraft, defaultSettingsDraft, sceneText, stateKeys } from '@/modules/session';
import { WearWiseDatabase, upgradeGarmentTags, upgradeScene } from '@/shared/infrastructure/database';
import { cleanup, garment, opened, services } from './helpers';
afterEach(cleanup);

const t = '2026-11-01T02:00:00.000Z';

describe('标签词表：V1.2 九种风格、六种场景（与第 5 轮 PR #35 一致）', () => {
  it('词表内容与数量；“其他”不算固定标签', () => {
    expect([...STYLE_TAGS]).toEqual(['中性风', '甜美风', '亚文化风', '简约风', '优雅风', '复古风', '街头风', '运动休闲风', '学院风']);
    expect([...SCENE_TAGS]).toEqual(['学习', '上班', '约会', '朋友聚会', '运动健身', '户外']);
    expect(STYLE_TAGS).not.toContain(OTHER_TAG);
    expect(SCENE_TAGS).not.toContain(OTHER_TAG);
  });

  it('中文名、英文名和无歧义同义词映射到固定值；拿不准的不硬归类', () => {
    expect(mapTag('style', ' 极简 ')).toBe('简约风');
    expect(mapTag('style', 'minimalist style')).toBe('简约风');
    expect(mapTag('style', 'Athleisure')).toBe('运动休闲风');
    expect(mapTag('scene', 'Work')).toBe('上班');
    expect(mapTag('scene', '聚会')).toBe('朋友聚会');
    for (const word of ['日常', '休闲', '通勤']) expect(mapTag('style', word)).toBeUndefined();
    expect(mapTag('style', '上班')).toBeUndefined();   // 场景词不当作风格
  });

  it('映射不到的保留原文进“其他”；“不确定”类的词丢弃，不变成“其他”', () => {
    expect(resolveTags('style', ['Minimalist Style', '极简', '学院风', '日常', '不确定', 'unknown'])).toEqual({ tags: ['简约风', '学院风', OTHER_TAG], other: ['日常'] });
    expect(resolveTags('scene', ['Work', '聚会', '音乐节'])).toEqual({ tags: ['上班', '朋友聚会', OTHER_TAG], other: ['音乐节'] });
    expect(readTags({ styleTags: ['休闲', '通勤'] }).styleOther).toEqual(['休闲', '通勤']);
    expect(readTags({ styleTags: ['不确定'], sceneTags: ['unknown'] })).toEqual({ styleTags: [], sceneTags: [], styleOther: [], sceneOther: [] });
  });

  it('已有说明原样保留；有说明就补“其他”', () => {
    expect(resolveTags('style', ['简约风', OTHER_TAG], ['Y2K'])).toEqual({ tags: ['简约风', OTHER_TAG], other: ['Y2K'] });
    expect(resolveTags('style', ['简约风'], ['Y2K'])).toEqual({ tags: ['简约风', OTHER_TAG], other: ['Y2K'] });
  });

  it('校验：“其他”与说明必须同时出现，说明 1–30 字，只能选固定值', () => {
    expect(() => validateTags({ ...readTags({}), sceneTags: [OTHER_TAG] })).toThrow('说明');
    expect(() => validateTags({ ...readTags({}), styleOther: ['未关联说明'] })).toThrow('说明');
    expect(() => validateTags({ ...readTags({}), styleTags: [OTHER_TAG], styleOther: ['x'.repeat(31)] })).toThrow('30');
    expect(() => validateTags({ ...readTags({}), styleTags: ['简约'] })).toThrow('固定候选');
    expect(() => validateTags({ ...readTags({}), styleTags: ['简约风', '学院风'] })).not.toThrow();
  });
});

describe('衣物资料：保存时按词表校验', () => {
  const base = { id: 'g', name: '衬衫', category: 'top', color: '白', warmth: 'light', imageId: 'i', sourceType: 'manual', createdAt: t, updatedAt: t };

  it('不接受词表外的值，“其他”与说明必须同时出现', () => {
    expect(() => garmentSchema.parse({ ...base, styleTags: ['日常'] })).toThrow('固定候选');
    expect(() => garmentSchema.parse({ ...base, styleTags: [OTHER_TAG] })).toThrow('说明');
    expect(() => garmentSchema.parse({ ...base, styleTags: ['简约风'], styleOther: ['Y2K'] })).toThrow('说明');
    expect(() => garmentSchema.parse({ ...base, styleTags: [], sceneTags: ['上班', '上班'] })).toThrow('重复');
  });

  it('缺场景与说明字段时按空读取', () => {
    expect(garmentSchema.parse({ ...base, styleTags: ['简约风'] })).toMatchObject({ sceneTags: [], styleOther: [], sceneOther: [] });
  });

  it('新增时接受 AI 原始输出并持久化四个字段；重开数据库后不变', async () => {
    const ctx = services();
    const saved = await ctx.wardrobe.add(garment('开衫', 'outerwear', { styleTags: ['Minimalist Style', 'Y2K'], sceneTags: ['Work', '音乐节'], styleOther: [], sceneOther: [] }), new Blob(['white']), 'once');
    expect(saved).toMatchObject({ styleTags: ['简约风', OTHER_TAG], styleOther: ['Y2K'], sceneTags: ['上班', OTHER_TAG], sceneOther: ['音乐节'] });
    ctx.db.close(); await ctx.db.open();
    expect(await ctx.wardrobe.get(saved.id)).toEqual(saved);
    const plain = await ctx.wardrobe.add(garment('白 T', 'top', { styleTags: ['简约风'] }), new Blob(['w']));
    expect(plain).toMatchObject({ sceneTags: [], styleOther: [], sceneOther: [] });
  });

  it('编辑：未修改的组不变；保留“其他”沿用说明；改选后说明清空；不合规时给出中文提示', async () => {
    const { wardrobe } = services();
    const saved = await wardrobe.add(garment('格纹衬衫', 'top', { styleTags: ['Y2K'], sceneTags: ['音乐节'] }), new Blob(['w']));
    expect(await wardrobe.update(saved.id, { name: '改名' }, saved.revision)).toMatchObject({ styleOther: ['Y2K'], sceneTags: [OTHER_TAG], sceneOther: ['音乐节'] });
    expect(await wardrobe.update(saved.id, { styleTags: ['简约风', OTHER_TAG] })).toMatchObject({ styleTags: ['简约风', OTHER_TAG], styleOther: ['Y2K'] });
    const next = await wardrobe.update(saved.id, { styleTags: ['学院风'] });
    expect(next).toMatchObject({ styleTags: ['学院风'], styleOther: [], sceneOther: ['音乐节'] });
    await expect(wardrobe.update(saved.id, { sceneTags: [OTHER_TAG], sceneOther: [] })).rejects.toThrow('请填写对应说明');
  });
});

describe('推荐页本次喜好与本次场景', () => {
  it('喜好标签只用固定风格词表；只选标签也算有内容；关闭时保留但不应用', () => {
    const draft = defaultSettingsDraft();
    const on = applyDraft({ ...draft, weather: false, preference: { enabled: true, text: '', imageIds: [], styleTags: ['简约风', '简约风'] } }, null);
    expect(on.preference).toEqual({ text: '', imageIds: [], styleTags: ['简约风'] });
    const off = applyDraft({ ...draft, weather: false, preference: { enabled: false, text: '', imageIds: [], styleTags: ['简约风'] } }, null);
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
    await expect(session.saveSettingsDraft({ ...draft, preference: { ...draft.preference, styleTags: ['简约' as never] } })).rejects.toThrow();
  });
});

describe('数据库 v3 → v4 迁移', () => {
  it('单条记录：旧标签按词表整理，原文保留到“其他”，场景补空，超长文字截断', () => {
    expect(upgradeGarmentTags({ styleTags: ['日常', '简约', 'Streetwear'] })).toMatchObject({ styleTags: ['简约风', '街头风', OTHER_TAG], styleOther: ['日常'], sceneTags: [], sceneOther: [] });
    expect(upgradeGarmentTags({})).toMatchObject({ styleTags: [], sceneTags: [], styleOther: [], sceneOther: [] });
    expect((upgradeGarmentTags({ styleTags: ['x'.repeat(40)] }).styleOther as string[])[0]).toHaveLength(30);
    // 第 5 轮兼容层已写入的四个字段原样保留，不降格。
    const r5 = { styleTags: ['简约风', OTHER_TAG], styleOther: ['Y2K'], sceneTags: ['上班', OTHER_TAG], sceneOther: ['音乐节'] };
    expect(upgradeGarmentTags({ ...r5 })).toMatchObject(r5);
    expect(upgradeScene('聚会')).toEqual({ selected: '朋友聚会', custom: '' });
    expect(upgradeScene('去爬山')).toEqual({ selected: null, custom: '去爬山' });
  });

  it('不清空数据：衣物（含第 5 轮四字段记录）、草稿、本轮条件、旧快照和永久反馈都能按新结构读取', async () => {
    const name = `wearwise-test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({ garments: 'id, category', media: 'id', feedback: 'outfitId', outfits: 'id, createdAt' });
    old.version(2).stores({ garments: 'id, category', media: 'id', feedback: 'outfitId', outfits: 'id, batchId, createdAt', meta: 'key' });
    old.version(3).stores({ garments: 'id, category', media: 'id', feedback: 'outfitId', outfits: 'id, batchId, createdAt', meta: 'key', inspirations: 'id, createdAt', preferences: 'id, group', results: 'id, surface, roundId', state: 'key' });
    const g = (id: string, extra: Record<string, unknown>) => ({ id, name: id, category: 'top', color: '白', fit: '不确定', warmth: 'medium', styleTags: [], description: '', imageId: `img-${id}`, sourceType: 'photo', revision: 1, createdAt: t, updatedAt: t, ...extra });
    await old.table('garments').bulkAdd([
      g('a', { styleTags: ['日常', '简约'] }),
      g('b', { pause: { since: t, resumeOn: '2026-11-02' } }),
      g('c', { styleTags: ['复古'], deletedAt: t }),
      g('r5', { styleTags: ['学院风', OTHER_TAG], styleOther: ['Y2K'], sceneTags: ['约会'], sceneOther: [] })
    ]);
    for (const id of ['img-a', 'img-b', 'img-c', 'img-r5']) await old.table('media').add({ id, blob: new Blob([id]) });
    const snapshot = { id: 'a', name: 'a（旧名）', category: 'top', color: '白', fit: '不确定', warmth: 'medium', styleTags: ['日常'], imageId: 'img-a' };
    await old.table('results').add({ id: 'res1', surface: 'recommendations', roundId: 'r1', garmentIds: ['a'], snapshots: [snapshot], flatLay: [{ garmentId: 'a', slot: 'top', layer: 2 }], reason: '旧结果', basis: { label: '上班', memory: true, weather: null, preference: true, scene: '上班' }, createdAt: t });
    await old.table('preferences').add({ id: 'p1', group: 'feedback', content: '', state: 'active', userEdited: false, feedback: { choice: 'like', outfit: { resultId: 'res1', garmentIds: ['a'], snapshots: [snapshot] } }, revision: 1, createdAt: t, updatedAt: t });
    await old.table('state').bulkAdd([
      { key: stateKeys.settingsDraft, value: { memory: true, weather: false, preference: { enabled: true, text: '想穿浅色', imageIds: [] }, scene: { enabled: true, value: '聚会' }, updatedAt: t } },
      { key: stateKeys.round, value: { roundId: 'r1', applied: { memory: true, weather: null, preference: { text: '想穿浅色', imageIds: [] }, scene: '去爬山', appliedAt: t }, currentResultId: 'res1', adjustments: [], feedback: [], startedAt: t, revision: 1 } }
    ]);
    old.close();

    const db = new WearWiseDatabase(name); opened.push(db);
    await db.open(); expect(db.verno).toBe(4);
    const ctx = services(name);
    expect(await db.garments.count()).toBe(4);
    expect(await ctx.wardrobe.get('a')).toMatchObject({ styleTags: ['简约风', OTHER_TAG], styleOther: ['日常'], sceneTags: [], sceneOther: [] });
    expect(await ctx.wardrobe.get('c')).toMatchObject({ styleTags: ['复古风'], deletedAt: t });
    expect(await ctx.wardrobe.get('r5')).toMatchObject({ styleTags: ['学院风', OTHER_TAG], styleOther: ['Y2K'], sceneTags: ['约会'], sceneOther: [] });
    expect((await ctx.wardrobe.list()).map(x => x.id).sort()).toEqual(['a', 'b', 'r5']);
    expect(await ctx.session.getSettingsDraft()).toMatchObject({ preference: { enabled: true, text: '想穿浅色', styleTags: [] }, scene: { enabled: true, selected: '朋友聚会', custom: '' } });
    const view = await ctx.session.readRound();
    expect(view.round?.applied).toMatchObject({ preference: { text: '想穿浅色', styleTags: [] }, scene: { selected: null, custom: '去爬山' } });
    // 旧快照只用于展示：保留当时的标签原文，缺少的场景字段按空读取。
    expect(view.current?.snapshots[0]).toMatchObject({ name: 'a（旧名）', styleTags: ['日常'], sceneTags: [] });
    const [feedback] = await ctx.preferences.listActive('feedback');
    expect(feedback.feedback?.outfit.snapshots[0]).toMatchObject({ styleTags: ['日常'], sceneTags: [] });
    for (const id of ['img-a', 'img-b', 'img-c', 'img-r5']) expect(await (await ctx.wardrobe.image(id))?.text()).toBe(id);
    expect((await ctx.wardrobe.candidates(new Date(t))).map(g => g.id)).not.toContain('b');
    expect((await ctx.wardrobe.candidates(new Date('2026-11-01T16:00:00Z'))).map(g => g.id)).toContain('b');
    await ctx.wardrobe.resume('b');
    expect((await ctx.wardrobe.get('b'))?.pause).toBeUndefined();
    expect((await db.results.get('res1'))?.snapshots[0]).toEqual(snapshot);
    db.close(); await db.open();
    expect((await ctx.session.readRound()).round?.roundId).toBe('r1');
  });
});
