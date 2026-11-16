import type { Weather, City } from '@/modules/weather';
import type { Garment, WardrobeService } from '@/modules/wardrobe';
import type { Preference, PreferenceService } from '@/modules/preferences';
import { beijingDate } from '@/shared/domain/beijing-date';
import {
  settingsDraftSchema, weatherSnapshotSchema, type AppliedConditions, type FeedbackDraft, type GarmentSnapshot, type HomeState,
  type OutfitResult, type RoundFeedback, type RoundState, type SettingsDraft, type Surface, type WeatherSnapshot
} from './schema';
export * from './schema';

export type AdjustmentKind = 'swap-outfit' | 'swap-item' | 'feedback-swap';
/** 推荐内核（第 4/8 轮）交给本服务保存的结果：衣物 ID、平铺位置、理由与依据。快照由存储层在同一事务中按当前衣物生成。 */
export interface ResultDraft {
  garmentIds: string[];
  reason: string;
  flatLay?: OutfitResult['flatLay'];
  knowledgeVersion?: string;
}
export interface FeedbackInput {
  expectedRoundId: string; resultId: string; choice: 'like' | 'dislike'; reason: string; scope: 'once' | 'permanent'; requestId?: string;
}
export interface RoundView {
  round?: RoundState; current?: OutfitResult; results: OutfitResult[]; feedbackDraft?: FeedbackDraft;
}

/** 推荐过程状态的持久化端口。每个写方法都是一次原子事务：失败时旧状态完整保留。 */
export interface SessionStore {
  getCity(): Promise<City | undefined>;
  setCity(city: City): Promise<void>;
  getSettingsDraft(): Promise<SettingsDraft | undefined>;
  saveSettingsDraft(draft: SettingsDraft): Promise<void>;
  addReferenceImage(blob: Blob): Promise<string>;
  readRound(): Promise<RoundView>;
  commitNewRound(input: { roundId: string; applied: AppliedConditions; result: OutfitResult }, now: Date): Promise<RoundState>;
  commitAdjustment(input: { expectedRoundId: string; kind: AdjustmentKind; targetGarmentId?: string; result: OutfitResult }, now: Date): Promise<RoundState>;
  saveFeedback(input: FeedbackInput & { feedbackId: string; preference?: Preference }): Promise<RoundState>;
  saveFeedbackDraft(draft: FeedbackDraft): Promise<void>;
  clearFeedbackDraft(): Promise<void>;
  readHome(): Promise<{ home?: HomeState; current?: OutfitResult }>;
  commitHome(input: { kind: 'generate' | AdjustmentKind; expectedResultId?: string; targetGarmentId?: string; result: OutfitResult }, now: Date): Promise<HomeState>;
  getResult(id: string): Promise<OutfitResult | undefined>;
  /** 存储层在事务内读取当前衣物生成快照。 */
  snapshotGarments(ids: string[]): Promise<Garment[]>;
}

export const defaultSettingsDraft = (now = new Date()): SettingsDraft => ({
  memory: true, weather: true,
  preference: { enabled: false, text: '', imageIds: [] },
  scene: { enabled: false, value: '' },
  updatedAt: now.toISOString()
});

/** 把页面天气转成“城市＋北京日期”的依据快照。 */
export function toWeatherSnapshot(weather: Weather & { temperatureMin?: number | null; temperatureMax?: number | null }, usedFields: string[] = ['apparentTemperature']): WeatherSnapshot {
  return weatherSnapshotSchema.parse({
    city: weather.city, date: beijingDate(weather.dataTime), weatherCode: weather.weatherCode ?? null,
    temperature: weather.temperature, apparentTemperature: weather.apparentTemperature,
    temperatureMin: weather.temperatureMin ?? null, temperatureMax: weather.temperatureMax ?? null,
    source: weather.source ?? (weather.example ? 'example' : 'open-meteo'), usedFields
  });
}

/** 由设置区草稿得到待应用条件：关闭或开启但为空的条件按空处理；天气开启时必须提供当日依据。 */
export function applyDraft(draft: SettingsDraft, weather: WeatherSnapshot | null, now = new Date()): AppliedConditions {
  if (draft.weather && !weather) throw new Error('天气暂时无法获取，请重试。');
  if (draft.weather && weather && weather.date !== beijingDate(now)) throw new Error('天气不是今天的数据，请重新获取。');
  const text = draft.preference.text.trim(), scene = draft.scene.value.trim();
  return {
    memory: draft.memory,
    weather: draft.weather ? weather : null,
    preference: draft.preference.enabled && (text || draft.preference.imageIds.length) ? { text, imageIds: [...draft.preference.imageIds] } : null,
    scene: draft.scene.enabled && scene ? scene : null,
    appliedAt: now.toISOString()
  };
}

