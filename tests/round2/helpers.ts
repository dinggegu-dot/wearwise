import { WearWiseDatabase, DexieMediaRepository, DexieWardrobeRepository } from '@/shared/infrastructure/database';
import { DexieInspirationStore, DexiePreferenceStore, DexieSessionStore } from '@/shared/infrastructure/round2-stores';
import { WardrobeService, type GarmentInput } from '@/modules/wardrobe';
import { InspirationService } from '@/modules/inspiration';
import { PreferenceService } from '@/modules/preferences';
import { SessionService, toWeatherSnapshot } from '@/modules/session';
import { ExampleWeatherProvider } from '@/modules/weather';

export const opened: WearWiseDatabase[] = [];
export async function cleanup() { for (const db of opened.splice(0)) await db.delete(); }

/** 与 src/composition 相同的装配方式，但使用独立测试库。 */
export function services(name = `wearwise-test-${crypto.randomUUID()}`) {
  const db = new WearWiseDatabase(name); opened.push(db);
  const media = new DexieMediaRepository(db);
  const wardrobe = new WardrobeService(new DexieWardrobeRepository(db), media);
  const preferences = new PreferenceService(new DexiePreferenceStore(db));
  return { db, wardrobe, preferences, inspiration: new InspirationService(new DexieInspirationStore(db), media), session: new SessionService(new DexieSessionStore(db), wardrobe, preferences) };
}
export const garment = (name: string, category: GarmentInput['category'], extra: Partial<GarmentInput> = {}): GarmentInput =>
  ({ name, category, color: '白', warmth: 'medium', styleTags: [], sourceType: 'manual', ...extra });
/** 上衣、下装、鞋各两件。 */
export async function seedWardrobe(wardrobe: WardrobeService) {
  const ids: Record<string, string> = {};
  for (const [name, category] of [['T1', 'top'], ['T2', 'top'], ['B1', 'bottom'], ['B2', 'bottom'], ['S1', 'shoes'], ['S2', 'shoes']] as const)
    ids[name] = (await wardrobe.add(garment(name, category), new Blob([`img-${name}`]))).id;
  return ids;
}
export async function todayWeather() { return toWeatherSnapshot(await new ExampleWeatherProvider().current('深圳'), ['apparentTemperature', 'temperatureMin', 'temperatureMax']); }
