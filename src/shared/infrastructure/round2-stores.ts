import { inspirationSchema, type Inspiration, type InspirationPatch, type InspirationStore } from '@/modules/inspiration';
import { preferenceSchema, type Preference, type PreferencePatch, type PreferenceStore, type SummaryCandidate } from '@/modules/preferences';
import {
  appliedConditionsSchema, outfitResultSchema, stateKeys, stateSchemas, type AdjustmentKind, type FeedbackDraft, type HomeState,
  type OutfitResult, type RoundState, type SessionStore, type SettingsDraft
} from '@/modules/session';
import { availability, garmentSchema, isCandidate, type Media } from '@/modules/wardrobe';
import type { City } from '@/modules/weather';
import { imageInUse, imageTables, type WearWiseDatabase } from '@/shared/infrastructure/database';

type StateKey = keyof typeof stateSchemas;
async function readState<K extends StateKey>(db: WearWiseDatabase, key: K) {
  const record = await db.state.get(key);
  if (!record) return undefined;
  const parsed = stateSchemas[key].safeParse(record.value);
  if (!parsed.success) throw new Error('本地数据状态无效，请检查数据后重试');
  return parsed.data as import('zod').infer<(typeof stateSchemas)[K]>;
}
async function writeState<K extends StateKey>(db: WearWiseDatabase, key: K, value: unknown) {
  await db.state.put({ key, value: stateSchemas[key].parse(value) });
}
async function releaseImages(db: WearWiseDatabase, ids: Iterable<string>) {
  for (const id of new Set(ids)) if (!await imageInUse(db, id)) await db.media.delete(id);
}

// —————————————————— 灵感 ——————————————————
export class DexieInspirationStore implements InspirationStore {
  constructor(private readonly db: WearWiseDatabase) {}
  async list() { return (await this.db.inspirations.orderBy('createdAt').reverse().toArray()).map(i => inspirationSchema.parse(i)); }
  async get(id: string) { const v = await this.db.inspirations.get(id); return v ? inspirationSchema.parse(v) : undefined; }
  async createOnce(record: Inspiration, media: Media) {
    const value = inspirationSchema.parse(record);
    return this.db.transaction('rw', this.db.inspirations, this.db.media, async () => {
      const existing = await this.db.inspirations.get(value.id); if (existing) return existing;
      if (media.id !== value.imageId || !(media.blob instanceof Blob)) throw new Error('图片数据无效');
      await this.db.media.add(media); await this.db.inspirations.add(value); return value;
    });
  }
  async update(id: string, expectedRevision: number, patch: InspirationPatch, media?: Media) {
    return this.db.transaction('rw', imageTables(this.db), async () => {
      const previous = await this.db.inspirations.get(id); if (!previous) throw new Error('灵感不存在，请刷新后重试');
      if (previous.revision !== expectedRevision) throw new Error('灵感已被修改，请刷新后重试');
      if (media && !(media.blob instanceof Blob)) throw new Error('图片数据无效');
      const next = inspirationSchema.parse({ ...previous, ...patch, imageId: media?.id ?? previous.imageId, revision: previous.revision + 1, updatedAt: new Date().toISOString() });
      if (media) await this.db.media.add(media);
      await this.db.inspirations.put(next);
      if (media) await releaseImages(this.db, [previous.imageId]);
      const affectedSummaryIds = (await this.db.preferences.where('group').equals('inspiration').toArray())
        .filter(p => p.state === 'active' && !p.userEdited && p.inspiration?.sourceIds.includes(id)).map(p => p.id);
      return { inspiration: next, affectedSummaryIds };
    });
  }
  async remove(id: string) {
    return this.db.transaction('rw', imageTables(this.db), async () => {
      const previous = await this.db.inspirations.get(id);
      if (!previous) return { removedSummaryIds: [], affectedSummaryIds: [] };
      await this.db.inspirations.delete(id);
      const removedSummaryIds: string[] = [], affectedSummaryIds: string[] = [];
      for (const p of await this.db.preferences.where('group').equals('inspiration').toArray()) {
        if (!p.inspiration?.sourceIds.includes(id)) continue;
        const sourceIds = p.inspiration.sourceIds.filter(s => s !== id);
        // 失去全部依据、且未被用户手改的自动归纳移除；其他灵感仍支持的保留。用户删除标记与手改条目保留。
        if (p.state === 'active' && !p.userEdited && !sourceIds.length) { await this.db.preferences.delete(p.id); removedSummaryIds.push(p.id); continue; }
        await this.db.preferences.put({ ...p, inspiration: { ...p.inspiration, sourceIds }, revision: p.revision + 1, updatedAt: new Date().toISOString() });
        if (p.state === 'active' && !p.userEdited) affectedSummaryIds.push(p.id);
      }
      await releaseImages(this.db, [previous.imageId]);
      return { removedSummaryIds, affectedSummaryIds };
    });
  }
}

