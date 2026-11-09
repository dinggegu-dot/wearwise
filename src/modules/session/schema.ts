import { z } from 'zod';
import { categorySchema, warmthSchema } from '@/modules/wardrobe';
import { isDateOnly } from '@/shared/domain/beijing-date';

const dateOnly = z.string().refine(isDateOnly, '日期格式应为 YYYY-MM-DD');
export const citySchema = z.enum(['深圳', '广州', '上海', '北京', '成都', '杭州']);

/** 结果中每件衣物在生成当时的展示快照。衣物后来被删除或修改，旧搭配仍按此展示。 */
export const garmentSnapshotSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), category: categorySchema, color: z.string().min(1),
  fit: z.string().min(1), warmth: warmthSchema, material: z.string().optional(), styleTags: z.array(z.string()),
  imageId: z.string().min(1)
}).strict();
export type GarmentSnapshot = z.infer<typeof garmentSnapshotSchema>;

/** 平铺展示所需：每件衣物的位置与叠穿层次（数字越大越靠上层）。 */
export const flatLaySlotSchema = z.object({
  garmentId: z.string().min(1),
  slot: z.enum(['outerwear', 'top', 'bottom', 'dress', 'shoes']),
  layer: z.number().int().min(0).max(9)
}).strict();

/** 天气依据快照：以城市＋北京日期为单位；页面后来更新的天气不覆盖它。 */
export const weatherSnapshotSchema = z.object({
  city: citySchema,
  date: dateOnly,
  weatherCode: z.number().int().nullable(),
  temperature: z.number().finite(),
  apparentTemperature: z.number().finite(),
  temperatureMin: z.number().finite().nullable(),
  temperatureMax: z.number().finite().nullable(),
  source: z.enum(['open-meteo', 'example']),
  /** 实际参与推荐的字段，例如 ['apparentTemperature','temperatureMin','temperatureMax']。 */
  usedFields: z.array(z.string().min(1))
}).strict();
export type WeatherSnapshot = z.infer<typeof weatherSnapshotSchema>;

/** 生成依据：只记录实际使用的条件。label 如“深圳 · 11月9日天气 · 上班 · 长期偏好”。 */
export const basisSchema = z.object({
  label: z.string().max(200),
  memory: z.boolean(),
  weather: weatherSnapshotSchema.nullable(),
  preference: z.boolean(),
  scene: z.string().nullable(),
  knowledgeVersion: z.string().optional()
}).strict();

export const surfaceSchema = z.enum(['home', 'recommendations']);
export type Surface = z.infer<typeof surfaceSchema>;

/** 一套搭配结果。首页与推荐页的结果分开记录。 */
export const outfitResultSchema = z.object({
  id: z.string().min(1),
  surface: surfaceSchema,
  /** 推荐页结果所属轮次；首页结果为 null。 */
  roundId: z.string().min(1).nullable(),
  garmentIds: z.array(z.string().min(1)).min(1).max(8),
  snapshots: z.array(garmentSnapshotSchema).min(1).max(8),
  flatLay: z.array(flatLaySlotSchema).min(1).max(8),
  reason: z.string().max(1000),
  basis: basisSchema,
  createdAt: z.string().datetime()
}).strict().superRefine((v, ctx) => {
  const ids = [...v.garmentIds].sort().join('|');
  if (new Set(v.garmentIds).size !== v.garmentIds.length) ctx.addIssue({ code: 'custom', message: '同一套搭配不能重复使用同一件衣物' });
  if (v.snapshots.map(s => s.id).sort().join('|') !== ids) ctx.addIssue({ code: 'custom', message: '展示快照须与衣物 ID 一致' });
  if (v.flatLay.map(s => s.garmentId).sort().join('|') !== ids) ctx.addIssue({ code: 'custom', message: '平铺信息须与衣物 ID 一致' });
});
export type OutfitResult = z.infer<typeof outfitResultSchema>;

