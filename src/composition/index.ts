import { RecognitionService } from '@/modules/recognition';
import { HttpRecognitionProvider, UnavailableRecognitionProvider } from '@/modules/recognition/infrastructure/http-provider';
import { DemoService } from '@/modules/demo';
import { WardrobeService } from '@/modules/wardrobe';
import { FeedbackService } from '@/modules/feedback';
import { RuleRecommendationEngine } from '@/modules/recommendation';
import { RecommendationService } from '@/modules/recommendation/service';
import { ExampleWeatherProvider, OpenMeteoProvider, WeatherService } from '@/modules/weather';
import { InspirationService } from '@/modules/inspiration';
import { PreferenceService } from '@/modules/preferences';
import { SessionService } from '@/modules/session';
import { DexieInspirationStore, DexiePreferenceStore, DexieSessionStore } from '@/shared/infrastructure/round2-stores';
import { DexieFeedbackRepository, DexieMediaRepository, DexieWardrobeRepository, DexieRecommendationStore, DexieDemoStore, WearWiseDatabase } from '@/shared/infrastructure/database';
export type Mode = 'demo' | 'real';
export function createWeatherService(mode: Mode) { return new WeatherService(mode === 'demo' ? new ExampleWeatherProvider() : new OpenMeteoProvider()); }
export function createServices(mode: Mode) {
  const db = new WearWiseDatabase(mode === 'demo' ? 'wearwise-demo-v1' : 'wearwise-real-v1');
  const media = new DexieMediaRepository(db);
  const wardrobe = new WardrobeService(new DexieWardrobeRepository(db), media);
  const preferences = new PreferenceService(new DexiePreferenceStore(db));
  return { // effect清理后同一服务可能被开发StrictMode再次使用，允许下次访问重新打开。
    dispose: () => db.close({ disableAutoOpen: false }),
    // 第 2 轮数据服务：灵感、三组长期偏好、推荐过程（推荐页轮次与首页结果独立）。
    inspiration: new InspirationService(new DexieInspirationStore(db), media),
    preferences,
    session: new SessionService(new DexieSessionStore(db), wardrobe, preferences), recognition: new RecognitionService(mode === 'demo' || process.env.NEXT_PUBLIC_RUNTIME_TARGET === 'pages' ? new UnavailableRecognitionProvider() : new HttpRecognitionProvider()), demo: new DemoService(new DexieDemoStore(db)), wardrobe, feedback: new FeedbackService(new DexieFeedbackRepository(db)), weather: mode === 'demo' ? new ExampleWeatherProvider() : new OpenMeteoProvider(), recommendation: new RecommendationService(new DexieRecommendationStore(db), new RuleRecommendationEngine()) };
}

export { illustration } from '@/modules/demo';
