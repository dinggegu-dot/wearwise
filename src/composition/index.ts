import { WardrobeService } from '@/modules/wardrobe';
import { FeedbackService } from '@/modules/feedback';
import { RuleRecommendationEngine } from '@/modules/recommendation';
import { ExampleWeatherProvider, OpenMeteoProvider } from '@/modules/weather';
import { DexieFeedbackRepository, DexieMediaRepository, DexieWardrobeRepository, WearWiseDatabase } from '@/shared/infrastructure/database';
export type Mode = 'demo' | 'real';
export function createServices(mode: Mode) {
  const db = new WearWiseDatabase(mode === 'demo' ? 'wearwise-demo-v1' : 'wearwise-real-v1');
  return { db, wardrobe: new WardrobeService(new DexieWardrobeRepository(db), new DexieMediaRepository(db)), feedback: new FeedbackService(new DexieFeedbackRepository(db)), weather: mode === 'demo' ? new ExampleWeatherProvider() : new OpenMeteoProvider(), recommendation: new RuleRecommendationEngine() };
}

export async function saveOutfit(services: ReturnType<typeof createServices>, garmentIds: string[]) {
  const id = crypto.randomUUID();
  await services.db.outfits.put({ id, garmentIds, createdAt: new Date().toISOString() });
  return id;
}
export async function resetDemo(services: ReturnType<typeof createServices>) {
  if (services.db.name !== 'wearwise-demo-v1') throw new Error('仅可重置演示衣橱');
  await services.db.transaction('rw', services.db.garments, services.db.media, services.db.outfits, services.db.feedback, async () => {
    await Promise.all([services.db.garments.clear(), services.db.media.clear(), services.db.outfits.clear(), services.db.feedback.clear()]);
  });
  await seedDemo(services);
}
export async function seedDemo(services: ReturnType<typeof createServices>) {
  const data = [
    ['奶白棉 T 恤','top','奶白','light',['日常','休闲']], ['浅绿针织衫','top','浅绿','medium',['简约','日常']],
    ['深蓝直筒牛仔裤','bottom','深蓝','medium',['休闲','日常']], ['米色西装裤','bottom','米色','medium',['简约','通勤']],
    ['橄榄绿外套','outerwear','绿色','warm',['休闲','通勤']], ['浅米连衣裙','dress','浅米','medium',['简约','日常']],
    ['白色运动鞋','shoes','白色','light',['运动','休闲']], ['深棕乐福鞋','shoes','深棕','medium',['通勤','简约']]
  ] as const;
  if ((await services.wardrobe.list()).length) return;
  for (const [name, category, color, warmth, styleTags] of data) {
    const blob = illustration(category, color);
    await services.wardrobe.add({ name, category, color, warmth, styleTags: [...styleTags], sourceType: 'demo' }, blob);
  }
}
export function illustration(category: string, color: string) {
  const fill: Record<string,string> = { 奶白:'#eee6d6', 浅绿:'#b6c5a8', 深蓝:'#52677a', 米色:'#d4c2a8', 绿色:'#87957a', 浅米:'#dfd1bd', 白色:'#f7f5ed', 深棕:'#756050' };
  const shapes: Record<string,string> = { top:'M70 65 L105 48 Q120 70 135 48 L170 65 L190 99 L165 112 L155 96 L155 174 L85 174 L85 96 L75 112 L50 99 Z', outerwear:'M70 65 L105 48 L120 72 L135 48 L170 65 L190 105 L164 114 L157 98 L157 180 L83 180 L83 98 L76 114 L50 105 Z', bottom:'M83 52 L157 52 L153 112 L164 183 L129 183 L120 120 L111 183 L76 183 L87 112 Z', dress:'M105 48 Q120 68 135 48 L157 66 L149 105 L177 179 L63 179 L91 105 L83 66 Z', shoes:'M47 142 Q75 144 85 112 L112 112 Q119 133 139 138 L151 155 Q154 170 140 170 L55 170 Q40 168 47 142 M128 132 Q149 132 156 107 L180 107 Q186 130 202 135 L211 149 Q214 164 199 164 L151 164' };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" rx="18" fill="#f5f0e8"/><path d="${shapes[category] || shapes.top}" fill="${fill[color] || '#c7c8b7'}" stroke="#918c7e" stroke-width="2" stroke-linejoin="round"/></svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}