// —————————————————— 长期偏好 ——————————————————
export class DexiePreferenceStore implements PreferenceStore {
  constructor(private readonly db: WearWiseDatabase) {}
  async list() { return (await this.db.preferences.toArray()).map(p => preferenceSchema.parse(p)); }
  async get(id: string) { const v = await this.db.preferences.get(id); return v ? preferenceSchema.parse(v) : undefined; }
  async add(record: Preference) {
    const value = preferenceSchema.parse(record);
    return this.db.transaction('rw', this.db.preferences, async () => {
      const existing = await this.db.preferences.get(value.id); if (existing) return existing;
      await this.db.preferences.add(value); return value;
    });
  }
  async update(id: string, expectedRevision: number, patch: PreferencePatch) {
    return this.db.transaction('rw', this.db.preferences, this.db.state, async () => {
      const previous = await this.db.preferences.get(id);
      if (!previous || previous.state !== 'active') throw new Error('偏好不存在，请刷新后重试');
      if (previous.revision !== expectedRevision) throw new Error('偏好已被修改，请刷新后重试');
      if (patch.choice && previous.group !== 'feedback') throw new Error('只有永久反馈可以修改评价');
      const next = preferenceSchema.parse({
        ...previous, content: patch.content ?? previous.content, userEdited: true,
        ...(previous.feedback ? { feedback: { ...previous.feedback, choice: patch.choice ?? previous.feedback.choice } } : {}),
        revision: previous.revision + 1, updatedAt: new Date().toISOString()
      });
      await this.db.preferences.put(next);
      if (next.group === 'feedback') await this.syncRoundCopy(id, f => ({ ...f, reason: next.content, choice: next.feedback!.choice }));
      return next;
    });
  }
  async remove(id: string) {
    await this.db.transaction('rw', this.db.preferences, this.db.state, async () => {
      const previous = await this.db.preferences.get(id); if (!previous || previous.state === 'deleted') return;
      if (previous.group === 'inspiration') {
        // 留下删除标记：再次归纳相同内容时不自动恢复。
        await this.db.preferences.put({ ...previous, state: 'deleted', revision: previous.revision + 1, updatedAt: new Date().toISOString() });
        return;
      }
      await this.db.preferences.delete(id);
      if (previous.group === 'feedback') await this.syncRoundCopy(id, () => null);
    });
  }
  async applySummaries(candidates: SummaryCandidate[]) {
    return this.db.transaction('rw', this.db.preferences, async () => {
      const existing = new Map((await this.db.preferences.where('group').equals('inspiration').toArray()).map(p => [p.inspiration!.key, p]));
      const added: string[] = [], updated: string[] = [], skipped: string[] = [];
      const now = new Date().toISOString();
      for (const c of candidates) {
        const p = existing.get(c.key);
        if (!p) {
          const value = preferenceSchema.parse({ id: crypto.randomUUID(), group: 'inspiration', content: c.content, state: 'active', userEdited: false, inspiration: { key: c.key, sourceIds: [...new Set(c.sourceIds)] }, revision: 1, createdAt: now, updatedAt: now });
          await this.db.preferences.add(value); existing.set(c.key, value); added.push(value.id); continue;
        }
        const sources = { key: c.key, sourceIds: [...new Set(c.sourceIds)] };
        if (p.state === 'deleted' || p.userEdited) { await this.db.preferences.put({ ...p, inspiration: sources, updatedAt: now }); skipped.push(p.id); continue; }
        await this.db.preferences.put(preferenceSchema.parse({ ...p, content: c.content, inspiration: sources, revision: p.revision + 1, updatedAt: now })); updated.push(p.id);
      }
      return { added, updated, skipped };
    });
  }
  /** 同步当前轮中与永久反馈对应的副本；本轮副本已随新轮清除时无需重建。 */
  private async syncRoundCopy(preferenceId: string, change: (f: RoundState['feedback'][number]) => RoundState['feedback'][number] | null) {
    const round = await readState(this.db, stateKeys.round); if (!round) return;
    const index = round.feedback.findIndex(f => f.preferenceId === preferenceId); if (index < 0) return;
    const next = change(round.feedback[index]);
    const feedback = next ? round.feedback.map((f, i) => i === index ? next : f) : round.feedback.filter((_, i) => i !== index);
    await writeState(this.db, stateKeys.round, { ...round, feedback, revision: round.revision + 1 });
  }
}