/** 生成依据文字：只写实际采用的条件，日期精确到天。 */
export function basisLabel(input: { weather: WeatherSnapshot | null; scene: string | null; preference: boolean; memory: boolean }) {
  const parts: string[] = [];
  if (input.weather) { const [, m, d] = input.weather.date.split('-').map(Number); parts.push(`${input.weather.city} · ${m}月${d}日天气`); }
  if (input.scene) parts.push(input.scene);
  if (input.preference) parts.push('本次喜好');
  if (input.memory) parts.push('长期偏好');
  return parts.join(' · ');
}

const layerOf: Record<Garment['category'], number> = { shoes: 0, bottom: 1, dress: 1, top: 2, outerwear: 3 };
export function snapshotOf(g: Garment): GarmentSnapshot {
  return { id: g.id, name: g.name, category: g.category, color: g.color, fit: g.fit, warmth: g.warmth, ...(g.material ? { material: g.material } : {}), styleTags: [...g.styleTags], imageId: g.imageId };
}
export function buildResult(surface: Surface, roundId: string | null, garments: Garment[], draft: ResultDraft, basis: OutfitResult['basis'], now = new Date()): OutfitResult {
  const byId = new Map(garments.map(g => [g.id, g]));
  const snapshots = draft.garmentIds.map(id => { const g = byId.get(id); if (!g) throw new Error('搭配中的衣物不存在'); return snapshotOf(g); });
  return {
    id: crypto.randomUUID(), surface, roundId, garmentIds: [...draft.garmentIds], snapshots,
    flatLay: draft.flatLay ?? snapshots.map(s => ({ garmentId: s.id, slot: s.category, layer: layerOf[s.category] })),
    reason: draft.reason, basis, createdAt: now.toISOString()
  };
}

export class SessionService {
  constructor(private readonly store: SessionStore, private readonly wardrobe: WardrobeService, private readonly preferences: PreferenceService) {}

  // —— 共享城市（首页与推荐页共用）——
  getCity() { return this.store.getCity(); }
  setCity(city: City) { return this.store.setCity(city); }

  // —— 推荐页设置区草稿 ——
  async getSettingsDraft() { return (await this.store.getSettingsDraft()) ?? defaultSettingsDraft(); }
  /** 修改草稿不生成、不清除本轮数据。 */
  saveSettingsDraft(draft: Omit<SettingsDraft, 'updatedAt'>) { return this.store.saveSettingsDraft(settingsDraftSchema.parse({ ...draft, updatedAt: new Date().toISOString() })); }
  /** 本次喜好参考图：只作为本轮条件或草稿，不进入灵感库。 */
  addReferenceImage(blob: Blob) { return this.store.addReferenceImage(blob); }

  // —— 推荐页本轮 ——
  readRound() { return this.store.readRound(); }
  /**
   * 点击“生成穿搭”且结果已通过校验后调用：一次性替换已应用条件、当前结果和轮次标识，并清理旧轮临时数据。
   * 任一环节失败都抛错，旧结果、已应用条件和有效反馈保持不变。
   */
  async commitNewRound(input: { weather: WeatherSnapshot | null; result: ResultDraft; memoryUsed?: boolean }, now = new Date()) {
    const draft = await this.getSettingsDraft();
    const applied = applyDraft(draft, input.weather, now);
    const roundId = crypto.randomUUID();
    const memory = input.memoryUsed ?? applied.memory;
    const basis = { label: basisLabel({ weather: applied.weather, scene: applied.scene, preference: !!applied.preference, memory }), memory, weather: applied.weather, preference: !!applied.preference, scene: applied.scene, ...(input.result.knowledgeVersion ? { knowledgeVersion: input.result.knowledgeVersion } : {}) };
    const result = buildResult('recommendations', roundId, await this.store.snapshotGarments(input.result.garmentIds), input.result, basis, now);
    return this.store.commitNewRound({ roundId, applied, result }, now);
  }
  /** 换一套 / 换掉这件 / 根据反馈换一套：沿用本轮已应用条件，不开新轮、不清反馈。 */
  async commitAdjustment(input: { expectedRoundId: string; kind: AdjustmentKind; targetGarmentId?: string; result: ResultDraft }, now = new Date()) {
    const { round } = await this.store.readRound();
    if (!round || round.roundId !== input.expectedRoundId) throw new Error('本轮已变化，请刷新后重试。');
    const a = round.applied;
    const basis = { label: basisLabel({ weather: a.weather, scene: a.scene, preference: !!a.preference, memory: a.memory }), memory: a.memory, weather: a.weather, preference: !!a.preference, scene: a.scene, ...(input.result.knowledgeVersion ? { knowledgeVersion: input.result.knowledgeVersion } : {}) };
    const result = buildResult('recommendations', round.roundId, await this.store.snapshotGarments(input.result.garmentIds), input.result, basis, now);
    return this.store.commitAdjustment({ expectedRoundId: input.expectedRoundId, kind: input.kind, targetGarmentId: input.targetGarmentId, result }, now);
  }
  /** 连续调整时可读取的全部输入：本轮已应用条件、本轮有效反馈（按提交顺序）、开启记忆时的最新有效长期记录、当前候选衣物。 */
  async adjustmentContext(now = new Date()) {
    const { round, current } = await this.store.readRound();
    if (!round) return undefined;
    return {
      applied: round.applied, current, feedback: [...round.feedback].sort((a, b) => a.order - b.order),
      longTerm: round.applied.memory ? await this.preferences.listActive() : [],
      candidates: await this.wardrobe.candidates(now)
    };
  }
  /** 新一轮生成可读取的输入：最新草稿、开启记忆时的长期记录、当前候选衣物；不继承旧轮临时反馈。 */
  async newRoundContext(now = new Date()) {
    const draft = await this.getSettingsDraft();
    return { draft, longTerm: draft.memory ? await this.preferences.listActive() : [], candidates: await this.wardrobe.candidates(now) };
  }

