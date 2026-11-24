import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { summarizeInspirations } from '@/modules/inspiration/summaries';
import { cleanup, seedWardrobe, services, todayWeather } from '../round2/helpers';
afterEach(cleanup);

/** 第 7 轮「我的偏好」页面所依赖的数据行为：页面只调用这些服务，这里按验收项逐条核对。 */

const reopen = (name: string) => services(name);
const contents = async (ctx: ReturnType<typeof services>, group?: 'explicit' | 'inspiration' | 'feedback') =>
  (await ctx.preferences.listActive(group)).map(p => p.content);

describe('R07 明确偏好：添加、编辑、取消、删除、刷新', () => {
  it('保存成功才出现；同一次添加重复点击只保存一条；刷新后仍在', async () => {
    const name = `wearwise-test-${crypto.randomUUID()}`;
    const ctx = services(name);
    const requestId = crypto.randomUUID();
    await ctx.preferences.addExplicit('喜欢直筒裤', requestId);
    await ctx.preferences.addExplicit('喜欢直筒裤', requestId);
    expect(await contents(reopen(name), 'explicit')).toEqual(['喜欢直筒裤']);
  });

  it('空内容保存失败，不出现新条目', async () => {
    const ctx = services();
    await expect(ctx.preferences.addExplicit('   ')).rejects.toThrow();
    expect(await ctx.preferences.listActive()).toEqual([]);
  });

  it('编辑后使用新内容；取消（不调用保存）保留原值；删除后不再读取', async () => {
    const name = `wearwise-test-${crypto.randomUUID()}`;
    const ctx = services(name);
    const p = await ctx.preferences.addExplicit('喜欢直筒裤');
    const edited = await ctx.preferences.edit(p.id, { content: '喜欢阔腿裤' }, p.revision);
    expect(edited).toMatchObject({ content: '喜欢阔腿裤', revision: 2, userEdited: true });
    expect(await contents(reopen(name), 'explicit')).toEqual(['喜欢阔腿裤']);
    await ctx.preferences.remove(p.id);
    expect(await contents(reopen(name))).toEqual([]);
  });

  it('用旧 revision 保存会被拒绝，不覆盖别处刚保存的内容', async () => {
    const ctx = services();
    const p = await ctx.preferences.addExplicit('不喜欢亮色');
    await ctx.preferences.edit(p.id, { content: '不喜欢大面积亮色' }, p.revision);
    await expect(ctx.preferences.edit(p.id, { content: '旧页面的修改' }, p.revision)).rejects.toThrow('已被修改');
    expect(await contents(ctx, 'explicit')).toEqual(['不喜欢大面积亮色']);
  });
});

describe('R07 灵感归纳：用户的编辑和删除不被源灵感变化覆盖或恢复', () => {
  async function withInspiration(analysis: string) {
    const ctx = services();
    const item = await ctx.inspiration.create({ name: '灵感', tags: [], analysis }, new Blob(['img']));
    const sync = async () => ctx.preferences.reconcileInspirationSummaries(summarizeInspirations(await ctx.inspiration.list()));
    await sync();
    return { ctx, item, sync };
  }

  it('客观描述不产生归纳；明确喜好产生归纳', async () => {
    const objective = await withInspiration('照片里是一件灰色上衣和深色长裤。');
    expect(await objective.ctx.preferences.listActive('inspiration')).toEqual([]);
    const liked = await withInspiration('我喜欢灰白配色，但不喜欢紧身裤。');
    expect((await contents(liked.ctx, 'inspiration')).length).toBe(2);
  });

  it('手动编辑后，修改或删除源灵感都不会覆盖用户内容', async () => {
    const { ctx, item, sync } = await withInspiration('我喜欢灰白配色。');
    const [summary] = await ctx.preferences.listActive('inspiration');
    await ctx.preferences.edit(summary.id, { content: '喜欢低饱和灰白配色' }, summary.revision);
    const latest = (await ctx.inspiration.list())[0];
    await ctx.inspiration.update(item.id, { analysis: '我喜欢灰白配色，也喜欢宽松外套。' }, latest.revision);
    await sync();
    expect(await contents(ctx, 'inspiration')).toContain('喜欢低饱和灰白配色');
    await ctx.inspiration.remove(item.id);
    await sync();
    expect(await contents(ctx, 'inspiration')).toEqual(['喜欢低饱和灰白配色']);
  });

  it('主动删除后，再次保存相同灵感也不会自动恢复', async () => {
    const { ctx, sync } = await withInspiration('我喜欢灰白配色。');
    const [summary] = await ctx.preferences.listActive('inspiration');
    await ctx.preferences.remove(summary.id);
    expect(await ctx.preferences.listActive('inspiration')).toEqual([]);
    await ctx.inspiration.create({ name: '另一张', tags: [], analysis: '我喜欢灰白配色。' }, new Blob(['img2']));
    await sync();
    expect(await ctx.preferences.listActive('inspiration')).toEqual([]);
  });
});