// —————————————————— 推荐过程 ——————————————————
export class DexieSessionStore implements SessionStore {
  constructor(private readonly db: WearWiseDatabase) {}
  getCity() { return readState(this.db, stateKeys.city) as Promise<City | undefined>; }
  async setCity(city: City) { await this.db.transaction('rw', this.db.state, () => writeState(this.db, stateKeys.city, city)); }
  getSettingsDraft() { return readState(this.db, stateKeys.settingsDraft); }
  async saveSettingsDraft(draft: SettingsDraft) {
    await this.db.transaction('rw', imageTables(this.db), async () => {
      const previous = await readState(this.db, stateKeys.settingsDraft);
      for (const id of draft.preference.imageIds) if (!await this.db.media.get(id)) throw new Error('参考图不存在，请重新上传');
      await writeState(this.db, stateKeys.settingsDraft, draft);
      // 草稿和本轮已应用条件都不再引用的参考图才释放。
      if (previous) await releaseImages(this.db, previous.preference.imageIds.filter(id => !draft.preference.imageIds.includes(id)));
    });
  }
  async addReferenceImage(blob: Blob) {
    if (!(blob instanceof Blob)) throw new Error('图片数据无效');
    const id = crypto.randomUUID(); await this.db.media.add({ id, blob }); return id;
  }
  async readRound() {
    return this.db.transaction('r', this.db.state, this.db.results, async () => {
      const round = await readState(this.db, stateKeys.round);
      if (!round) return { results: [] };
      const results = (await this.db.results.where('roundId').equals(round.roundId).toArray()).map(r => outfitResultSchema.parse(r)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const draft = await readState(this.db, stateKeys.feedbackDraft);
      return { round, current: results.find(r => r.id === round.currentResultId), results, ...(draft && draft.roundId === round.roundId ? { feedbackDraft: draft } : {}) };
    });
  }
  async getResult(id: string) { const v = await this.db.results.get(id); return v ? outfitResultSchema.parse(v) : undefined; }
  async snapshotGarments(ids: string[]) {
    const items = await this.db.garments.bulkGet(ids);
    if (items.some(g => !g)) throw new Error('搭配中的衣物不存在，请重新生成。');
    return items.map(g => garmentSchema.parse(g));
  }
  async commitNewRound(input: { roundId: string; applied: RoundState['applied']; result: OutfitResult }, now: Date) {
    const result = outfitResultSchema.parse(input.result), applied = appliedConditionsSchema.parse(input.applied);
    if (result.surface !== 'recommendations' || result.roundId !== input.roundId) throw new Error('结果与本轮不一致');
    return this.db.transaction('rw', imageTables(this.db), async () => {
      await this.requireCandidates(result.garmentIds, now);
      if (applied.preference) for (const id of applied.preference.imageIds) if (!await this.db.media.get(id)) throw new Error('参考图不存在，请重新上传');
      const previous = await readState(this.db, stateKeys.round);
      await this.db.results.add(result);
      const round: RoundState = { roundId: input.roundId, applied, currentResultId: result.id, adjustments: [], feedback: [], startedAt: now.toISOString(), revision: (previous?.revision ?? 0) + 1 };
      await writeState(this.db, stateKeys.round, round);
      // 新轮成功：清除旧轮结果、调整记录、单次反馈与反馈草稿；长期永久反馈条目不受影响。
      await this.db.state.delete(stateKeys.feedbackDraft);
      if (previous) {
        await this.db.results.where('roundId').equals(previous.roundId).delete();
        await releaseImages(this.db, previous.applied.preference?.imageIds ?? []);
      }
      return round;
    });
  }
  async commitAdjustment(input: { expectedRoundId: string; kind: AdjustmentKind; targetGarmentId?: string; result: OutfitResult }, now: Date) {
    const result = outfitResultSchema.parse(input.result);
    return this.db.transaction('rw', this.db.state, this.db.results, this.db.garments, async () => {
      const round = await readState(this.db, stateKeys.round);
      if (!round || round.roundId !== input.expectedRoundId || result.roundId !== round.roundId || result.surface !== 'recommendations') throw new Error('本轮已变化，请刷新后重试。');
      const current = await this.db.results.get(round.currentResultId); if (!current) throw new Error('当前搭配不存在，请重新生成。');
      await this.checkReplacement(current, result, input.kind, input.targetGarmentId, now);
      await this.db.results.add(result);
      const next: RoundState = { ...round, currentResultId: result.id, revision: round.revision + 1,
        adjustments: [...round.adjustments, { id: crypto.randomUUID(), kind: input.kind, fromResultId: current.id, toResultId: result.id, ...(input.targetGarmentId ? { targetGarmentId: input.targetGarmentId } : {}), at: now.toISOString() }] };
      await writeState(this.db, stateKeys.round, next);
      return next;
    });
  }
  async saveFeedback(input: Parameters<SessionStore['saveFeedback']>[0]) {
    return this.db.transaction('rw', this.db.state, this.db.results, this.db.preferences, async () => {
      const round = await readState(this.db, stateKeys.round);
      if (!round || round.roundId !== input.expectedRoundId) throw new Error('本轮已变化，反馈未保存，请重试。');
      if (round.feedback.some(f => f.id === input.feedbackId)) return round;
      const result = await this.db.results.get(input.resultId);
      if (!result || result.roundId !== round.roundId) throw new Error('搭配不存在，反馈未保存，请重试。');
      if (input.preference) await this.db.preferences.add(preferenceSchema.parse(input.preference));
      const order = Math.max(0, ...round.feedback.map(f => f.order)) + 1;
      const next: RoundState = { ...round, revision: round.revision + 1, feedback: [...round.feedback, {
        id: input.feedbackId, resultId: input.resultId, choice: input.choice, reason: input.reason, scope: input.scope,
        ...(input.preference ? { preferenceId: input.preference.id } : {}), order, savedAt: new Date().toISOString() }] };
      await writeState(this.db, stateKeys.round, next);
      await this.db.state.delete(stateKeys.feedbackDraft);
      return next;
    });
  }
  async saveFeedbackDraft(draft: FeedbackDraft) {
    await this.db.transaction('rw', this.db.state, async () => {
      const round = await readState(this.db, stateKeys.round);
      if (!round || round.roundId !== draft.roundId) throw new Error('本轮已变化，请刷新后重试。');
      await writeState(this.db, stateKeys.feedbackDraft, draft);
    });
  }
  async clearFeedbackDraft() { await this.db.state.delete(stateKeys.feedbackDraft); }
  async readHome() {
    return this.db.transaction('r', this.db.state, this.db.results, async () => {
      const home = await readState(this.db, stateKeys.home);
      const current = home ? await this.db.results.get(home.currentResultId) : undefined;
      return { home, current: current ? outfitResultSchema.parse(current) : undefined };
    });
  }
  async commitHome(input: { kind: 'generate' | AdjustmentKind; expectedResultId?: string; targetGarmentId?: string; result: OutfitResult }, now: Date) {
    const result = outfitResultSchema.parse(input.result);
    if (result.surface !== 'home' || result.roundId !== null) throw new Error('结果不属于首页');
    return this.db.transaction('rw', this.db.state, this.db.results, this.db.garments, async () => {
      const home = await readState(this.db, stateKeys.home);
      let adjustments: HomeState['adjustments'] = [];
      if (input.kind === 'generate') {
        await this.requireCandidates(result.garmentIds, now);
        await this.db.results.where('surface').equals('home').delete();
      } else {
        if (!home || home.currentResultId !== input.expectedResultId) throw new Error('首页搭配已变化，请刷新后重试。');
        const current = await this.db.results.get(home.currentResultId); if (!current) throw new Error('当前搭配不存在，请重新生成。');
        await this.checkReplacement(current, result, input.kind, input.targetGarmentId, now);
        adjustments = [...home.adjustments, { id: crypto.randomUUID(), kind: input.kind, fromResultId: current.id, toResultId: result.id, ...(input.targetGarmentId ? { targetGarmentId: input.targetGarmentId } : {}), at: now.toISOString() }];
      }
      await this.db.results.add(result);
      const next: HomeState = { currentResultId: result.id, adjustments, revision: (home?.revision ?? 0) + 1, updatedAt: now.toISOString() };
      await writeState(this.db, stateKeys.home, next);
      return next;
    });
  }
  /** 新整套：全部衣物须当前可用。 */
  private async requireCandidates(ids: string[], now: Date) {
    const items = await this.db.garments.bulkGet(ids);
    const bad = items.map((g, i) => ({ g, id: ids[i] })).filter(({ g }) => !isCandidate(g, now));
    if (bad.length) throw new Error(`搭配包含不可用衣物：${bad.map(({ g, id }) => `${g?.name ?? id}（${{ deleted: '已删除', paused: '暂停中', missing: '不存在', available: '' }[availability(g, now)]}）`).join('、')}`);
  }
  /** 连续调整校验：换单件只替换目标位置且替代须可用，其他位置可保留已删除/暂停衣物；换整套须是不同组合且全部可用。 */
  private async checkReplacement(current: OutfitResult, next: OutfitResult, kind: AdjustmentKind, target: string | undefined, now: Date) {
    const before = new Set(current.garmentIds), after = new Set(next.garmentIds);
    if (kind === 'swap-item') {
      if (!target || !before.has(target)) throw new Error('要更换的衣物不在当前搭配中');
      if (after.has(target)) throw new Error('暂无合适的替代衣物');
      const kept = current.garmentIds.filter(id => id !== target);
      const added = next.garmentIds.filter(id => !before.has(id));
      if (!kept.every(id => after.has(id)) || added.length !== 1 || after.size !== before.size) throw new Error('换掉这件只能替换指定单品');
      await this.requireCandidates(added, now);
      return;
    }
    if ([...after].sort().join('|') === [...before].sort().join('|')) throw new Error('暂无其他符合要求的搭配');
    await this.requireCandidates(next.garmentIds, now);
  }
}