  // —— 反馈 ——
  /** 保存成功才生效；永久适用同时写入“我的偏好”的永久反馈与本轮反馈。 */
  async saveFeedback(input: FeedbackInput) {
    const feedbackId = input.requestId ?? crypto.randomUUID();
    let preference: Preference | undefined;
    if (input.scope === 'permanent') {
      const result = await this.store.getResult(input.resultId);
      if (!result) throw new Error('搭配不存在，请刷新后重试。');
      const now = new Date().toISOString();
      preference = { id: `pf-${feedbackId}`, group: 'feedback', content: input.reason.trim(), state: 'active', userEdited: false,
        feedback: { choice: input.choice, outfit: { resultId: result.id, garmentIds: [...result.garmentIds], snapshots: result.snapshots }, roundId: input.expectedRoundId, roundFeedbackId: feedbackId },
        revision: 1, createdAt: now, updatedAt: now };
    }
    return this.store.saveFeedback({ ...input, reason: input.reason.trim(), feedbackId, preference });
  }
  saveFeedbackDraft(draft: Omit<FeedbackDraft, 'updatedAt'>) { return this.store.saveFeedbackDraft({ ...draft, updatedAt: new Date().toISOString() }); }
  clearFeedbackDraft() { return this.store.clearFeedbackDraft(); }

  // —— 首页今日穿搭（与推荐页独立）——
  readHome() { return this.store.readHome(); }
  /** 首页固定使用长期记忆与当前城市当天天气，不读推荐页开关、喜好、场景或单次反馈。 */
  async commitHome(input: { kind: 'generate' | AdjustmentKind; weather: WeatherSnapshot; expectedResultId?: string; targetGarmentId?: string; result: ResultDraft }, now = new Date()) {
    if (input.weather.date !== beijingDate(now)) throw new Error('天气不是今天的数据，请重新获取。');
    const basis = { label: basisLabel({ weather: input.weather, scene: null, preference: false, memory: true }), memory: true, weather: input.weather, preference: false, scene: null, ...(input.result.knowledgeVersion ? { knowledgeVersion: input.result.knowledgeVersion } : {}) };
    const result = buildResult('home', null, await this.store.snapshotGarments(input.result.garmentIds), input.result, basis, now);
    return this.store.commitHome({ kind: input.kind, expectedResultId: input.expectedResultId, targetGarmentId: input.targetGarmentId, result }, now);
  }

  /** 旧搭配中已删除或已暂停的衣物（用于“存在已删除衣物 / 存在已暂停搭配衣物”提示）。 */
  async resultStatus(result: OutfitResult, now = new Date()) {
    const statuses = await this.wardrobe.statuses(result.garmentIds, now);
    return {
      deleted: result.snapshots.filter(s => statuses[s.id] === 'deleted' || statuses[s.id] === 'missing'),
      paused: result.snapshots.filter(s => statuses[s.id] === 'paused')
    };
  }
}
export type { RoundFeedback };
