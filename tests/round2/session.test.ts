import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { applyDraft, basisLabel, defaultSettingsDraft, stateKeys } from '@/modules/session';
import { cleanup, seedWardrobe, services, todayWeather } from './helpers';
afterEach(cleanup);

async function started() {
  const ctx = services(); const ids = await seedWardrobe(ctx.wardrobe);
  const weather = await todayWeather();
  const round = await ctx.session.commitNewRound({ weather, result: { garmentIds: [ids.T1, ids.B1, ids.S1], reason: '第一套' } });
  return { ...ctx, ids, weather, round };
}

describe('R02 设置草稿与已应用条件', () => {
  it('首次默认：记忆开、天气开、本次喜好与场景关且空；关闭或开启但为空按空处理', async () => {
    const { session } = services();
    const draft = await session.getSettingsDraft();
    expect(draft).toMatchObject({ memory: true, weather: true, preference: { enabled: false, text: '', imageIds: [] }, scene: { enabled: false, value: '' } });
    const off = applyDraft({ ...defaultSettingsDraft(), weather: false, preference: { enabled: false, text: '保留但关闭', imageIds: [] }, scene: { enabled: true, value: '  ' } }, null);
    expect(off).toMatchObject({ weather: null, preference: null, scene: null });
    expect(() => applyDraft(defaultSettingsDraft(), null)).toThrow('天气暂时无法获取');
  });

  it('生成依据只写实际使用的条件，日期精确到天', async () => {
    const weather = await todayWeather();
    const [, m, d] = weather.date.split('-').map(Number);
    expect(basisLabel({ weather, scene: '上班', preference: false, memory: true })).toBe(`深圳 · ${m}月${d}日天气 · 上班 · 长期偏好`);
    expect(basisLabel({ weather: null, scene: null, preference: false, memory: false })).toBe('');
  });
});

describe('R02 铁律 1：只有生成成功才开启新一轮', () => {
  it('修改草稿、更新城市、换整套、换单件都不改变轮次与已应用条件', async () => {
    const { session, ids, round } = await started();
    await session.saveSettingsDraft({ ...(await session.getSettingsDraft()), scene: { enabled: true, value: '约会' } });
    await session.setCity('北京');
    await session.commitAdjustment({ expectedRoundId: round.roundId, kind: 'swap-outfit', result: { garmentIds: [ids.T2, ids.B2, ids.S2], reason: '换一套' } });
    const after = await session.commitAdjustment({ expectedRoundId: round.roundId, kind: 'swap-item', targetGarmentId: ids.T2, result: { garmentIds: [ids.T1, ids.B2, ids.S2], reason: '换上衣' } });
    expect(after.roundId).toBe(round.roundId);
    expect(after.applied).toEqual(round.applied);
    expect(after.applied.scene).toBeNull();
    expect(after.applied.weather?.city).toBe('深圳');
    expect(after.adjustments.map(a => a.kind)).toEqual(['swap-outfit', 'swap-item']);
    expect((await session.getCity())).toBe('北京');
  });

  it('生成失败（含不可用衣物 / 天气缺失 / 写入故障）时旧结果、已应用条件与有效反馈完整保留', async () => {
    const { db, session, wardrobe, ids, round } = await started();
    await session.saveFeedback({ expectedRoundId: round.roundId, resultId: round.currentResultId, choice: 'dislike', reason: '今天不想穿白色', scope: 'once' });
    const before = await session.readRound();
    await wardrobe.pause(ids.T2, '2999-01-01');
    await expect(session.commitNewRound({ weather: await todayWeather(), result: { garmentIds: [ids.T2, ids.B2, ids.S2], reason: 'x' } })).rejects.toThrow('暂停中');
    await expect(session.commitNewRound({ weather: null, result: { garmentIds: [ids.T1, ids.B2, ids.S2], reason: 'x' } })).rejects.toThrow('天气暂时无法获取');
    const fail = () => { throw new Error('注入保存失败'); };
    db.results.hook('creating', fail);
    await expect(session.commitNewRound({ weather: await todayWeather(), result: { garmentIds: [ids.T1, ids.B2, ids.S2], reason: 'x' } })).rejects.toThrow('注入保存失败');
    db.results.hook('creating').unsubscribe(fail);
    expect(await session.readRound()).toEqual(before);
  });

  it('成功提交新一轮：一起切换结果、条件与轮次标识，清除旧轮结果、调整、单次反馈和反馈草稿', async () => {
    const { db, session, ids, round } = await started();
    await session.commitAdjustment({ expectedRoundId: round.roundId, kind: 'swap-outfit', result: { garmentIds: [ids.T2, ids.B2, ids.S2], reason: '换一套' } });
    await session.saveFeedback({ expectedRoundId: round.roundId, resultId: round.currentResultId, choice: 'like', reason: '', scope: 'once' });
    const { current } = await session.readRound();
    await session.saveFeedbackDraft({ roundId: round.roundId, resultId: current!.id, choice: null, reason: '写了一半', scope: 'once' });
    await session.saveSettingsDraft({ ...(await session.getSettingsDraft()), scene: { enabled: true, value: '上班' } });
    const next = await session.commitNewRound({ weather: await todayWeather(), result: { garmentIds: [ids.T1, ids.B1, ids.S2], reason: '新一轮' } });
    expect(next.roundId).not.toBe(round.roundId);
    expect(next).toMatchObject({ adjustments: [], feedback: [] });
    expect(next.applied.scene).toBe('上班');
    const view = await session.readRound();
    expect(view.results.map(r => r.reason)).toEqual(['新一轮']);
    expect(view.current?.basis.label).toContain('上班');
    expect(view.feedbackDraft).toBeUndefined();
    expect(await db.results.where('roundId').equals(round.roundId).count()).toBe(0);
  });
});

