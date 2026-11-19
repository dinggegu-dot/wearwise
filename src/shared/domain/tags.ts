import { z } from 'zod';

/**
 * 衣物风格／场景标签的统一词表（《网页功能概述》第 4 版 · 2026-11-16 标签投票）。
 *
 * 衣橱上传确认、编辑、详情，衣物识别映射，推荐页本次喜好与本次场景，都只从这里取候选和做校验，
 * 不允许各页面各写一套。词表内容变化只改本文件，字段结构不变。
 *
 * 状态：
 * - 场景：v4 列出的 6 项（至少覆盖），开发前仍需小组统一确认是否增补。
 * - 风格：v4 只给出“超过 6 个”及补充方向（中性、甜美、亚文化），完整名单待 06 确认；
 *   下列风格为占位，沿用现有代码中已使用的词并加入 v4 的补充方向。
 */
export const STYLE_TAGS = ['简约', '休闲', '通勤', '正式', '运动', '街头', '复古', '甜美', '中性', '亚文化'] as const;
export const SCENE_TAGS = ['学习', '上班', '约会', '朋友聚会', '运动健身', '户外'] as const;
/** 无法映射到固定词表时使用。“其他”≠“不确定”，也不会自动扩充公共词表。 */
export const OTHER_TAG = '其他';

export type TagKind = 'style' | 'scene';
export type StyleTag = (typeof STYLE_TAGS)[number];
export type SceneTag = (typeof SCENE_TAGS)[number];

export const vocabulary: Record<TagKind, readonly string[]> = { style: STYLE_TAGS, scene: SCENE_TAGS };
export const tagLabels: Record<TagKind, string> = { style: '风格', scene: '场景' };

/** 同义表达统一到固定词表。只放没有歧义的对应，拿不准的一律进入“其他”。 */
const synonyms: Record<TagKind, Record<string, string>> = {
  style: { 极简: '简约', 简洁: '简约', 运动风: '运动', 街头风: '街头', 复古风: '复古', 甜美风: '甜美', 中性风: '中性', 商务正式: '正式' },
  scene: { 聚会: '朋友聚会', 朋友聚餐: '朋友聚会', 健身: '运动健身', 运动: '运动健身', 上课: '学习', 上学: '学习', 工作: '上班', 户外活动: '户外' }
};

/** 单个词映射到固定词表；映射不到返回 undefined。 */
export function mapTag(kind: TagKind, raw: string): string | undefined {
  const word = raw.trim();
  if (!word) return undefined;
  const list = vocabulary[kind];
  if (list.includes(word)) return word;
  const alias = synonyms[kind][word];
  if (alias) return alias;
  // “休闲风”“通勤风”等：去掉末尾的“风”后再对照。
  if (kind === 'style' && word.endsWith('风') && list.includes(word.slice(0, -1))) return word.slice(0, -1);
  return undefined;
}

export const MAX_TAGS = 12;
export const MAX_OTHER_NOTES = 20;
const note = z.string().trim().min(1).max(30);

/** 一组标签：只能是固定词表中的值或“其他”；有“其他”时必须带原始识别词或说明。 */
export function tagGroupIssues(kind: TagKind, tags: readonly string[], other: readonly string[]) {
  const issues: string[] = [];
  const allowed = new Set<string>([...vocabulary[kind], OTHER_TAG]);
  for (const tag of tags) if (!allowed.has(tag)) issues.push(`${tagLabels[kind]}标签“${tag}”不在固定词表中`);
  if (new Set(tags).size !== tags.length) issues.push(`${tagLabels[kind]}标签有重复`);
  const hasOther = tags.includes(OTHER_TAG);
  if (hasOther && !other.length) issues.push(`选择“其他”${tagLabels[kind]}时需保留原始识别词或说明`);
  if (!hasOther && other.length) issues.push(`未选择“其他”${tagLabels[kind]}时不应保留其他说明`);
  return issues;
}

export const tagListSchema = z.array(z.string().trim().min(1)).max(MAX_TAGS);
export const otherNotesSchema = z.array(note).max(MAX_OTHER_NOTES);

/**
 * 把一组输入词整理成“固定值 + 其他说明”。
 * - 输入可以是 AI 原始输出、旧数据中的自由文本或页面选中的固定值。
 * - 能映射的转为固定值；映射不到的放入 other，并补上“其他”。
 * - 输入中已有“其他”时，沿用 keepOther 提供的说明（例如编辑时保留原说明）。
 * - 用户删除“其他”且没有新的未映射词时，other 清空。
 */
export function resolveTags(kind: TagKind, input: readonly string[], keepOther: readonly string[] = []) {
  const tags: string[] = [];
  const other: string[] = [];
  let wantsOther = false;
  for (const raw of input) {
    const word = raw.trim();
    if (!word) continue;
    if (word === OTHER_TAG) { wantsOther = true; continue; }
    const mapped = mapTag(kind, word);
    if (mapped) { if (!tags.includes(mapped)) tags.push(mapped); }
    else if (!other.includes(word)) other.push(word.slice(0, 30));
  }
  if (wantsOther) for (const word of keepOther) { const w = word.trim(); if (w && !other.includes(w)) other.push(w.slice(0, 30)); }
  if (other.length) tags.push(OTHER_TAG);
  return { tags: tags.slice(0, MAX_TAGS), other: other.slice(0, MAX_OTHER_NOTES) };
}

/** 推荐页本次喜好的风格标签与本次场景选择：只能取固定词表中的值，不含“其他”。 */
export const styleChoiceSchema = z.enum(STYLE_TAGS);
export const sceneChoiceSchema = z.enum(SCENE_TAGS);
