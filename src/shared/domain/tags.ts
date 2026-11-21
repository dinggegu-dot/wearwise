import { z } from 'zod';

/**
 * 衣物风格／场景标签的统一词表。
 *
 * 依据：《网页功能概述》第 4 版、2026-11-16 标签投票，以及第 5 轮（PR #35）确认的
 * OUTFIT-TIPS V1.2 中文标签：9 种风格、6 种场景。
 *
 * 衣橱上传确认、编辑、详情，衣物识别映射，推荐页本次喜好与本次场景，都只从这里取候选和做校验，
 * 不允许各页面各写一套。第 5 轮的 `src/modules/wardrobe/tag-adapter.ts` 整合后改为转出本模块。
 */
export const STYLE_TAGS = ['中性风', '甜美风', '亚文化风', '简约风', '优雅风', '复古风', '街头风', '运动休闲风', '学院风'] as const;
export const SCENE_TAGS = ['学习', '上班', '约会', '朋友聚会', '运动健身', '户外'] as const;
/** “其他”是说明入口，不算第 10 种风格或第 7 种场景；“其他”≠“不确定”，也不自动扩充公共词表。 */
export const OTHER_TAG = '其他';

export type TagKind = 'style' | 'scene';
export type StyleTag = (typeof STYLE_TAGS)[number];
export type SceneTag = (typeof SCENE_TAGS)[number];
/** 衣物的四个标签字段。 */
export interface WardrobeTags { styleTags: string[]; sceneTags: string[]; styleOther: string[]; sceneOther: string[] }

export const vocabulary: Record<TagKind, readonly string[]> = { style: STYLE_TAGS, scene: SCENE_TAGS };
export const tagLabels: Record<TagKind, string> = { style: '风格', scene: '场景' };

/** OUTFIT-TIPS V1.2 英文名，与词表按位置一一对应（AI 输出英文时使用）。 */
const englishNames: Record<TagKind, readonly string[]> = {
  style: ['Neutral Style', 'Sweet Style', 'Subculture Style', 'Minimalist Style', 'Elegant Style', 'Vintage Style', 'Streetwear', 'Athleisure', 'Preppy Style'],
  scene: ['Study', 'Work', 'Date', 'Friends Gathering', 'Fitness and Sports', 'Outdoor']
};
/** 只收录没有歧义的同义表达；“日常”“休闲”“通勤”等拿不准的词不硬归类，进入“其他”。 */
const aliases: Record<TagKind, Record<string, string>> = {
  style: { 中性: '中性风', 甜美: '甜美风', 亚文化: '亚文化风', 简约: '简约风', 极简: '简约风', 极简风: '简约风', 优雅: '优雅风', 复古: '复古风', 街头: '街头风', 运动休闲: '运动休闲风', 学院: '学院风' },
  scene: { 工作: '上班', 聚会: '朋友聚会', 健身: '运动健身', 运动: '运动健身' }
};

/** 单个词映射到固定词表（中文名、英文名或同义词）；映射不到返回 undefined。 */
export function mapTag(kind: TagKind, raw: string): string | undefined {
  const value = raw.trim();
  const choices = vocabulary[kind];
  if (choices.includes(value)) return value;
  const index = englishNames[kind].findIndex(word => word.toLowerCase() === value.toLowerCase());
  return index >= 0 ? choices[index] : aliases[kind][value];
}

/** “不确定”类的词：不是“其他”，整理时直接丢弃，对应选择保持为空。 */
export const isUncertain = (s: string) => /^(不确定|未知|unknown|uncertain|无法判断)$/i.test(s.trim());
const unique = (values: string[]) => [...new Set(values.map(s => s.trim()).filter(Boolean))];

export const MAX_TAGS = 12;
export const MAX_OTHER_NOTES = 20;
export const MAX_NOTE_LENGTH = 30;

/**
 * 把一组输入词整理成“固定值 + 其他说明”。
 * - values 可以是 AI 原始输出、旧数据中的自由文本或页面选中的固定值。
 * - 能映射的转为固定值；映射不到的放入 other；“不确定”类的词丢弃。
 * - notes 是已有的“其他”说明，原样保留（去空、去重）。
 * - other 非空时补上“其他”。
 */
export function resolveTags(kind: TagKind, values: readonly string[] = [], notes: readonly string[] = []) {
  const tags: string[] = [];
  const other = unique([...notes]).filter(s => !isUncertain(s));
  for (const raw of values) {
    const value = raw.trim();
    if (!value || isUncertain(value)) continue;
    const mapped = mapTag(kind, value);
    if (mapped) tags.push(mapped);
    else if (value === OTHER_TAG) tags.push(OTHER_TAG);
    else other.push(value);
  }
  if (other.length) tags.push(OTHER_TAG);
  return { tags: unique(tags), other: unique(other) };
}

/** 读取任意（含旧版、缺字段）记录的四个标签字段，得到整理后的视图，不改动原记录。 */
export function readTags(input: Partial<WardrobeTags>): WardrobeTags {
  const style = resolveTags('style', input.styleTags, input.styleOther);
  const scene = resolveTags('scene', input.sceneTags, input.sceneOther);
  return { styleTags: style.tags, styleOther: style.other, sceneTags: scene.tags, sceneOther: scene.other };
}

/** 一组标签的问题列表：只能是固定值或“其他”；“其他”与说明必须同时出现。 */
export function tagGroupIssues(kind: TagKind, tags: readonly string[], other: readonly string[]) {
  const issues: string[] = [];
  const label = tagLabels[kind];
  if (tags.length > MAX_TAGS || other.length > MAX_OTHER_NOTES || other.some(s => !s.trim() || s.length > MAX_NOTE_LENGTH))
    issues.push(`${label}：每组最多${MAX_TAGS}个标签、${MAX_OTHER_NOTES}条其他说明，每条说明须为1–${MAX_NOTE_LENGTH}字。`);
  if (tags.includes(OTHER_TAG) !== (other.length > 0)) issues.push(`${label}：选择“其他”时请填写对应说明；不确定时请清空选择。`);
  if (tags.some(tag => tag !== OTHER_TAG && !vocabulary[kind].includes(tag))) issues.push(`${label}：请选择固定候选标签。`);
  if (new Set(tags).size !== tags.length) issues.push(`${label}：标签有重复。`);
  return issues;
}

/** 校验四个标签字段，有问题时抛出第一条中文提示。 */
export function validateTags(value: WardrobeTags): void {
  const issues = [...tagGroupIssues('style', value.styleTags, value.styleOther), ...tagGroupIssues('scene', value.sceneTags, value.sceneOther)];
  if (issues.length) throw new Error(issues[0]);
}

export const tagListSchema = z.array(z.string().trim().min(1)).max(MAX_TAGS);
export const otherNotesSchema = z.array(z.string().trim().min(1).max(MAX_NOTE_LENGTH)).max(MAX_OTHER_NOTES);

/** 推荐页本次喜好的风格标签与本次场景选择：只能取固定词表中的值，不含“其他”。 */
export const styleChoiceSchema = z.enum(STYLE_TAGS);
export const sceneChoiceSchema = z.enum(SCENE_TAGS);
