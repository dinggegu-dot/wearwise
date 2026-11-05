import type { Garment } from '@/modules/wardrobe';
import type { Weather } from '@/modules/weather';
export type Style = '日常休闲' | '简约通勤';
export interface Outfit { garmentIds: string[]; garments: Garment[]; reason: string }
export interface RecommendationResult { outfits: Outfit[]; message?: string }
export interface RecommendationEngine { generate(garments: Garment[], weather: Weather, style: Style, now?: Date): RecommendationResult }
const tags: Record<Style, Record<string, number>> = { 日常休闲: { 休闲: 2, 日常: 1, 运动: 1 }, 简约通勤: { 通勤: 2, 简约: 1, 正式: 1 } };
export class RuleRecommendationEngine implements RecommendationEngine {
  generate(garments: Garment[], weather: Weather, style: Style, now = new Date()): RecommendationResult {
    const available = garments.filter(g => g.status === 'confirmed' && !g.excludedPermanently && (!g.excludedUntil || Date.parse(g.excludedUntil) <= now.getTime()));
    const group = (category: Garment['category']) => available.filter(g => g.category === category);
    const tops = group('top'), bottoms = group('bottom'), dresses = group('dress'), shoes = group('shoes'), coats = group('outerwear');
    const cold = weather.apparentTemperature < 15;
    const missing: string[] = [];
    if (!shoes.length) missing.push('鞋');
    if ((!tops.length || !bottoms.length) && !dresses.length) {
      if (!tops.length) missing.push('上衣');
      if (!bottoms.length) missing.push('下装');
      missing.push('或连衣裙');
    }
    if (cold && !coats.length) missing.push('外套');
    if (missing.length) return { outfits: [], message: `可用衣物不足：请添加或恢复${missing.join('、')}。` };
    const bases: Garment[][] = [];
    for (const top of tops) for (const bottom of bottoms) for (const shoe of shoes) bases.push([top, bottom, shoe]);
    for (const dress of dresses) for (const shoe of shoes) bases.push([dress, shoe]);
    const combinations = cold ? bases.flatMap(base => coats.map(coat => [...base, coat])) : bases;
    const target = cold ? 'warm' : weather.apparentTemperature < 23 ? 'medium' : 'light';
    const ranked = combinations.map(items => {
      const warmthItems = items.filter(g => g.category !== 'shoes');
      const warmth = warmthItems.reduce((n, g) => n + (g.warmth === target ? 2 : g.warmth === 'unknown' ? -1 : 0), 0) / warmthItems.length;
      const styleScore = items.reduce((n, g) => n + [...new Set(g.styleTags)].reduce((v, t) => v + (tags[style][t] ?? 0), 0), 0) / items.length;
      const key = items.map(g => g.id).sort().join('|');
      return { items, warmth, styleScore, key };
    }).sort((a, b) => b.warmth - a.warmth || b.styleScore - a.styleScore || a.key.localeCompare(b.key));
    const seen = new Set<string>();
    const outfits = ranked.filter(item => { if (seen.has(item.key)) return false; seen.add(item.key); return true; }).slice(0, 2).map(({ items }) => ({ garmentIds: items.map(g => g.id), garments: items, reason: `根据体感 ${weather.apparentTemperature}°C 选择${cold ? '带外套的' : ''}组合，并按${style}标签排序。` }));
    return { outfits };
  }
}
