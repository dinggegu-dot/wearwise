import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, garment, services } from '../round2/helpers';
import { OTHER_TAG, SCENE_TAGS, STYLE_TAGS, readTags, resolveTags, validateTags } from '@/modules/wardrobe/tag-adapter';

afterEach(cleanup);
describe('M03 V1.2 tag boundary and minimum field compatibility', () => {
  it('has exactly the confirmed 9 styles and 6 scenes, maps only unambiguous synonyms', () => {
    expect(STYLE_TAGS).toHaveLength(9); expect(SCENE_TAGS).toHaveLength(6);
    expect(resolveTags('style', ['Minimalist Style','极简','学院风','日常','不确定','unknown'])).toEqual({ tags: ['简约风','学院风',OTHER_TAG], other: ['日常'] });
    expect(resolveTags('scene', ['Work','聚会','音乐节'])).toEqual({ tags: ['上班','朋友聚会',OTHER_TAG], other: ['音乐节'] });
    expect(readTags({ styleTags: ['休闲','通勤'] }).styleOther).toEqual(['休闲','通勤']);
  });
  it('keeps uncertainty distinct and validates associated Other arrays', () => {
    expect(readTags({ styleTags: ['不确定'], sceneTags: ['unknown'] })).toEqual({ styleTags: [], sceneTags: [], styleOther: [], sceneOther: [] });
    expect(() => validateTags({ ...readTags({}), sceneTags: [OTHER_TAG] })).toThrow('说明');
    expect(() => validateTags({ ...readTags({}), styleOther: ['未关联说明'] })).toThrow('说明');
    expect(() => validateTags({ ...readTags({}), styleTags: [OTHER_TAG], styleOther: ['x'.repeat(31)] })).toThrow('30');
  });
  it('persists all four arrays through the existing wardrobe service and database reopen', async () => {
    const ctx = services();
    const saved = await ctx.wardrobe.add(garment('开衫','outerwear', { styleTags: ['Minimalist Style','Y2K'], sceneTags: ['Work','音乐节'], styleOther: [], sceneOther: [] }), new Blob(['white']), 'once');
    expect(saved).toMatchObject({ styleTags: ['简约风','其他'], styleOther: ['Y2K'], sceneTags: ['上班','其他'], sceneOther: ['音乐节'] });
    ctx.db.close(); await ctx.db.open();
    expect(await ctx.wardrobe.get(saved.id)).toEqual(saved);
    expect((await ctx.wardrobe.update(saved.id, { name: '改名' }, saved.revision))).toMatchObject({ styleOther: ['Y2K'], sceneTags: saved.sceneTags, sceneOther: ['音乐节'] });
    const next = await ctx.wardrobe.update(saved.id, { styleTags: ['学院风'] });
    expect(next.styleOther).toEqual([]); expect(next.sceneOther).toEqual(['音乐节']);
    expect(await ctx.db.media.count()).toBe(1);
  });
  it('does not migrate, rewrite or clear raw legacy records when reading or editing unrelated fields', async () => {
    const ctx = services();
    const old = await ctx.wardrobe.add(garment('旧衣物','top', { styleTags: ['日常','简约'] }), new Blob(['old']));
    expect(ctx.db.verno).toBe(3); expect(old.sceneTags).toBeUndefined();
    const raw = await ctx.db.garments.get(old.id);
    expect(readTags(old)).toMatchObject({ styleTags: ['简约风','其他'], styleOther: ['日常'] });
    expect(await ctx.db.garments.get(old.id)).toEqual(raw);
    const updated = await ctx.wardrobe.update(old.id, { color: '白色' }, old.revision);
    expect(updated.styleTags).toEqual(['日常','简约']); expect(updated.imageId).toBe(old.imageId);
  });
  it('keeps revision protection and existing stored image if an update fails', async () => {
    const ctx = services(); const old = await ctx.wardrobe.add(garment('旧衣物','top'), new Blob(['old']));
    await ctx.wardrobe.update(old.id, { name: '另一处修改' });
    await expect(ctx.wardrobe.update(old.id, { name: '覆盖' }, old.revision, { id: 'new-img', blob: new Blob(['new']) })).rejects.toThrow('已被修改');
    expect(await ctx.wardrobe.image('new-img')).toBeUndefined(); expect(await ctx.wardrobe.image(old.imageId)).toBeDefined();
  });
});
