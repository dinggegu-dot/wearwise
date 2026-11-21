
import type { Garment } from '@/modules/wardrobe';
import { WardrobeService } from '@/modules/wardrobe';
import type { Weather, WeatherProvider } from '@/modules/weather';

import {
  SessionService,
  applyDraft,
  toWeatherSnapshot,
  type RoundState,
  type SettingsDraft,
  type WeatherSnapshot,
  type HomeState
} from '@/modules/session';

import { requestAIRecommendation, type AIRecommendationConditions } from './ai-client';

export class RecommendationCoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = 'RecommendationCoreError';
  }
}

export type NewRoundResult =
  | {
      status: 'committed';
      round: RoundState;
      garmentIds: string[];
      knowledgeVersion: string;
    }
  | {
      status: 'insufficient-wardrobe';
      message: string;
    };

export type SwapOutfitResult =
  | {
      status: 'committed';
      round: RoundState;
      garmentIds: string[];
      knowledgeVersion: string;
    }
  | {
      status: 'no-current-outfit';
      message: string;
    }
  | {
      status: 'insufficient-wardrobe';
      message: string;
    }
  | {
      status: 'no-alternative';
      message: string;
    }
    | {
      status: 'no-feedback';
      message: string;
    }  ;


export type SwapItemResult =
  | {
      status: 'committed';
      round: RoundState;
      garmentIds: string[];
      knowledgeVersion: string;
    }
  | {
      status: 'no-current-outfit';
      message: string;
    }
  | {
      status: 'no-alternative';
      message: string;
    };

export type HomeRecommendationResult =
  | {
      status: 'committed';
      home: HomeState;
      garmentIds: string[];
      knowledgeVersion: string;
    }
  | {
      status: 'insufficient-wardrobe';
      message: string;
    };

export interface RecommendationCoreDependencies {
  session: SessionService;
  wardrobe: WardrobeService;
  weather: WeatherProvider;
  now?: () => Date;
}

/**
 * 只比较真正影响推荐的设置。
 * 不比较 updatedAt，避免草稿时间变化造成误判。
 */
function sameConditions(a: SettingsDraft, b: SettingsDraft): boolean {
  return (
    a.memory === b.memory &&
    a.weather === b.weather &&
    a.preference.enabled === b.preference.enabled &&
    a.preference.text === b.preference.text &&
    JSON.stringify(a.preference.imageIds) ===
      JSON.stringify(b.preference.imageIds) &&
    a.scene.enabled === b.scene.enabled &&
    a.scene.selected === b.scene.selected &&
    a.scene.custom === b.scene.custom &&
    JSON.stringify(a.preference.styleTags) === JSON.stringify(b.preference.styleTags)
  );
}

/**
 * 常规搭配：上衣 + 下装 + 鞋。
 * 连衣裙搭配：连衣裙 + 鞋。
 * 外套为可选叠穿单品。
 */
function hasCompleteOutfit(garments: Garment[]): boolean {
  const hasShoes = garments.some(g => g.category === 'shoes');

  const hasRegular =
    garments.some(g => g.category === 'top') &&
    garments.some(g => g.category === 'bottom');

  const hasDress = garments.some(g => g.category === 'dress');

  return hasShoes && (hasRegular || hasDress);
}

/**
 * 验证 AI 返回的搭配是否符合基本结构。
 */
function validateOutfit(
  garmentIds: string[],
  garments: Garment[]
): boolean {
  if (
    garmentIds.length === 0 ||
    garmentIds.length > 8 ||
    new Set(garmentIds).size !== garmentIds.length
  ) {
    return false;
  }

  const byId = new Map(garments.map(g => [g.id, g]));
  const selected = garmentIds.map(id => byId.get(id));

  if (selected.some(g => !g)) return false;

  const items = selected as Garment[];

  const count = (category: Garment['category']) =>
    items.filter(g => g.category === category).length;

  const shoes = count('shoes');
  const tops = count('top');
  const bottoms = count('bottom');
  const dresses = count('dress');
  const outerwear = count('outerwear');

  if (shoes !== 1 || outerwear > 1) return false;

  const regular =
    tops === 1 &&
    bottoms === 1 &&
    dresses === 0;

  const dress =
    dresses === 1 &&
    tops === 0 &&
    bottoms === 0;

  return regular || dress;
}