describe('R02 铁律 2：单次反馈在同一轮持续有效', () => {
  it('保存成功后连续更换仍读取；草稿与保存失败的反馈不生效；新轮成功后清除', async () => {
    const { db, session, ids, round } = await started();
    await session.saveFeedbackDraft({ roundId: round.roundId, resultId: round.currentResultId, choice: 'dislike', reason: '草稿', scope: 'once' });
    expect((await session.adjustmentContext())!.feedback).toEqual([]);
    expect((await session.readRound()).feedbackDraft?.reason).toBe('草稿');
    const fail = () => { throw new Error('注入反馈失败'); };
    db.state.hook('updating', fail);
    await expect(session.saveFeedback({ expectedRoundId: round.roundId, resultId: round.currentResultId, choice: 'dislike', reason: '今天不想穿黑色', scope: 'once' })).rejects.toThrow('注入反馈失败');
    db.state.hook('updating').unsubscribe(fail);
    expect((await session.adjustmentContext())!.feedback).toEqual([]);
    expect((await session.readRound()).feedbackDraft?.reason).toBe('草稿');
    await session.saveFeedback({ expectedRoundId: round.roundId, resultId: round.currentResultId, choice: 'dislike', reason: '今天不想穿黑色', scope: 'once' });
    expect((await session.readRound()).feedbackDraft).toBeUndefined();
    for (const [i, garmentIds] of [[ids.T2, ids.B2, ids.S2], [ids.T1, ids.B2, ids.S1], [ids.T2, ids.B1, ids.S1]].entries())
      await session.commitAdjustment({ expectedRoundId: round.roundId, kind: i ? 'feedback-swap' : 'swap-outfit', result: { garmentIds, reason: `第${i + 2}套` } });
    expect((await session.adjustmentContext())!.feedback.map(f => f.reason)).toEqual(['今天不想穿黑色']);
    await session.commitNewRound({ weather: await todayWeather(), result: { garmentIds: [ids.T1, ids.B1, ids.S1], reason: '新轮' } });
    expect((await session.adjustmentContext())!.feedback).toEqual([]);
  });

  it('永久反馈同时写入本轮与长期；修改/删除长期条目同步本轮副本；新轮后长期条目保留', async () => {
    const { session, preferences, ids, round } = await started();
    await session.saveFeedback({ expectedRoundId: round.roundId, resultId: round.currentResultId, choice: 'like', reason: '喜欢这套配色', scope: 'permanent' });
    await session.saveFeedback({ expectedRoundId: round.roundId, resultId: round.currentResultId, choice: 'dislike', reason: '外套太厚', scope: 'once' });
    const [entry] = await preferences.listActive('feedback');
    expect(entry.feedback?.outfit.snapshots.map(s => s.name)).toEqual(['T1', 'B1', 'S1']);
    expect((await session.readRound()).round!.feedback.find(f => f.preferenceId === entry.id)?.reason).toBe('喜欢这套配色');
    await preferences.edit(entry.id, { content: '很喜欢这套配色', choice: 'like' });
    let fb = (await session.readRound()).round!.feedback;
    expect(fb.map(f => f.reason)).toEqual(['很喜欢这套配色', '外套太厚']);
    await preferences.remove(entry.id);
    fb = (await session.readRound()).round!.feedback;
    expect(fb.map(f => f.reason)).toEqual(['外套太厚']);
    await session.saveFeedback({ expectedRoundId: round.roundId, resultId: round.currentResultId, choice: 'like', reason: '', scope: 'permanent' });
    await session.commitNewRound({ weather: await todayWeather(), result: { garmentIds: [ids.T2, ids.B2, ids.S2], reason: '新' } });
    const kept = await preferences.listActive('feedback');
    expect(kept).toHaveLength(1); expect(kept[0].content).toBe('');
    expect(kept[0].feedback?.outfit.garmentIds).toEqual([ids.T1, ids.B1, ids.S1]);
  });

  it('永久反馈写入长期失败时本轮也不新增，两处都保持原状', async () => {
    const { db, session, preferences, round } = await started();
    db.preferences.hook('creating', () => { throw new Error('注入长期写入失败'); });
    await expect(session.saveFeedback({ expectedRoundId: round.roundId, resultId: round.currentResultId, choice: 'like', reason: 'x', scope: 'permanent' })).rejects.toThrow('注入长期写入失败');
    expect((await session.readRound()).round!.feedback).toEqual([]);
    expect(await preferences.listActive()).toEqual([]);
  });

  it('记忆开启时连续调整读取最新长期条目；记忆关闭时不读取', async () => {
    const { session, preferences, ids } = await started();
    await preferences.addExplicit('喜欢宽松上衣');
    expect((await session.adjustmentContext())!.longTerm.map(p => p.content)).toEqual(['喜欢宽松上衣']);
    await session.saveSettingsDraft({ ...(await session.getSettingsDraft()), memory: false });
    await session.commitNewRound({ weather: await todayWeather(), result: { garmentIds: [ids.T2, ids.B2, ids.S2], reason: '无记忆' } });
    await preferences.addExplicit('新加的偏好');
    expect((await session.adjustmentContext())!.longTerm).toEqual([]);
    expect((await session.readRound()).current?.basis.label).not.toContain('长期偏好');
  });
});

