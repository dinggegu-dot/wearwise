import type { Garment } from '@/modules/wardrobe';
import type { Weather, City } from '@/modules/weather';
import type { Outfit, RecommendationEngine, Style } from '@/modules/recommendation';
import type { Feedback, FeedbackChoice } from '@/modules/feedback';

export interface OutfitRecord {
  recordVersion: 2; id: string; batchId: string; position: number; garmentIds: string[];
  garmentSnapshots: Garment[]; weather: Weather; style: Style; reason: string;
  warnings: string[]; wardrobeRevision: number; createdAt: string;
}
export interface ActiveBatch { batchId: string; city: City; style: Style; weatherFingerprint: string; wardrobeRevision: number }
export interface RecommendationStore {
  snapshot(): Promise<{ garments: Garment[]; revision: number }>;
  saveBatch(records: OutfitRecord[], revision: number): Promise<OutfitRecord[]>;
  activate(active: ActiveBatch, isCurrent?: () => boolean): Promise<void>;
  clearActive(): Promise<void>;
  restore(): Promise<{ active?: ActiveBatch; records: OutfitRecord[]; revision: number }>;
  feedback(outfitId: string, choice: FeedbackChoice): Promise<void>;
  getFeedback(outfitId: string): Promise<Feedback | undefined>;
}
export const weatherFingerprint = (w: Weather) => JSON.stringify([w.city, w.source ?? (w.example ? 'example' : 'open-meteo'), w.dataTime, w.temperature, w.apparentTemperature]);
export class RecommendationService {
  constructor(private readonly store: RecommendationStore, private readonly engine: RecommendationEngine) {}
  async generate(weather: Weather, style: Style, batchId: string, isCurrent: () => boolean = () => true) {
    const snapshot = await this.store.snapshot();
    const result = this.engine.generate(snapshot.garments, weather, style);
    if (!result.outfits.length) return { records: [] as OutfitRecord[], message: result.message };
    const createdAt = new Date().toISOString();
    const records = result.outfits.map((outfit: Outfit, position): OutfitRecord => ({
      recordVersion: 2, id: crypto.randomUUID(), batchId, position, garmentIds: outfit.garmentIds,
      garmentSnapshots: outfit.garments, weather, style, reason: outfit.reason, warnings: outfit.warnings,
      wardrobeRevision: snapshot.revision, createdAt
    }));
    const saved = await this.store.saveBatch(records, snapshot.revision);
    if (!isCurrent()) return { records: [] as OutfitRecord[], message: '选择已更改，请重新生成。' };
    await this.store.activate({ batchId, city: weather.city, style, weatherFingerprint: weatherFingerprint(weather), wardrobeRevision: snapshot.revision }, isCurrent);
    if (!isCurrent()) return { records: [] as OutfitRecord[], message: '选择已更改，请重新生成。' };
    return { records: saved };
  }
  async restore() {
    const data = await this.store.restore();
    if (!data.active || data.active.wardrobeRevision !== data.revision || !data.records.length) return [];
    const first = data.records[0];
    if (first.wardrobeRevision !== data.revision || first.style !== data.active.style || first.weather.city !== data.active.city || weatherFingerprint(first.weather) !== data.active.weatherFingerprint) return [];
    return data.records;
  }
  clearActive() { return this.store.clearActive(); }
  setFeedback(id: string, choice: FeedbackChoice) { return this.store.feedback(id, choice); }
  getFeedback(id: string) { return this.store.getFeedback(id); }
}