/**
 * 比较两套搭配是否使用完全相同的衣物，不考虑 ID 顺序。
 */
function isSameCombination(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;

  const sortedA = [...a].sort();
  const sortedB = [...b].sort();

  return sortedA.every((id, index) => id === sortedB[index]);
}

export class RecommendationCoreService {
  private readonly session: SessionService;
  private readonly wardrobe: WardrobeService;
  private readonly weather: WeatherProvider;
  private readonly now: () => Date;

  constructor(dependencies: RecommendationCoreDependencies) {
    this.session = dependencies.session;
    this.wardrobe = dependencies.wardrobe;
    this.weather = dependencies.weather;
    this.now = dependencies.now ?? (() => new Date());
  }

  /**
   * 新一轮生成：读取最新草稿；不继承旧轮临时反馈。
   */
  async generateNewRound(
    options: { signal?: AbortSignal } = {}
  ): Promise<NewRoundResult> {
    const now = this.now();

    // 1. 读取新一轮上下文。
    const context = await this.session.newRoundContext(now);
    const { draft, candidates, longTerm } = context;

    // 2. 衣橱完整性检查。
    if (!hasCompleteOutfit(candidates)) {
      return {
        status: 'insufficient-wardrobe',
        message:
          '当前可用衣橱不足以组成完整搭配，需要上衣、下装和鞋，或连衣裙和鞋。'
      };
    }

    // 3. 根据天气开关获取天气。
    let weatherSnapshot: WeatherSnapshot | null = null;

    if (draft.weather) {
      const city = await this.session.getCity();

      if (!city) {
        throw new RecommendationCoreError(
          'CITY_REQUIRED',
          '请先选择城市，再生成穿搭。'
        );
      }

      let weather: Weather;

      try {
        weather = await this.weather.current(city, options.signal);
      } catch {
        throw new RecommendationCoreError(
          'WEATHER_UNAVAILABLE',
          '天气暂时无法获取，请重试。',
          true
        );
      }

      if (weather.example || weather.source === 'example') {
        throw new RecommendationCoreError(
          'WEATHER_UNAVAILABLE',
          '当前天气数据不是实时天气，请重新获取。',
          true
        );
      }

      const usedFields = [
        'temperature',
        'apparentTemperature'
      ];

      if (
        weather.weatherCode !== null &&
        weather.weatherCode !== undefined
      ) {
        usedFields.push('weatherCode');
      }

      if (
        weather.temperatureMin !== null &&
        weather.temperatureMin !== undefined
      ) {
        usedFields.push('temperatureMin');
      }

      if (
        weather.temperatureMax !== null &&
        weather.temperatureMax !== undefined
      ) {
        usedFields.push('temperatureMax');
      }

      weatherSnapshot = toWeatherSnapshot(weather, usedFields);
    }

    // 4. 由 Session 统一处理四项开关和空值。
    const applied = applyDraft(draft, weatherSnapshot, now);

    // 5. 构造允许发送给模型的条件。
    const conditions: AIRecommendationConditions = {};

    if (applied.memory && longTerm.length > 0) {
      conditions.memory = longTerm.map(item => {
        const feedback = item.feedback
          ? `/${item.feedback.choice}`
          : '';

        return `【${item.group}${feedback}】${item.content}`;
      });
    }

    if (applied.weather) {
      conditions.weather = applied.weather;
    }

    if (applied.preference) {
      conditions.preference = {
        text: applied.preference.text,
        imageIds: [...applied.preference.imageIds],
        styleTags: [...applied.preference.styleTags]
      };
    }

    if (applied.scene) {
      conditions.scene = applied.scene;
    }

    // 新一轮不继承旧轮单次反馈。
    const referenceImages = new Map<string, Blob>();

    // 6. 读取本次允许使用的参考图。
    if (applied.preference?.imageIds.length) {
      for (const imageId of applied.preference.imageIds) {
        const blob = await this.wardrobe.image(imageId);

        if (!blob) {
          throw new RecommendationCoreError(
            'REFERENCE_IMAGE_UNAVAILABLE',
            '喜好参考图不存在或无法读取，请重新上传。'
          );
        }

        referenceImages.set(imageId, blob);
      }
    }

    // 7. 调用 AI。
    const aiResult = await requestAIRecommendation(
      {
        wardrobe: candidates,
        conditions,
        ...(referenceImages.size ? { referenceImages } : {})
      },
      { signal: options.signal }
    );

    // 8. 再次检查设置，避免生成期间用户修改条件。
    const latestDraft = await this.session.getSettingsDraft();

    if (!sameConditions(draft, latestDraft)) {
      throw new RecommendationCoreError(
        'SETTINGS_CHANGED',
        '推荐条件在生成期间发生变化，请重新生成。'
      );
    }

    // 9. 再次读取实时可用衣物。
    const currentCandidates = await this.wardrobe.candidates(this.now());

    const currentById = new Map(
      currentCandidates.map(g => [g.id, g])
    );

    const selectedGarments = aiResult.garmentIds.map(
      id => currentById.get(id)
    );

    if (selectedGarments.some(g => !g)) {
      throw new RecommendationCoreError(
        'GARMENT_UNAVAILABLE',
        '推荐结果中有衣物已被删除或暂停，请重新生成。'
      );
    }

    if (
      !validateOutfit(
        aiResult.garmentIds,
        selectedGarments as Garment[]
      )
    ) {
      throw new RecommendationCoreError(
        'AI_INVALID_OUTFIT',
        'AI 返回的搭配不符合完整穿搭结构，请重新生成。'
      );
    }

    // 10. 提交新一轮。
    // 只有成功提交后，旧轮临时反馈才会被清除。
    const round = await this.session.commitNewRound(
      {
        weather: weatherSnapshot,
        memoryUsed: applied.memory,
        result: {
          garmentIds: aiResult.garmentIds,
          reason: aiResult.reason,
          knowledgeVersion: aiResult.knowledgeVersion
        }
      },
      this.now()
    );

    return {
      status: 'committed',
      round,
      garmentIds: aiResult.garmentIds,
      knowledgeVersion: aiResult.knowledgeVersion
    };
  }

