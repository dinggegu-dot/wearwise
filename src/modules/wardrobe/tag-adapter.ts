/** M03 temporary boundary until M02's shared/domain/tags.ts is integrated.
 * Source: OUTFIT-TIPS V1.2 + Round 5 confirmed Chinese labels, 9 styles / 6 scenes.
 * Replace this module's implementation with M02 exports after integration, not the UI.
 */
export const STYLE_TAGS = ['中性风', '甜美风', '亚文化风', '简约风', '优雅风', '复古风', '街头风', '运动休闲风', '学院风'] as const;
export const SCENE_TAGS = ['学习', '上班', '约会', '朋友聚会', '运动健身', '户外'] as const;
export const OTHER_TAG = '其他';
export type TagKind = 'style' | 'scene';
export interface WardrobeTags { styleTags: string[]; sceneTags: string[]; styleOther: string[]; sceneOther: string[] }
const englishStyles = ['Neutral Style', 'Sweet Style', 'Subculture Style', 'Minimalist Style', 'Elegant Style', 'Vintage Style', 'Streetwear', 'Athleisure', 'Preppy Style'];
const englishScenes = ['Study', 'Work', 'Date', 'Friends Gathering', 'Fitness and Sports', 'Outdoor'];
const aliases: Record<TagKind, Record<string, string>> = {
  style: { 中性: '中性风', 甜美: '甜美风', 亚文化: '亚文化风', 简约: '简约风', 极简: '简约风', 极简风: '简约风', 优雅: '优雅风', 复古: '复古风', 街头: '街头风', 运动休闲: '运动休闲风', 学院: '学院风' },
  scene: { 工作: '上班', 聚会: '朋友聚会', 健身: '运动健身', 运动: '运动健身' },
};
export function mapTag(kind: TagKind, raw: string): string | undefined {
  const value = raw.trim(), choices: readonly string[] = kind === 'style' ? STYLE_TAGS : SCENE_TAGS;
  if (choices.includes(value)) return value;
  const index = (kind === 'style' ? englishStyles : englishScenes).findIndex(word => word.toLowerCase() === value.toLowerCase());
  return index >= 0 ? choices[index] : aliases[kind][value];
}
const uncertain = (s: string) => /^(不确定|未知|unknown|uncertain|无法判断)$/i.test(s);
const unique = (values: string[]) => [...new Set(values.map(s => s.trim()).filter(Boolean))];
export function resolveTags(kind: TagKind, values: readonly string[] = [], notes: readonly string[] = []) {
  const tags: string[] = [], other = unique([...notes]).filter(s => !uncertain(s));
  for (const raw of values) {
    const value = raw.trim();
    if (!value || uncertain(value)) continue;
    const mapped = mapTag(kind, value);
    if (mapped) tags.push(mapped);
    else if (value === OTHER_TAG) tags.push(OTHER_TAG);
    else other.push(value);
  }
  if (other.length) tags.push(OTHER_TAG);
  return { tags: unique(tags), other: unique(other) };
}
export function readTags(input: Partial<WardrobeTags>): WardrobeTags {
  const style = resolveTags('style', input.styleTags, input.styleOther);
  const scene = resolveTags('scene', input.sceneTags, input.sceneOther);
  return { styleTags: style.tags, styleOther: style.other, sceneTags: scene.tags, sceneOther: scene.other };
}
export function validateTags(value: WardrobeTags): void {
  for (const kind of ['style', 'scene'] as const) {
    const tags = value[`${kind}Tags`], notes = value[`${kind}Other`];
    if (tags.length > 12 || notes.length > 20 || notes.some(s => !s.trim() || s.length > 30)) throw new Error('每组最多12个标签、20条其他说明，每条说明须为1–30字。');
    if (tags.includes(OTHER_TAG) !== (notes.length > 0)) throw new Error('选择“其他”时请填写对应说明；不确定时请清空选择。');
    if (tags.some(tag => tag !== OTHER_TAG && !mapTag(kind, tag))) throw new Error('请选择固定候选标签。');
  }
}