/** 永久反馈中保存的“当时那套搭配”。 */
export const outfitSnapshotSchema = z.object({
  resultId: z.string().min(1), garmentIds: z.array(z.string().min(1)).min(1), snapshots: z.array(garmentSnapshotSchema).min(1)
}).strict();
export type OutfitSnapshot = z.infer<typeof outfitSnapshotSchema>;

/** 推荐页左侧设置区草稿。首次默认：记忆开、天气开、本次喜好关且空、本次场景关且空。 */
export const settingsDraftSchema = z.object({
  memory: z.boolean(),
  weather: z.boolean(),
  preference: z.object({ enabled: z.boolean(), text: z.string().max(500), imageIds: z.array(z.string().min(1)).max(6) }).strict(),
  scene: z.object({ enabled: z.boolean(), value: z.string().max(100) }).strict(),
  updatedAt: z.string().datetime()
}).strict();
export type SettingsDraft = z.infer<typeof settingsDraftSchema>;

/** 本轮已应用条件。关闭或开启但为空的条件按空（null）记录。 */
export const appliedConditionsSchema = z.object({
  memory: z.boolean(),
  weather: weatherSnapshotSchema.nullable(),
  preference: z.object({ text: z.string(), imageIds: z.array(z.string().min(1)) }).strict().nullable(),
  scene: z.string().min(1).nullable(),
  appliedAt: z.string().datetime()
}).strict();
export type AppliedConditions = z.infer<typeof appliedConditionsSchema>;

export const adjustmentSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['swap-outfit', 'swap-item', 'feedback-swap']),
  fromResultId: z.string().min(1),
  toResultId: z.string().min(1),
  targetGarmentId: z.string().min(1).optional(),
  at: z.string().datetime()
}).strict();
export type Adjustment = z.infer<typeof adjustmentSchema>;

/** 本轮已成功保存的反馈。order 为提交顺序，后提交的明确修正优先。 */
export const roundFeedbackSchema = z.object({
  id: z.string().min(1),
  resultId: z.string().min(1),
  choice: z.enum(['like', 'dislike']),
  reason: z.string().trim().max(300),
  scope: z.enum(['once', 'permanent']),
  /** 永久反馈对应的长期条目。 */
  preferenceId: z.string().min(1).optional(),
  order: z.number().int().positive(),
  savedAt: z.string().datetime()
}).strict();
export type RoundFeedback = z.infer<typeof roundFeedbackSchema>;

export const roundStateSchema = z.object({
  roundId: z.string().min(1),
  applied: appliedConditionsSchema,
  currentResultId: z.string().min(1),
  adjustments: z.array(adjustmentSchema),
  feedback: z.array(roundFeedbackSchema),
  startedAt: z.string().datetime(),
  revision: z.number().int().positive()
}).strict();
export type RoundState = z.infer<typeof roundStateSchema>;

/** 尚未成功保存的反馈。恢复后仍不生效。 */
export const feedbackDraftSchema = z.object({
  roundId: z.string().min(1),
  resultId: z.string().min(1),
  choice: z.enum(['like', 'dislike']).nullable(),
  reason: z.string().max(300),
  scope: z.enum(['once', 'permanent']),
  updatedAt: z.string().datetime()
}).strict();
export type FeedbackDraft = z.infer<typeof feedbackDraftSchema>;

/** 首页今日穿搭状态，与推荐页轮次完全独立。 */
export const homeStateSchema = z.object({
  currentResultId: z.string().min(1),
  adjustments: z.array(adjustmentSchema),
  revision: z.number().int().positive(),
  updatedAt: z.string().datetime()
}).strict();
export type HomeState = z.infer<typeof homeStateSchema>;

export const stateKeys = {
  city: 'shared.city',
  settingsDraft: 'recommendations.settingsDraft',
  round: 'recommendations.round',
  feedbackDraft: 'recommendations.feedbackDraft',
  home: 'home.state'
} as const;
export const stateSchemas = {
  [stateKeys.city]: citySchema,
  [stateKeys.settingsDraft]: settingsDraftSchema,
  [stateKeys.round]: roundStateSchema,
  [stateKeys.feedbackDraft]: feedbackDraftSchema,
  [stateKeys.home]: homeStateSchema
} as const;
