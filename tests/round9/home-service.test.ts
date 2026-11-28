import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/modules/recommendation/ai-client', () => ({ requestAIRecommendation: vi.fn() }));
import { requestAIRecommendation } from '@/modules/recommendation/ai-client';
import { RecommendationCoreService } from '@/modules/recommendation/core-service';
import { cleanup, seedWardrobe, services } from '../round2/helpers';
import type { City } from '@/modules/weather';

const ai = vi.mocked(requestAIRecommendation);
let clock = new Date('2026-11-27T04:00:00Z');
async function setup() {
  const ctx = services(), ids = await seedWardrobe(ctx.wardrobe);
  await ctx.session.setCity('深圳');
  const weather = { current: vi.fn(async (city: City) => ({ city, temperature: 20, apparentTemperature: 19, temperatureMin: 16,
    temperatureMax: 24, weatherCode: 2, dataTime: clock.toISOString(), fetchedAt: clock.toISOString(), example: false, source: 'open-meteo' as const })) };
  const core = new RecommendationCoreService({ session: ctx.session, wardrobe: ctx.wardrobe, weather, now: () => clock });
  const result = (names: string[]) => ai.mockResolvedValue({ garmentIds: names.map(name => ids[name]), reason: '测试配色与层次', knowledgeVersion: 'V1.2' });
  result(['T1', 'B1', 'S1']);
  return { ...ctx, ids, weather, core, result };
}
beforeEach(() => { vi.resetAllMocks(); clock = new Date('2026-11-27T04:00:00Z'); });
afterEach(cleanup);