describe('R02 铁律 3：首页与推荐页各自调整', () => {
  it('首页保存新结果与调整不影响推荐页；推荐页新轮也不影响首页；城市共享但不覆盖已应用天气', async () => {
    const { session, ids, round, weather } = await started();
    await session.saveFeedback({ expectedRoundId: round.roundId, resultId: round.currentResultId, choice: 'like', reason: '', scope: 'once' });
    const rec = await session.readRound();
    const home = await session.commitHome({ kind: 'generate', weather, result: { garmentIds: [ids.T2, ids.B2, ids.S2], reason: '今日穿搭' } });
    await session.commitHome({ kind: 'swap-item', weather, expectedResultId: home.currentResultId, targetGarmentId: ids.T2, result: { garmentIds: [ids.T1, ids.B2, ids.S2], reason: '首页换件' } });
    expect(await session.readRound()).toEqual(rec);
    const homeView = await session.readHome();
    expect(homeView.home?.adjustments).toHaveLength(1);
    expect(homeView.current?.basis.label).toContain('长期偏好');
    await session.commitNewRound({ weather, result: { garmentIds: [ids.T2, ids.B1, ids.S1], reason: '推荐页新轮' } });
    expect(await session.readHome()).toEqual(homeView);
    await session.setCity('上海');
    expect((await session.readRound()).round!.applied.weather?.city).toBe('深圳');
  });
});

