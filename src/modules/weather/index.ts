
import { z } from 'zod';
import { beijingDate } from '@/shared/domain/beijing-date';

export const cities = {
  深圳: [22.5431, 114.0579],
  广州: [23.1291, 113.2644],
  上海: [31.2304, 121.4737],
  北京: [39.9042, 116.4074],
  成都: [30.5728, 104.0668],
  杭州: [30.2741, 120.1551]
} as const;

export type City = keyof typeof cities;

export interface Weather {
  city: City;
  temperature: number;
  apparentTemperature: number;
  dataTime: string;
  fetchedAt: string;
  example: boolean;
  weatherCode?: number | null;
  source?: 'open-meteo' | 'example';
  cached?: boolean;
  temperatureMin?: number | null;
  temperatureMax?: number | null;
}

export interface WeatherProvider {
  current(city: City, signal?: AbortSignal): Promise<Weather>;
}

export interface WeatherRequestOptions {
  refresh?: boolean;
  signal?: AbortSignal;
}

const responseSchema = z.object({
  current_units: z.object({
    temperature_2m: z.literal('°C'),
    apparent_temperature: z.literal('°C')
  }),
  current: z.object({
    time: z.number().int().positive(),
    temperature_2m: z.number().finite(),
    apparent_temperature: z.number().finite(),
    weather_code: z.number().int().nullable().optional()
  }),
  daily: z.object({
    temperature_2m_min: z.array(z.number().finite().nullable()).min(1),
    temperature_2m_max: z.array(z.number().finite().nullable()).min(1)
  }).optional()
});

export class OpenMeteoProvider implements WeatherProvider {
  async current(city: City, signal?: AbortSignal): Promise<Weather> {
    const coords = cities[city];

    if (!coords) {
      throw new Error('请选择有效城市');
    }

    const params = new URLSearchParams({
      latitude: String(coords[0]),
      longitude: String(coords[1]),
      current: 'temperature_2m,apparent_temperature,weather_code',
      daily: 'temperature_2m_min,temperature_2m_max',
      forecast_days: '1',
      timezone: 'Asia/Shanghai',
      timeformat: 'unixtime'
    });

    const deadline = AbortSignal.timeout(10000);

    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      {
        signal: signal
          ? AbortSignal.any([signal, deadline])
          : deadline
      }
    );

    if (!response.ok) {
      throw new Error('天气暂时不可用，请重试');
    }

    const parsed = responseSchema.parse(await response.json());

    const observedAt = parsed.current.time * 1000;
    const now = Date.now();

    if (
      observedAt < now - 3 * 60 * 60 * 1000 ||
      observedAt > now + 15 * 60 * 1000
    ) {
      throw new Error('天气观测时间异常，请重试');
    }

    const temperatureMin =
      parsed.daily?.temperature_2m_min[0];

    const temperatureMax =
      parsed.daily?.temperature_2m_max[0];

    if (temperatureMin == null || temperatureMax == null) {
      throw new Error('天气缺少当天温度范围，请重试');
    }

    const dataTime = new Date(observedAt).toISOString();

    return {
      city,
      temperature: parsed.current.temperature_2m,
      apparentTemperature: parsed.current.apparent_temperature,
      weatherCode: parsed.current.weather_code ?? null,
      dataTime,
      fetchedAt: new Date().toISOString(),
      example: false,
      source: 'open-meteo',
      temperatureMin,
      temperatureMax
    };
  }
}

export class ExampleWeatherProvider implements WeatherProvider {
  async current(city: City): Promise<Weather> {
    const now = new Date().toISOString();

    return {
      city,
      temperature: 22,
      apparentTemperature: 21,
      temperatureMin: 19,
      temperatureMax: 25,
      weatherCode: 2,
      dataTime: now,
      fetchedAt: now,
      example: true,
      source: 'example'
    };
  }
}

/**
 * 天气服务：
 * 按城市 + 北京时间日期缓存。
 *
 * 同一天同一城市复用天气。
 * 跨日自动获取新天气。
 * refresh=true 时绕过缓存。
 *
 * 同时兼容：
 * 1. WeatherProvider 的 AbortSignal 调用方式；
 * 2. WeatherPanel 的 { refresh, signal } 调用方式。
 */
export class WeatherService implements WeatherProvider {
  private cache = new Map<string, Weather>();

  constructor(
    private readonly provider: WeatherProvider,
    private readonly example: WeatherProvider = new ExampleWeatherProvider(),
    private readonly now: () => Date = () => new Date()
  ) {}

  async current(
    city: City,
    signal?: AbortSignal
  ): Promise<Weather>;

  async current(
    city: City,
    options?: WeatherRequestOptions
  ): Promise<Weather>;

  async current(
    city: City,
    signalOrOptions?: AbortSignal | WeatherRequestOptions
  ): Promise<Weather> {
    const options: WeatherRequestOptions =
      signalOrOptions && 'aborted' in signalOrOptions
        ? { signal: signalOrOptions as AbortSignal }
        : (signalOrOptions as WeatherRequestOptions | undefined) ?? {};

    const today = beijingDate(this.now());
    const cacheKey = `${city}:${today}`;

    const cached = this.cache.get(cacheKey);

    if (!options.refresh && cached) {
      return {
        ...cached,
        cached: true
      };
    }

    // 获取失败时直接抛错，不使用示例天气兜底。
    const weather = await this.provider.current(
      city,
      options.signal
    );

    if (weather.city !== city) {
      throw new Error('天气响应与所选城市不一致');
    }

    // 防止将昨天的天气误当作今天的天气。
    if (beijingDate(weather.dataTime) !== today) {
      throw new Error('天气数据日期与当前北京时间不一致，请重试');
    }

    // 只有成功取得有效数据后才写入缓存。
    this.cache.set(cacheKey, weather);

    return weather;
  }

  useExample(city: City) {
    return this.example.current(city);
  }
}
