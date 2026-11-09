'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cities, type City, type Weather } from '@/modules/weather';
import { createWeatherService } from '@/composition';
import { useMode } from '@/composition/mode-provider';
import { describeWeatherCode } from '@/modules/weather/domain/weather-code';

export function WeatherPanel({ onChange, exampleOnly, initialWeather }: { onChange?: (weather: Weather | undefined) => void; exampleOnly?: boolean; initialWeather?: Weather }) {
  const { mode } = useMode();
  const demo = exampleOnly ?? mode === 'demo';
  const service = useMemo(() => createWeatherService(mode), [mode]);
  const [city, setCity] = useState<City>('深圳');
  const [weather, setWeather] = useState<Weather>();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ sequence: number; abort?: AbortController }>({ sequence: 0 });
  useEffect(() => { setReady(true); return () => { request.current.sequence++; request.current.abort?.abort(); }; }, []);
  useEffect(() => { if (initialWeather) { setCity(initialWeather.city); setWeather(initialWeather); setError(''); } }, [initialWeather]);
  const changeCity = (next: City) => { request.current.sequence++; request.current.abort?.abort(); setCity(next); setWeather(undefined); onChange?.(undefined); setError(''); setLoading(false); };
  const load = async (example = false, refresh = false) => {
    request.current.abort?.abort(); const sequence = ++request.current.sequence;
    const abort = new AbortController(); request.current.abort = abort;
    setLoading(true); setError(''); setWeather(undefined); onChange?.(undefined);
    try {
      const result = example ? await service.useExample(city) : await service.current(city, {refresh, signal: abort.signal});
      if (sequence === request.current.sequence) { setWeather(result); onChange?.(result); }
    } catch { if (sequence === request.current.sequence) setError('天气暂时不可用，请重试或选择示例天气。'); }
    finally { if (sequence === request.current.sequence) setLoading(false); }
  };
  return <div className="feature-card weather-card"><span className="card-number">03 / WEATHER</span><h3>今日天气</h3>
    <label>选择城市 <select aria-label="选择城市" value={city} onChange={event => changeCity(event.target.value as City)}>{Object.keys(cities).map(item => <option key={item}>{item}</option>)}</select></label>
    {loading && <p role="status">正在获取天气…</p>}
    {error && <p role="alert">{error}</p>}
    {weather && <div><p>{weather.example ? '示例天气 · ' : weather.cached ? '缓存天气 · ' : ''}{weather.city} {describeWeatherCode(weather.weatherCode)}</p><p>{weather.temperature}°C · 体感 {weather.apparentTemperature}°C</p><small>数据时间：{new Date(weather.dataTime).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'})}</small></div>}
    <div className="wardrobe-actions">{!demo && <button disabled={!ready || loading} onClick={() => void load(false, true)}>{weather || error ? '重新获取' : '查看天气'}</button>}<button disabled={!ready || loading} onClick={() => void load(true)}>使用示例天气</button></div>
    <small>天气来源：<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a></small>
  </div>;
}
