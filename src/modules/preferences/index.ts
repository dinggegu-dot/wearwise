import { z } from 'zod';
import { outfitSnapshotSchema } from '@/modules/session/schema';

export const preferenceGroupSchema = z.enum(['explicit', 'inspiration', 'feedback']);
export type PreferenceGroup = z.infer<typeof preferenceGroupSchema>;
export const feedbackChoiceSchema = z.enum(['like', 'dislike']);

/**
 * 长期偏好的一条记录。三组按来源区分，不按来源分配优先级。
 * - explicit：用户主动添加的明确偏好。
 * - inspiration：灵感归纳。内部保存来源灵感 ID；用户手改（userEdited）或主动删除（state=deleted）后，重新归纳不覆盖、不恢复。
 * - feedback：永久反馈。保存当时被评价搭配的快照，以及与本轮反馈副本的关联。
 */
export const preferenceSchema = z.object({
  id: z.string().min(1),
  group: preferenceGroupSchema,
  content: z.string().trim().max(500),
  state: z.enum(['active', 'deleted']),
  userEdited: z.boolean(),
  inspiration: z.object({ key: z.string().min(1).max(200), sourceIds: z.array(z.string().min(1)) }).strict().optional(),
  feedback: z.object({
    choice: feedbackChoiceSchema,
    outfit: outfitSnapshotSchema,
    roundId: z.string().min(1).optional(),
    roundFeedbackId: z.string().min(1).optional()
  }).strict().optional(),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).strict().superRefine((v, ctx) => {
  if ((v.group === 'inspiration') !== !!v.inspiration) ctx.addIssue({ code: 'custom', message: '灵感归纳须且仅须带来源信息' });
  if ((v.group === 'feedback') !== !!v.feedback) ctx.addIssue({ code: 'custom', message: '永久反馈须且仅须带搭配信息' });
  if (v.group !== 'feedback' && !v.content) ctx.addIssue({ code: 'custom', message: '偏好内容不能为空' });
});
export type Preference = z.infer<typeof preferenceSchema>;
/** 第 6 轮归纳结果的输入。key 用于识别“同一条”归纳，以便尊重用户的修改和删除。 */
export interface SummaryCandidate { key: string; content: string; sourceIds: string[] }
export interface PreferencePatch { content?: string; choice?: 'like' | 'dislike' }

export interface PreferenceStore {
  list(): Promise<Preference[]>;
  get(id: string): Promise<Preference | undefined>;
  add(record: Preference): Promise<Preference>;
  /** 修改；永久反馈会在同一事务中同步本轮对应副本。 */
  update(id: string, expectedRevision: number, patch: PreferencePatch): Promise<Preference>;
  /** 删除；灵感归纳留下删除标记以免被自动恢复，永久反馈同步移除本轮副本。 */
  remove(id: string): Promise<void>;
  applySummaries(candidates: SummaryCandidate[]): Promise<{ added: string[]; updated: string[]; skipped: string[] }>;
}

export class PreferenceService {
  constructor(private readonly store: PreferenceStore) {}
  /** 有效的长期记录（不含已删除的归纳标记）。 */
  async listActive(group?: PreferenceGroup) {
    return (await this.store.list()).filter(p => p.state === 'active' && (!group || p.group === group)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  get(id: string) { return this.store.get(id); }
  async addExplicit(content: string, requestId = crypto.randomUUID()) {
    const now = new Date().toISOString();
    return this.store.add(preferenceSchema.parse({ id: requestId, group: 'explicit', content, state: 'active', userEdited: true, revision: 1, createdAt: now, updatedAt: now }));
  }
  async edit(id: string, patch: PreferencePatch, expectedRevision?: number) {
    const previous = await this.store.get(id);
    if (!previous || previous.state !== 'active') throw new Error('偏好不存在，请刷新后重试');
    return this.store.update(id, expectedRevision ?? previous.revision, patch);
  }
  remove(id: string) { return this.store.remove(id); }
  /** 供第 6 轮写入灵感归纳：跳过用户删除过的，保留用户手改过的内容。 */
  applyInspirationSummaries(candidates: SummaryCandidate[]) { return this.store.applySummaries(candidates); }
}