  /**
   * 换整套：
   * - 沿用当前轮次已应用条件；
   * - 读取本轮有效反馈；
   * - 不开始新轮；
   * - 不清除有效反馈；
   * - 新组合不能与当前组合完全相同。
   */

  async swapOutfit(
    options: { signal?: AbortSignal } = {}
  ): Promise<SwapOutfitResult> {
    return this.runOutfitSwap('swap-outfit', options);
  }

  async feedbackSwap(
    options: { signal?: AbortSignal } = {}
  ): Promise<SwapOutfitResult> {
    return this.runOutfitSwap('feedback-swap', options);
  }

  private async runOutfitSwap(
    kind: 'swap-outfit' | 'feedback-swap',
    options: { signal?: AbortSignal } = {}
  ): Promise<SwapOutfitResult> {

    const now = this.now();

    // 1. 获取当前轮次上下文。
    const context = await this.session.adjustmentContext(now);

    if (!context?.current || !context.current.roundId) {
      return {
        status: 'no-current-outfit',
        message: '当前没有可替换的搭配，请先生成一套穿搭。'
      };
    }

    const { applied, current, feedback, longTerm } = context;

    const currentGarmentIds = [...current.garmentIds];
const expectedRoundId = current.roundId;

if (!expectedRoundId) {
  return {
    status: 'no-current-outfit',
    message: '当前搭配没有有效的轮次信息，请重新生成。'
  };
}

    // 2. 获取最新可用衣橱。
    const liveCandidates = await this.wardrobe.candidates(now);

    if (!hasCompleteOutfit(liveCandidates)) {
      return {
        status: 'insufficient-wardrobe',
        message: '当前可用衣橱不足以组成完整搭配。'
      };
    }

    const allowed = new Set(liveCandidates.map(g => g.id));

    // 3. 组织本轮已经应用的条件。
    const conditions: AIRecommendationConditions = {};

    if (applied.memory && longTerm.length > 0) {
      conditions.memory = longTerm.map(item => {
        const feedbackLabel = item.feedback
          ? `/${item.feedback.choice}`
          : '';

        return `【${item.group}${feedbackLabel}】${item.content}`;
      });
    }

    if (applied.weather) {
      conditions.weather = applied.weather;
    }

    if (applied.preference) {
      conditions.preference = {
        text: applied.preference.text,
        imageIds: [...applied.preference.imageIds],
        styleTags: [...applied.preference.styleTags]
      };
    }

    if (applied.scene) {
      conditions.scene = applied.scene;
    }

    // adjustmentContext 已按提交顺序排列。
    // 只发送有实际理由内容的有效反馈。
    const effectiveFeedback = feedback
      .filter(item => item.reason.trim().length > 0)
      .map(item => ({
        choice: item.choice,
        reason: item.reason
      }));


    if (
      kind === 'feedback-swap' &&
      effectiveFeedback.length === 0
    ) {
      return {
        status: 'no-feedback',
        message: '当前没有已成功保存的有效文字反馈，请先保存反馈。'
      };
    }


    if (effectiveFeedback.length > 0) {
      conditions.feedback = effectiveFeedback;
    }

    // 4. 读取本轮已经应用的参考图。
    const referenceImages = new Map<string, Blob>();

    if (applied.preference?.imageIds.length) {
      for (const imageId of applied.preference.imageIds) {
        const blob = await this.wardrobe.image(imageId);

        if (!blob) {
          throw new RecommendationCoreError(
            'REFERENCE_IMAGE_UNAVAILABLE',
            '本轮喜好参考图无法读取，请重新上传。'
          );
        }

        referenceImages.set(imageId, blob);
      }
    }

    // 5. 调用 AI，明确要求换整套。
    const result = await requestAIRecommendation(
      {
        wardrobe: liveCandidates,
        conditions,
        operation: {
  kind,
  currentGarmentIds
},
        ...(referenceImages.size ? { referenceImages } : {})
      },
      { signal: options.signal }
    );


    // 6. AI 返回后重新读取当前可用衣橱。
    const latestCandidates = await this.wardrobe.candidates(this.now());

    const latestById = new Map(
      latestCandidates.map(item => [item.id, item])
    );

    if (
      result.garmentIds.some(id => !latestById.has(id)) ||
      new Set(result.garmentIds).size !== result.garmentIds.length
    ) {
      throw new RecommendationCoreError(
        'AI_INVALID_RESPONSE',
        'AI 返回了已删除、暂停、不存在或重复的衣物。'
      );
    }

    // 7. 换整套不能返回完全相同的组合。
    if (isSameCombination(result.garmentIds, currentGarmentIds)) {
      return {
        status: 'no-alternative',
        message: '暂时没有找到不同于当前搭配的组合，原搭配保持不变。'
      };
    }

    // 8. 必须满足完整穿搭结构。
    const selected = result.garmentIds.map(
      id => latestById.get(id)
    ) as Garment[];

    if (!validateOutfit(result.garmentIds, selected)) {
      throw new RecommendationCoreError(
        'AI_INVALID_OUTFIT',
        'AI 返回的替换搭配不符合完整穿搭结构。'
      );
    }

    // 9. 提交前再次检查当前结果没有被其他操作替换。
    const latestContext = await this.session.adjustmentContext(this.now());

    if (
      !latestContext?.current ||
      latestContext.current.id !== current.id ||
      latestContext.current.roundId !== expectedRoundId
    ) {
      throw new RecommendationCoreError(
        'ROUND_CHANGED',
        '当前搭配已经发生变化，请刷新后重试。'
      );
    }


    // 反馈若在 AI 生成过程中发生改变，不能保存过期结果。
    const originalFeedbackIds = feedback.map(item => item.id);
    const latestFeedbackIds = latestContext.feedback.map(item => item.id);

    if (
      JSON.stringify(originalFeedbackIds) !==
      JSON.stringify(latestFeedbackIds)
    ) {
      throw new RecommendationCoreError(
        'FEEDBACK_CHANGED',
        '生成期间本轮反馈发生变化，请重新推荐。'
      );
    }


    // 10. 保存调整结果。
    // commitAdjustment 不开始新轮，也不主动清除有效反馈。
    const round = await this.session.commitAdjustment(
      {
        expectedRoundId,
        kind,
        result: {
          garmentIds: result.garmentIds,
          reason: result.reason,
          knowledgeVersion: result.knowledgeVersion
        }
      },
      this.now()
    );

    return {
      status: 'committed',
      round,
      garmentIds: result.garmentIds,
      knowledgeVersion: result.knowledgeVersion
    };
  }

