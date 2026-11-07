import { z } from 'zod';
export const cities = {
  深圳: [22.5431, 114.0579], 广州: [23.1291, 113.2644], 上海: [31.2304, 121.4737],
  北京: [39.9042, 116.4074], 成都: [30.5728, 104.0668], 杭州: [30.2741, 120.1551]
} as const;
export type City = keyof typeof cities;
export interface Weather { city: City; temperature: number; apparentTemperature: number; dataTime: string; fetchedAt: string; example: boolean; weatherCode?: number | null; source?: 'open-meteo' | 'example' | 'manual'; cached?: boolean }
export interface WeatherProvider { current(city: City, signal?: AbortSignal): Promise<Weather> }
const responseSchema = z.object({
  current_units: z.object({ temperature_2m: z.literal('°C'), apparent_temperature: z.literal('°C') }),
  current: z.object({ time: z.number().int().positive(), temperature_2m: z.number().finite(), apparent_temperature: z.number().finite(), weather_code: z.number().int().nullable().optional() })
});
export class OpenMeteoProvider implements WeatherProvider {
  async current(city: City, signal?: AbortSignal): Promise<Weather> {
    const coords = cities[city];
    if (!coords) throw new Error('请选择有效城市');
    const params = new URLSearchParams({ latitude: String(coords[0]), longitude: String(coords[1]), current: 'temperature_2m,apparent_temperature,weather_code', timezone: 'Asia/Shanghai', timeformat: 'unixtime' });
    const deadline = AbortSignal.timeout(10000);
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
    if (!response.ok) throw new Error('天气暂时不可用，请重试');
    const parsed = responseSchema.parse(await response.json());
    const observedAt = parsed.current.time * 1000, now = Date.now();
    // Open-Meteo 的 current 可有观测延迟；拒绝明显过期或超前的数据。
    if (observedAt < now - 3 * 60 * 60 * 1000 || observedAt > now + 15 * 60 * 1000) throw new Error('天气观测时间异常，请重试');
    const dataTime = new Date(observedAt).toISOString();
    return { city, temperature: parsed.current.temperature_2m, apparentTemperature: parsed.current.apparent_temperature, weatherCode: parsed.current.weather_code ?? null, dataTime, fetchedAt: new Date().toISOString(), example: false, source: 'open-meteo' };
  }
}
export class ExampleWeatherProvider implements WeatherProvider {
  async current(city: City): Promise<Weather> { const now = new Date().toISOString(); return { city, temperature: 22, apparentTemperature: 21, weatherCode: 2, dataTime: now, fetchedAt: now, example: true, source: 'example' }; }
}
export class WeatherService {
  private cache = new Map<City, Weather>();
  constructor(private readonly provider: WeatherProvider, private readonly example: WeatherProvider = new ExampleWeatherProvider()) {}
  async current(city: City, options: { refresh?: boolean; signal?: AbortSignal } = {}): Promise<Weather> {
    const cached = this.cache.get(city);
    if (!options.refresh && cached && Date.now() - Date.parse(cached.fetchedAt) < 300_000) return { ...cached, cached: true };
    const weather = await this.provider.current(city, options.signal);
    if (weather.city !== city || weather.example) throw new Error('天气响应与所选城市不一致');
    this.cache.set(city, weather); return weather;
  }
  useExample(city: City) { return this.example.current(city); }
}