describe('R02 衣物状态与旧搭配快照', () => {
  it('删除/暂停 B 后换 A：只换 A，B 保留并提示；新整套必须排除 B；旧图仍可读', async () => {
    const { session, wardrobe, ids, round } = await started();
    await wardrobe.remove(ids.B1);
    await wardrobe.pause(ids.S1, '2999-01-01');
    const { current } = await session.readRound();
    expect((await session.resultStatus(current!))).toMatchObject({ deleted: [{ name: 'B1' }], paused: [{ name: 'S1' }] });
    expect(await (await wardrobe.image(current!.snapshots[1].imageId))?.text()).toBe('img-B1');
    const swapped = await session.commitAdjustment({ expectedRoundId: round.roundId, kind: 'swap-item', targetGarmentId: ids.T1, result: { garmentIds: [ids.T2, ids.B1, ids.S1], reason: '只换 A' } });
    expect(swapped.adjustments).toHaveLength(1);
    await expect(session.commitAdjustment({ expectedRoundId: round.roundId, kind: 'swap-item', targetGarmentId: ids.T2, result: { garmentIds: [ids.T1, ids.B2, ids.S1], reason: '多换了' } })).rejects.toThrow('只能替换指定单品');
    await expect(session.commitAdjustment({ expectedRoundId: round.roundId, kind: 'swap-outfit', result: { garmentIds: [ids.T1, ids.B1, ids.S2], reason: 'x' } })).rejects.toThrow('已删除');
    await expect(session.commitAdjustment({ expectedRoundId: round.roundId, kind: 'swap-outfit', result: { garmentIds: [ids.T2, ids.B1, ids.S1], reason: '同一套' } })).rejects.toThrow('暂无其他符合要求的搭配');
  });

  it('刷新（重开数据库）后恢复当前搭配、本轮标识、已应用条件、有效反馈、调整记录、设置草稿和反馈草稿', async () => {
    const { db, session, ids, round } = await started();
    await session.saveSettingsDraft({ ...(await session.getSettingsDraft()), preference: { enabled: true, text: '想穿亮一点', imageIds: [] } });
    await session.saveFeedback({ expectedRoundId: round.roundId, resultId: round.currentResultId, choice: 'like', reason: '', scope: 'once' });
    await session.commitAdjustment({ expectedRoundId: round.roundId, kind: 'swap-outfit', result: { garmentIds: [ids.T2, ids.B2, ids.S2], reason: '换' } });
    const { current } = await session.readRound();
    await session.saveFeedbackDraft({ roundId: round.roundId, resultId: current!.id, choice: 'dislike', reason: '未提交', scope: 'permanent' });
    const before = { view: await session.readRound(), draft: await session.getSettingsDraft() };
    const name = db.name; db.close();
    const again = services(name);
    expect(await again.session.readRound()).toEqual(before.view);
    expect(await again.session.getSettingsDraft()).toEqual(before.draft);
    expect((await again.session.adjustmentContext())!.feedback).toHaveLength(1);
  });

  it('本次喜好参考图：草稿仍引用则保留，新轮成功后旧轮专用的图才释放，不进入灵感库', async () => {
    const { db, session, inspiration, ids } = await started();
    const img = await session.addReferenceImage(new Blob(['ref']));
    await session.saveSettingsDraft({ ...(await session.getSettingsDraft()), preference: { enabled: true, text: '', imageIds: [img] } });
    const r2 = await session.commitNewRound({ weather: await todayWeather(), result: { garmentIds: [ids.T2, ids.B2, ids.S2], reason: '用参考图' } });
    expect(r2.applied.preference?.imageIds).toEqual([img]);
    await session.saveSettingsDraft({ ...(await session.getSettingsDraft()), preference: { enabled: true, text: '', imageIds: [] } });
    expect(await db.media.get(img)).toBeDefined(); // 本轮已应用条件仍引用
    await session.commitNewRound({ weather: await todayWeather(), result: { garmentIds: [ids.T1, ids.B1, ids.S1], reason: '无参考图' } });
    expect(await db.media.get(img)).toBeUndefined();
    expect(await inspiration.list()).toEqual([]);
    expect(await db.state.get(stateKeys.round)).toBeDefined();
  });

  it('过期轮次的调整与反馈被拒绝，不写入当前轮', async () => {
    const { session, ids, round } = await started();
    await session.commitNewRound({ weather: await todayWeather(), result: { garmentIds: [ids.T2, ids.B2, ids.S2], reason: '新轮' } });
    await expect(session.commitAdjustment({ expectedRoundId: round.roundId, kind: 'swap-outfit', result: { garmentIds: [ids.T1, ids.B1, ids.S1], reason: 'x' } })).rejects.toThrow('本轮已变化');
    await expect(session.saveFeedback({ expectedRoundId: round.roundId, resultId: round.currentResultId, choice: 'like', reason: '', scope: 'once' })).rejects.toThrow('本轮已变化');
  });
});
