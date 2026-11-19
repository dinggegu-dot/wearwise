import { isCandidate, type Garment } from '@/modules/wardrobe';
import type { Weather } from '@/modules/weather';
export type Style = '日常休闲' | '简约通勤';
export interface Outfit { garmentIds: string[]; garments: Garment[]; reason: string; warnings: string[] }
export interface RecommendationResult { outfits: Outfit[]; message?: string }
export interface RecommendationEngine { generate(garments: Garment[], weather: Weather, style: Style, now?: Date): RecommendationResult }
const tags: Record<Style, Record<string, number>> = { 日常休闲: { 休闲: 2, 日常: 1, 运动: 1 }, 简约通勤: { 通勤: 2, 简约: 1, 正式: 1 } };
type Ranked = { items: Garment[]; warmth: number; style: number; key: string };
export class RuleRecommendationEngine implements RecommendationEngine {
  generate(garments: Garment[], weather: Weather, style: Style, now = new Date()): RecommendationResult {
    if (!Number.isFinite(weather.apparentTemperature)) throw new Error('天气温度无效');
    // 新候选只取未删除、未暂停或已到恢复日期（北京时间）的衣物。
    const available = garments.filter(g => isCandidate(g, now));
    const group = (category: Garment['category']) => available.filter(g => g.category === category);
    const tops = group('top'), bottoms = group('bottom'), dresses = group('dress'), shoes = group('shoes');
    const allCoats = group('outerwear'), coats = allCoats.filter(g => g.warmth !== 'unknown');
    const cold = weather.apparentTemperature < 15;
    const missing: string[] = [];
    if (!shoes.length) missing.push('鞋');
    if ((!tops.length || !bottoms.length) && !dresses.length) {
      if (!tops.length) missing.push('上衣');
      if (!bottoms.length) missing.push('下装');
      missing.push('或连衣裙');
    }
    if (cold && !coats.length) missing.push(allCoats.length ? '保暖程度已知的外套' : '外套');
    if (missing.length) return { outfits: [], message: `可用衣物不足：请添加或完善${missing.join('、')}。` };
    const target = cold ? 'warm' : weather.apparentTemperature < 23 ? 'medium' : 'light';
    const best: Ranked[] = [];
    const compare = (a: Ranked, b: Ranked) => b.warmth - a.warmth || b.style - a.style || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    // 流式维护前两名，避免将全部组合加载到内存。
    const consider = (items: Garment[]) => {
      const scored = items.filter(g => g.category !== 'shoes');
      const warmth = scored.reduce((sum, g) => sum + (g.warmth === target ? 2 : g.warmth === 'unknown' ? -1 : 0), 0) / scored.length;
      const styleScore = items.reduce((sum, g) => sum + [...new Set(g.styleTags)].reduce((value, tag) => value + (tags[style][tag] ?? 0), 0), 0) / items.length;
      const key = items.map(g => g.id).sort().join('|');
      if (best.some(item => item.key === key)) return;
      best.push({ items, warmth, style: styleScore, key }); best.sort(compare); if (best.length > 2) best.pop();
    };
    const addBase = (items: Garment[]) => { if (cold) for (const coat of coats) consider([...items, coat]); else consider(items); };
    for (const top of tops) for (const bottom of bottoms) for (const shoe of shoes) addBase([top, bottom, shoe]);
    for (const dress of dresses) for (const shoe of shoes) addBase([dress, shoe]);
    return { outfits: best.map(({ items }) => {
      const warnings: string[] = [];
      if (items.some(item => item.warmth === 'unknown')) warnings.push('部分衣物的保暖程度未知。');
      if (cold && items.some(item => item.category === 'outerwear' && item.warmth !== 'warm')) warnings.push('外套可能偏薄，请结合实际体感调整。');
      return { garmentIds: items.map(g => g.id), garments: items, reason: `根据体感 ${weather.apparentTemperature}°C 选择${cold ? '带外套的' : ''}组合，并按${style}标签排序。`, warnings };
    }) };
  }
}