describe('R09 首页独立生成与更换（真实数据服务，模拟AI和天气）', () => {
  it('首页固定读取长期偏好，三种操作不读取或改变推荐页草稿、轮次、反馈', async () => {
    const ctx = await setup();
    await ctx.preferences.addExplicit('喜欢低饱和配色');
    await ctx.session.saveSettingsDraft({ memory: false, weather: false, preference: { enabled: true, text: '推荐页独有喜好', imageIds: [] }, scene: { enabled: true, selected: '上班', custom: '推荐页独有场景' } });
    const round = await ctx.session.commitNewRound({ weather: null, result: { garmentIds: [ctx.ids.T2, ctx.ids.B2, ctx.ids.S2], reason: '推荐页原结果' } });
    await ctx.session.saveFeedback({ expectedRoundId: round.roundId, resultId: round.currentResultId, choice: 'dislike', reason: '推荐页单次反馈', scope: 'once' });
    await ctx.session.saveFeedbackDraft({ roundId: round.roundId, resultId: round.currentResultId, choice: 'like', reason: '未提交草稿', scope: 'permanent' });
    const before = await ctx.session.readRound(), draft = await ctx.session.getSettingsDraft();
    await ctx.core.generateHome(); ctx.result(['T2', 'B1', 'S1']); await ctx.core.swapHomeOutfit();
    ctx.result(['T1', 'B1', 'S1']); await ctx.core.swapHomeItem(ctx.ids.T2);
    expect(await ctx.session.readRound()).toEqual(before); expect(await ctx.session.getSettingsDraft()).toEqual(draft);
    for (const [input] of ai.mock.calls) {
      expect(input.conditions.memory).toEqual([expect.stringContaining('低饱和')]);
      expect(input.conditions.weather?.city).toBe('深圳');
      expect(input.conditions.preference).toBeUndefined(); expect(input.conditions.scene).toBeUndefined(); expect(input.conditions.feedback).toBeUndefined();
    }
    expect((await ctx.session.readHome()).home?.adjustments).toHaveLength(2);
    ctx.db.close(); await ctx.db.open(); expect((await ctx.session.readHome()).current?.garmentIds).toEqual([ctx.ids.T1, ctx.ids.B1, ctx.ids.S1]);
  });

  it('切城、跨北京时间日期和修改长期偏好保留原画面，下次更换采用最新依据', async () => {
    const ctx = await setup(); await ctx.core.generateHome(); const old = await ctx.session.readHome();
    await ctx.session.setCity('上海'); clock = new Date('2026-11-27T16:01:00Z'); await ctx.preferences.addExplicit('新的长期偏好');
    expect(await ctx.session.readHome()).toEqual(old);
    ctx.result(['T2', 'B1', 'S1']); await ctx.core.swapHomeOutfit();
    expect(ai.mock.lastCall?.[0].conditions.weather).toMatchObject({ city: '上海', date: '2026-11-28' });
    expect(ai.mock.lastCall?.[0].conditions.memory).toEqual([expect.stringContaining('新的长期偏好')]);
  });

  it('删除B、暂停C后只换A，B/C快照完整保留；新整套排除它们', async () => {
    const ctx = await setup(); await ctx.core.generateHome(); const old = (await ctx.session.readHome()).current!;
    await ctx.wardrobe.update(ctx.ids.B1, { name: '后来改名' }, undefined, { id: 'new-image', blob: new Blob(['new']) });
    await ctx.wardrobe.remove(ctx.ids.B1); await ctx.wardrobe.pause(ctx.ids.S1, '2999-01-01');
    ctx.result(['T2', 'B1', 'S1']); expect((await ctx.core.swapHomeItem(ctx.ids.T1)).status).toBe('committed');
    const home = (await ctx.session.readHome()).current!;
    expect(home.snapshots.filter(item => item.id !== ctx.ids.T2)).toEqual(old.snapshots.filter(item => item.id !== ctx.ids.T1));
    expect(await ctx.session.resultStatus(home)).toMatchObject({ deleted: [{ id: ctx.ids.B1 }], paused: [{ id: ctx.ids.S1 }] });
    expect(ai.mock.lastCall?.[0].wardrobe.some(item => item.id === ctx.ids.B1 || item.id === ctx.ids.S1)).toBe(false);
    ctx.result(['T2', 'B2', 'S2']); await ctx.core.swapHomeOutfit();
    expect((await ctx.session.readHome()).current?.garmentIds).toEqual([ctx.ids.T2, ctx.ids.B2, ctx.ids.S2]);
  });

  it('推荐页单件替换也允许保留其他已删除/暂停位置', async () => {
    const ctx = await setup(); await ctx.session.saveSettingsDraft({ memory: false, weather: false, preference: { enabled: false, text: '', imageIds: [] }, scene: { enabled: false, selected: null, custom: '' } });
    const round = await ctx.session.commitNewRound({ weather: null, result: { garmentIds: [ctx.ids.T1, ctx.ids.B1, ctx.ids.S1], reason: '旧结果' } });
    await ctx.wardrobe.remove(ctx.ids.B1); await ctx.wardrobe.pause(ctx.ids.S1, '2999-01-01'); ctx.result(['T2', 'B1', 'S1']);
    expect((await ctx.core.swapItem(ctx.ids.T1)).status).toBe('committed');
    const updated = await ctx.session.readRound(); expect(updated.round?.roundId).toBe(round.roundId);
    expect(updated.current?.garmentIds).toEqual([ctx.ids.T2, ctx.ids.B1, ctx.ids.S1]);
  });

  it('相同整套、无同类替代、衣物不足不改变旧结果', async () => {
    const ctx = await setup(); await ctx.core.generateHome(); const old = await ctx.session.readHome();
    expect((await ctx.core.swapHomeOutfit()).status).toBe('no-alternative');
    await ctx.wardrobe.remove(ctx.ids.T2); expect((await ctx.core.swapHomeItem(ctx.ids.T1)).status).toBe('no-alternative');
    await ctx.wardrobe.remove(ctx.ids.S2); await ctx.wardrobe.remove(ctx.ids.S1);
    expect((await ctx.core.swapHomeOutfit()).status).toBe('insufficient-wardrobe'); expect(await ctx.session.readHome()).toEqual(old);
  });

  it.each(['weather', 'AI', 'image', 'save', 'abort'] as const)('%s 失败保留首页和推荐页旧状态', async failure => {
    const ctx = await setup(); await ctx.core.generateHome(); const before = await ctx.session.readHome(), round = await ctx.session.readRound();
    ctx.result(['T2', 'B1', 'S1']); const controller = new AbortController();
    if (failure === 'weather') ctx.weather.current.mockRejectedValue(new Error('天气失败'));
    if (failure === 'AI') ai.mockRejectedValue(new Error('模型失败'));
    if (failure === 'image') vi.spyOn(ctx.wardrobe, 'image').mockResolvedValue(undefined);
    if (failure === 'save') vi.spyOn(ctx.session, 'commitHome').mockRejectedValue(new Error('存储失败'));
    if (failure === 'abort') ai.mockImplementation(async () => { controller.abort(); return { garmentIds: [ctx.ids.T2, ctx.ids.B1, ctx.ids.S1], reason: 'x', knowledgeVersion: 'V1.2' }; });
    await expect(ctx.core.swapHomeOutfit({ signal: controller.signal })).rejects.toBeDefined();
    expect(await ctx.session.readHome()).toEqual(before); expect(await ctx.session.readRound()).toEqual(round);
  });

  it('拒绝改单件以外位置、生成中候选失效和过期天气，不提交结果', async () => {
    const ctx = await setup(); await ctx.core.generateHome(); const before = await ctx.session.readHome();
    ctx.result(['T2', 'B2', 'S1']); await expect(ctx.core.swapHomeItem(ctx.ids.T1)).rejects.toMatchObject({ code: 'AI_INVALID_SWAP_ITEM' });
    ai.mockImplementation(async () => { await ctx.wardrobe.remove(ctx.ids.T2); return { garmentIds: [ctx.ids.T2, ctx.ids.B1, ctx.ids.S1], reason: 'x', knowledgeVersion: 'V1.2' }; });
    await expect(ctx.core.swapHomeOutfit()).rejects.toMatchObject({ code: 'GARMENT_UNAVAILABLE' });
    ctx.result(['T1', 'B2', 'S1']); ctx.weather.current.mockImplementation(async city => ({ city, temperature: 20, apparentTemperature: 19, temperatureMin: 16, temperatureMax: 24, weatherCode: 2, dataTime: '2026-11-26T04:00:00Z', fetchedAt: clock.toISOString(), example: false, source: 'open-meteo' }));
    await expect(ctx.core.swapHomeOutfit()).rejects.toThrow('天气不是今天'); expect(await ctx.session.readHome()).toEqual(before);
  });
});