  /**
   * 换指定单件：
   * 1. 沿用当前轮已应用的条件和有效反馈；
   * 2. 仅替换 targetGarmentId；
   * 3. 新衣物必须属于原位置的类别；
   * 4. 其余衣物 ID 必须保持不变；
   * 5. 失败时不提交，也不清除当前结果及反馈。
   */
  async swapItem(
    targetGarmentId: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<SwapItemResult> {
    const now = this.now();

    // 1. 读取本轮已经应用的推荐上下文。
    const context = await this.session.adjustmentContext(now);

    if (!context?.current?.roundId) {
      return {
        status: 'no-current-outfit',
        message: '当前没有可替换的搭配，请先生成一套穿搭。'
      };
    }


const { current, applied, feedback, longTerm } = context;
const expectedRoundId = current.roundId;

if (!expectedRoundId) {
  return {
    status: 'no-current-outfit',
    message: '当前搭配没有有效的轮次信息，请重新生成。'
  };
}


    if (!current.garmentIds.includes(targetGarmentId)) {
      throw new RecommendationCoreError(
        'INVALID_TARGET',
        '指定衣物不属于当前搭配。'
      );
    }

    // 使用已保存的搭配快照确定原衣物类别。
    // 不能假设原衣物仍然存在于当前可用衣橱。
    const targetSnapshot = current.snapshots.find(
      item => item.id === targetGarmentId
    );

    if (!targetSnapshot) {
      throw new RecommendationCoreError(
        'INVALID_TARGET',
        '无法确定待替换衣物的类别。'
      );
    }

    const targetCategory = targetSnapshot.category;

    // 2. 读取本次可用衣橱。
    const candidates = await this.wardrobe.candidates(now);
    const candidateById = new Map(
      candidates.map(item => [item.id, item])
    );

    const otherIds = current.garmentIds.filter(
      id => id !== targetGarmentId
    );

    // 未被替换的位置必须保持不变，因此这些衣物需要仍然可用。
    if (otherIds.some(id => !candidateById.has(id))) {
      throw new RecommendationCoreError(
        'GARMENT_UNAVAILABLE',
        '当前搭配中存在已删除或暂停的衣物，无法仅替换指定单件。'
      );
    }

    // 3. 预先检查是否有同类别的可用替代衣物。
    const alternatives = candidates.filter(
      item =>
        item.category === targetCategory &&
        item.id !== targetGarmentId &&
        !otherIds.includes(item.id)
    );

    if (alternatives.length === 0) {
      return {
        status: 'no-alternative',
        message: '当前没有可替换的同类别衣物，原搭配保持不变。'
      };
    }

    // 4. 只组织已应用条件，不读取左侧尚未应用的草稿。
    const conditions: AIRecommendationConditions = {};

    if (applied.memory && longTerm.length > 0) {
      conditions.memory = longTerm.map(item => {
        const feedbackLabel = item.feedback
          ? `/${item.feedback.choice}`
          : '';

        return `【${item.group}${feedbackLabel}】${item.content}`;
      });
    }

    if (applied.weather) {
      conditions.weather = applied.weather;
    }

    if (applied.preference) {
      conditions.preference = {
        text: applied.preference.text,
        imageIds: [...applied.preference.imageIds],
        styleTags: [...applied.preference.styleTags]
      };
    }

    if (applied.scene) {
      conditions.scene = applied.scene;
    }

    // 本轮有效反馈已经由 Session 按提交顺序排列。
    const effectiveFeedback = feedback
      .filter(item => item.reason.trim().length > 0)
      .map(item => ({
        choice: item.choice,
        reason: item.reason
      }));

    if (effectiveFeedback.length > 0) {
      conditions.feedback = effectiveFeedback;
    }

    // 5. 仅读取本轮已经启用的参考图。
    const referenceImages = new Map<string, Blob>();

    if (applied.preference?.imageIds.length) {
      for (const imageId of applied.preference.imageIds) {
        const blob = await this.wardrobe.image(imageId);

        if (!blob) {
          throw new RecommendationCoreError(
            'REFERENCE_IMAGE_UNAVAILABLE',
            '本轮喜好参考图无法读取，请重新上传。'
          );
        }

        referenceImages.set(imageId, blob);
      }
    }

    // 6. 调用 AI，明确指定仅替换的目标和类别。
    const aiResult = await requestAIRecommendation(
      {
        wardrobe: candidates,
        conditions,
        operation: {
          kind: 'swap-item',
          currentGarmentIds: [...current.garmentIds],
          targetGarmentId,
          targetCategory
        },
        ...(referenceImages.size ? { referenceImages } : {})
      },
      { signal: options.signal }
    );

    // 7. 检查返回结果必须恰好替换一件衣物。
    if (
      aiResult.garmentIds.length !== current.garmentIds.length ||
      new Set(aiResult.garmentIds).size !== aiResult.garmentIds.length
    ) {
      throw new RecommendationCoreError(
        'AI_INVALID_RESPONSE',
        'AI 返回的单件替换结果数量不正确或包含重复衣物。'
      );
    }

    // 原位置的旧衣物不得继续存在于替换后的结果中。
    const newIds = aiResult.garmentIds.filter(
      id => !otherIds.includes(id)
    );

    if (
      newIds.length !== 1 ||
      newIds[0] === targetGarmentId ||
      !otherIds.every(id => aiResult.garmentIds.includes(id))
    ) {
      throw new RecommendationCoreError(
        'AI_INVALID_SWAP_ITEM',
        'AI 修改了指定位置以外的衣物，已拒绝保存。'
      );
    }

    const replacementId = newIds[0];
    const replacement = candidateById.get(replacementId);

    if (!replacement || replacement.category !== targetCategory) {
      throw new RecommendationCoreError(
        'AI_INVALID_SWAP_ITEM',
        '替换衣物不存在、不可用或类别不匹配。'
      );
    }

    // 8. 在模型返回后再次检查实时可用状态。
    const latestCandidates = await this.wardrobe.candidates(this.now());
    const latestById = new Map(
      latestCandidates.map(item => [item.id, item])
    );

    const selected = aiResult.garmentIds.map(
      id => latestById.get(id)
    );

    if (selected.some(item => !item)) {
      throw new RecommendationCoreError(
        'GARMENT_UNAVAILABLE',
        '生成期间有衣物被删除或暂停，请重试。'
      );
    }

    if (
      latestById.get(replacementId)?.category !== targetCategory ||
      !validateOutfit(aiResult.garmentIds, selected as Garment[])
    ) {
      throw new RecommendationCoreError(
        'AI_INVALID_OUTFIT',
        '替换后的搭配不符合完整穿搭结构。'
      );
    }

    // 9. 检查当前结果没有被其他调整替换。
    const latestContext = await this.session.adjustmentContext(this.now());

    if (
      !latestContext?.current ||
      latestContext.current.id !== current.id ||
      latestContext.current.roundId !== expectedRoundId
    ) {
      throw new RecommendationCoreError(
        'ROUND_CHANGED',
        '当前搭配已经发生变化，请刷新后重试。'
      );
    }

    // 10. 使用第 2 轮 Session 提交调整。
    // 保持当前轮次，不清除本轮有效反馈。
    const round = await this.session.commitAdjustment(
      {
        expectedRoundId,
        kind: 'swap-item',
        targetGarmentId,
        result: {
          garmentIds: aiResult.garmentIds,
          reason: aiResult.reason,
          knowledgeVersion: aiResult.knowledgeVersion
        }
      },
      this.now()
    );

    return {
      status: 'committed',
      round,
      garmentIds: aiResult.garmentIds,
      knowledgeVersion: aiResult.knowledgeVersion
    };
  }


  /**
   * 首页今日穿搭：
   * 1. 固定读取长期记忆；
   * 2. 固定读取当前城市当天真实天气；
   * 3. 读取当前可用衣橱；
   * 4. 使用服务端搭配知识；
   * 5. 不读取推荐页草稿、临时喜好、场景和单次反馈；
   * 6. 独立保存到 Home。
   */
  async generateHome(
    options: { signal?: AbortSignal } = {}
  ): Promise<HomeRecommendationResult> {
    const now = this.now();

    // 1. 获取共享城市。
    const city = await this.session.getCity();

    if (!city) {
      throw new RecommendationCoreError(
        'CITY_REQUIRED',
        '请先选择城市，再生成今日穿搭。'
      );
    }

    // 2. 获取首页专用上下文。
    const context = await this.session.homeContext(now);

    const { longTerm, candidates } = context;

    // 3. 检查衣橱是否足以组成完整搭配。
    if (!hasCompleteOutfit(candidates)) {
      return {
        status: 'insufficient-wardrobe',
        message: '当前可用衣橱不足以组成完整搭配。'
      };
    }

    // 4. 首页固定获取当天真实天气。
    let weather: Weather;

    try {
      weather = await this.weather.current(
        city,
        options.signal
      );
    } catch {
      throw new RecommendationCoreError(
        'WEATHER_UNAVAILABLE',
        '今日天气暂时无法获取，请重试。',
        true
      );
    }

    if (weather.example || weather.source === 'example') {
      throw new RecommendationCoreError(
        'WEATHER_UNAVAILABLE',
        '首页推荐不能使用示例天气，请重新获取真实天气。',
        true
      );
    }

    // 5. 转换成 Session 使用的天气快照。
    const usedFields = [
      'temperature',
      'apparentTemperature',
      'temperatureMin',
      'temperatureMax'
    ];

    if (weather.weatherCode !== null &&
        weather.weatherCode !== undefined) {
      usedFields.push('weatherCode');
    }

    const weatherSnapshot = toWeatherSnapshot(
      weather,
      usedFields
    );

    // 6. 首页固定使用长期记忆。
    // 不读取推荐页的临时喜好、场景和单次反馈。
    const conditions: {
      memory?: string[];
      weather: WeatherSnapshot;
    } = {
      weather: weatherSnapshot
    };

    if (longTerm.length > 0) {
      conditions.memory = longTerm.map(item => {
        const feedbackLabel = item.feedback
          ? `/${item.feedback.choice}`
          : '';

        return `【${item.group}${feedbackLabel}】${item.content}`;
      });
    }

    // 7. 调用 AI。
    const aiResult = await requestAIRecommendation(
      {
        wardrobe: candidates,
        conditions
      },
      { signal: options.signal }
    );

    // 8. 再次读取实时衣橱，防止生成期间衣物被暂停或删除。
    const latestCandidates = await this.wardrobe.candidates(
      this.now()
    );

    const latestById = new Map(
      latestCandidates.map(item => [item.id, item])
    );

    const selectedGarments = aiResult.garmentIds.map(
      id => latestById.get(id)
    );

    if (selectedGarments.some(item => !item)) {
      throw new RecommendationCoreError(
        'GARMENT_UNAVAILABLE',
        '今日推荐中存在已删除或暂停的衣物，请重新生成。'
      );
    }

    if (
      !validateOutfit(
        aiResult.garmentIds,
        selectedGarments as Garment[]
      )
    ) {
      throw new RecommendationCoreError(
        'AI_INVALID_OUTFIT',
        '首页推荐结果不符合完整穿搭结构。'
      );
    }

    // 确认生成期间共享城市没有发生变化。
const latestCity = await this.session.getCity();

if (latestCity !== city) {
  throw new RecommendationCoreError(
    'CITY_CHANGED',
    '生成期间城市发生变化，请重新生成。'
  );
}
    // 9. 独立保存首页结果。
    // 不会修改推荐页的当前轮次和反馈。
    const home = await this.session.commitHome(
      {
        kind: 'generate',
        weather: weatherSnapshot,
        result: {
          garmentIds: aiResult.garmentIds,
          reason: aiResult.reason,
          knowledgeVersion: aiResult.knowledgeVersion
        }
      },
      this.now()
    );

    return {
      status: 'committed',
      home,
      garmentIds: aiResult.garmentIds,
      knowledgeVersion: aiResult.knowledgeVersion
    };
  }

}
