import { z } from 'zod';
export const cities = {
  深圳: [22.5431, 114.0579], 广州: [23.1291, 113.2644], 上海: [31.2304, 121.4737],
  北京: [39.9042, 116.4074], 成都: [30.5728, 104.0668], 杭州: [30.2741, 120.1551]
} as const;
export type City = keyof typeof cities;
export interface Weather { city: City; temperature: number; apparentTemperature: number; dataTime: string; fetchedAt: string; example: boolean }
export interface WeatherProvider { current(city: City): Promise<Weather> }
const responseSchema = z.object({ current: z.object({ time: z.string(), temperature_2m: z.number().finite(), apparent_temperature: z.number().finite() }) });
export class OpenMeteoProvider implements WeatherProvider {
  async current(city: City): Promise<Weather> {
    const coords = cities[city];
    if (!coords) throw new Error('请选择有效城市');
    const params = new URLSearchParams({ latitude: String(coords[0]), longitude: String(coords[1]), current: 'temperature_2m,apparent_temperature', timezone: 'Asia/Shanghai' });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('天气暂时不可用，请重试');
    const parsed = responseSchema.parse(await response.json());
    return { city, temperature: parsed.current.temperature_2m, apparentTemperature: parsed.current.apparent_temperature, dataTime: parsed.current.time, fetchedAt: new Date().toISOString(), example: false };
  }
}
export class ExampleWeatherProvider implements WeatherProvider {
  async current(city: City): Promise<Weather> { return { city, temperature: 22, apparentTemperature: 21, dataTime: '示例数据', fetchedAt: new Date().toISOString(), example: true }; }
}