describe('R07 永久反馈：快照、修改、删除与本轮副本同步', () => {
  async function withPermanentFeedback(reason = '不喜欢深色裤装') {
    const name = `wearwise-test-${crypto.randomUUID()}`;
    const ctx = services(name);
    const ids = await seedWardrobe(ctx.wardrobe);
    const round = await ctx.session.commitNewRound({ weather: await todayWeather(), result: { garmentIds: [ids.T1, ids.B1, ids.S1], reason: '第一套' } });
    await ctx.session.saveFeedback({ expectedRoundId: round.roundId, resultId: round.currentResultId, choice: 'dislike', reason, scope: 'permanent' });
    const [feedback] = await ctx.preferences.listActive('feedback');
    return { name, ctx, ids, round, feedback };
  }

  it('缩略图是评价当时的快照：之后改名、换图、删除衣物都不影响', async () => {
    const { ctx, ids, feedback } = await withPermanentFeedback();
    const before = feedback.feedback!.outfit.snapshots.map(s => ({ name: s.name, imageId: s.imageId }));
    await ctx.wardrobe.update(ids.T1, { name: '改名后的上衣' }, undefined, { id: 'new-img', blob: new Blob(['new']) });
    await ctx.wardrobe.remove(ids.B1);
    const [after] = await ctx.preferences.listActive('feedback');
    expect(after.feedback!.outfit.snapshots.map(s => ({ name: s.name, imageId: s.imageId }))).toEqual(before);
    for (const s of after.feedback!.outfit.snapshots) expect(await ctx.wardrobe.image(s.imageId)).toBeDefined();
  });

  it('修改评价和原因后长期条目与本轮副本同步；删除后两处都移除', async () => {
    const { name, ctx, feedback } = await withPermanentFeedback();
    await ctx.preferences.edit(feedback.id, { content: '更偏好浅色下装', choice: 'like' }, feedback.revision);
    const [edited] = await reopen(name).preferences.listActive('feedback');
    expect(edited).toMatchObject({ content: '更偏好浅色下装', feedback: { choice: 'like' } });
    let { round } = await ctx.session.readRound();
    expect(round!.feedback.find(f => f.preferenceId === feedback.id)).toMatchObject({ reason: '更偏好浅色下装', choice: 'like' });
    await ctx.preferences.remove(feedback.id);
    expect(await ctx.preferences.listActive('feedback')).toEqual([]);
    ({ round } = await ctx.session.readRound());
    expect(round!.feedback.some(f => f.preferenceId === feedback.id)).toBe(false);
  });

  it('原因可以清空：只保留对整套的态度', async () => {
    const { ctx, feedback } = await withPermanentFeedback();
    expect(await ctx.preferences.edit(feedback.id, { content: '' }, feedback.revision)).toMatchObject({ content: '', feedback: { choice: 'dislike' } });
  });
});

describe('R07 推荐读取最新的长期记录，受记忆开关控制', () => {
  it('修改和删除后，新一轮读取的是最新有效记录；关闭记忆时不读取', async () => {
    const ctx = services();
    const a = await ctx.preferences.addExplicit('喜欢直筒裤');
    const b = await ctx.preferences.addExplicit('不喜欢亮色');
    await ctx.preferences.edit(a.id, { content: '喜欢阔腿裤' }, a.revision);
    await ctx.preferences.remove(b.id);
    expect((await ctx.session.newRoundContext()).longTerm.map(p => p.content)).toEqual(['喜欢阔腿裤']);
    await ctx.session.saveSettingsDraft({ ...(await ctx.session.getSettingsDraft()), memory: false });
    expect((await ctx.session.newRoundContext()).longTerm).toEqual([]);
  });
});
