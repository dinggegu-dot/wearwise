/**
 * 第 2 轮 → 04 的可运行调用示例（也是测试入口）。运行：
 *   npx vitest run tests/round2/handoff-examples.test.ts
 * 页面中通过 `createServices(mode)` 得到同样的服务：services.wardrobe / services.inspiration / services.preferences / services.session。
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { UNCERTAIN } from '@/modules/wardrobe';
import { cleanup, services } from './helpers';
afterEach(cleanup);

describe('交给 04：保存 AI 处理结果的调用方式', () => {
  it('示例 1 衣物：保存用户确认后的资料与白底图；同一 requestId 重试不重复；字段缺失或保存失败的返回', async () => {
    const { db, wardrobe } = services();
    const whiteBackground = new Blob(['<白底图 PNG 字节>'], { type: 'image/png' });
    const requestId = crypto.randomUUID(); // 每次“保存”点击生成一次，重试复用

    // 输入：AI 识别后经用户确认的字段。无法判断的文字字段写 UNCERTAIN（“不确定”），厚薄写 'unknown'。
    const saved = await wardrobe.add({
      name: '米白针织开衫', category: 'outerwear', color: '米白', fit: '宽松', warmth: 'medium',
      material: UNCERTAIN, styleTags: ['简约', '通勤'], description: '短款圆领针织开衫，前襟五粒扣',
      sourceType: 'photo'
    }, whiteBackground, requestId);
    // 返回：完整衣物记录（id === requestId、imageId 为白底图引用、revision 1）。
    expect(saved).toMatchObject({ id: requestId, revision: 1, fit: '宽松' });
    expect(await wardrobe.image(saved.imageId)).toBeInstanceOf(Blob);
    expect((await wardrobe.add({ name: '重复点击', category: 'top', color: '白', warmth: 'light', styleTags: [], sourceType: 'photo' }, whiteBackground, requestId)).name).toBe('米白针织开衫');

    // “重新处理白底图”或“更换图片后重新处理”：传入新图片，旧图若无引用自动清理。
    const replaced = await wardrobe.update(saved.id, { description: '改为长款' }, saved.revision, { id: crypto.randomUUID(), blob: new Blob(['<新白底图>']) });
    expect(replaced.revision).toBe(2);

    // 缺失：必填字段为空 → 抛出 ZodError，什么都不写入。
    await expect(wardrobe.add({ name: '', category: 'top', color: '白', warmth: 'light', styleTags: [], sourceType: 'photo' }, whiteBackground)).rejects.toThrow();
    // 修订冲突：用旧 revision 保存 → '衣物已被修改，请刷新后重试'。
    await expect(wardrobe.update(saved.id, { name: '旧页面' }, 1)).rejects.toThrow('衣物已被修改');
    // 保存失败：衣物与图片在同一事务，失败时都不留下。
    db.garments.hook('creating', () => { throw new Error('存储失败'); });
    await expect(wardrobe.add({ name: 'x', category: 'top', color: '白', warmth: 'light', styleTags: [], sourceType: 'photo' }, whiteBackground)).rejects.toThrow('存储失败');
    expect(await db.media.count()).toBe(1);
  });

  it('示例 2 灵感：保存图片、名称、标签与用户确认后的分析；修改、删除；缺失与失败的返回', async () => {
    const { inspiration } = services();
    const created = await inspiration.create({
      name: '灰白叠穿通勤',
      tags: [{ text: '灰白', kind: 'color' }, { text: '简约', kind: 'style' }, { text: '宽松', kind: 'fit' }, { text: '叠穿', kind: 'layering' }, { text: '通勤', kind: 'scene' }],
      analysis: '喜欢灰白配色和叠穿，但不喜欢紧身裤' // 用户改写后的最终版本
    }, new Blob(['<灵感原图>']));
    expect(created).toMatchObject({ revision: 1, name: '灰白叠穿通勤' });
    expect(await inspiration.image(created.imageId)).toBeInstanceOf(Blob);

    // 修改：标签用整组替换（删旧标签、加新标签）；返回需要第 6 轮重新核对的自动归纳 ID。
    const { inspiration: edited, affectedSummaryIds } = await inspiration.update(created.id, { tags: [...created.tags, { text: '针织' }] }, created.revision);
    expect(edited.tags).toHaveLength(6); expect(affectedSummaryIds).toEqual([]);

    // 缺失：分析为空（未确认 / 分析失败）不能保存。
    await expect(inspiration.create({ name: '失败', tags: [], analysis: '' }, new Blob(['x']))).rejects.toThrow();
    // 冲突：旧 revision → '灵感已被修改，请刷新后重试'。
    await expect(inspiration.update(created.id, { name: '旧' }, 1)).rejects.toThrow('已被修改');
    // 删除：同时清理不再被引用的图片，并维护灵感归纳来源。
    expect(await inspiration.remove(created.id)).toEqual({ removedSummaryIds: [], affectedSummaryIds: [] });
  });
});
