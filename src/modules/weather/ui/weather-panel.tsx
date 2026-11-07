'use client';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  const [editing, setEditing] = useState(false);
  const [manualTemperature, setManualTemperature] = useState('');
  const [manualApparentTemperature, setManualApparentTemperature] = useState('');
  const [manualWeatherCode, setManualWeatherCode] = useState('');
  const request = useRef<{ sequence: number; abort?: AbortController }>({ sequence: 0 });
  const autoLoadStarted = useRef(false);

  useEffect(() => {
    setReady(true);
    return () => { request.current.sequence++; request.current.abort?.abort(); };
  }, []);

  useEffect(() => {
    if (!initialWeather) return;
    request.current.sequence++;
    request.current.abort?.abort();
    setCity(initialWeather.city);
    setWeather(initialWeather);
    setError('');
    setLoading(false);
    setEditing(false);
  }, [initialWeather]);

  const load = async (example = false, refresh = false, targetCity: City = city) => {
    request.current.abort?.abort();
    const sequence = ++request.current.sequence;
    const abort = new AbortController();
    request.current.abort = abort;
    setLoading(true);
    setError('');
    setWeather(undefined);
    setEditing(false);
    onChange?.(undefined);
    try {
      const result = example ? await service.useExample(targetCity) : await service.current(targetCity, { refresh, signal: abort.signal });
      if (sequence === request.current.sequence) {
        setWeather(result);
        onChange?.(result);
      }
    } catch {
      if (sequence === request.current.sequence) setError('天气暂时不可用，请重试或手动调整天气。');
    } finally {
      if (sequence === request.current.sequence) setLoading(false);
    }
  };

    useEffect(() => {
    if (!ready || autoLoadStarted.current) return;

    if (initialWeather) {
      autoLoadStarted.current = true;
      return;
    }

    autoLoadStarted.current = true;
    void load(demo);
    // 首次自动获取只执行一次，避免后续状态变化重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, initialWeather, demo, service]);

  const changeCity = (next: City) => {
    setCity(next);
    setWeather(undefined);
    setEditing(false);
    void load(demo, false, next);
  };

  const beginManualEdit = () => {
    setManualTemperature(weather ? String(weather.temperature) : '');
    setManualApparentTemperature(weather ? String(weather.apparentTemperature) : '');
    setManualWeatherCode(weather?.weatherCode == null ? '' : String(weather.weatherCode));
    setEditing(true);
  };

  const saveManualWeather = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const temperature = Number(manualTemperature);
    const apparentTemperature = manualApparentTemperature.trim() === '' ? temperature : Number(manualApparentTemperature);
    if (!manualTemperature.trim() || !Number.isFinite(temperature) || !Number.isFinite(apparentTemperature) || temperature < -50 || temperature > 60 || apparentTemperature < -60 || apparentTemperature > 70) {
      setError('请输入有效温度：气温范围 -50 至 60°C，体感温度范围 -60 至 70°C。');
      return;
    }
    const now = new Date().toISOString();
    const next: Weather = {
      city,
      temperature,
      apparentTemperature,
      weatherCode: manualWeatherCode === '' ? weather?.weatherCode ?? null : Number(manualWeatherCode),
      dataTime: now,
      fetchedAt: now,
      example: false,
      source: 'manual',
      cached: false
    };
    setWeather(next);
    setError('');
    setEditing(false);
    onChange?.(next);
  };

  return <div className="feature-card weather-card">
    <span className="card-number">03 / WEATHER</span>
    <h3>今日天气</h3>
    <label>选择城市 <select aria-label="选择城市" value={city} onChange={event => changeCity(event.target.value as City)}>{Object.keys(cities).map(item => <option key={item}>{item}</option>)}</select></label>
    {loading && <p role="status">正在获取天气…</p>}
    {error && <p role="alert">{error}</p>}
    {weather && <div>
      <p>{weather.source === 'manual' ? '手动调整 · ' : weather.example ? '示例天气 · ' : weather.cached ? '缓存天气 · ' : ''}{weather.city} {describeWeatherCode(weather.weatherCode)}</p>
      <p>{weather.temperature}°C · 体感 {weather.apparentTemperature}°C</p>
      <small>数据时间：{new Date(weather.dataTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</small>
    </div>}
    {editing && <form className="mt-4 grid gap-3 rounded-lg bg-[#f9f9f4] p-4" onSubmit={saveManualWeather}>
      <label className="grid gap-1 text-xs text-[#71806e]">气温（°C）
        <input className="w-full rounded-md border border-[#d7dfd2] bg-white p-2 text-sm" type="number" step="0.1" min="-50" max="60" required value={manualTemperature} onChange={event => setManualTemperature(event.target.value)} placeholder="例如：12" />
      </label>
      <label className="grid gap-1 text-xs text-[#71806e]">体感温度（°C，可选）
        <input className="w-full rounded-md border border-[#d7dfd2] bg-white p-2 text-sm" type="number" step="0.1" min="-60" max="70" value={manualApparentTemperature} onChange={event => setManualApparentTemperature(event.target.value)} placeholder="留空则与气温相同" />
      </label>
      <label className="grid gap-1 text-xs text-[#71806e]">天气状况（可选）
        <select className="w-full rounded-md border border-[#d7dfd2] bg-white p-2 text-sm" value={manualWeatherCode} onChange={event => setManualWeatherCode(event.target.value)}>
          <option value="">保持当前状况 / 未知</option>
          <option value="0">晴朗</option><option value="1">晴间多云</option><option value="2">多云</option><option value="3">阴天</option>
          <option value="45">雾</option><option value="61">小雨</option><option value="63">中雨</option><option value="65">大雨</option>
          <option value="71">小雪</option><option value="73">中雪</option><option value="75">大雪</option><option value="95">雷雨</option>
        </select>
      </label>
      <div className="wardrobe-actions">
        <button type="submit">保存天气</button>
        <button type="button" onClick={() => setEditing(false)}>取消</button>
      </div>
      <small>手动天气从保存时起保留 12 小时；之后需要重新获取或调整。</small>
    </form>}
    <div className="wardrobe-actions">
      {!demo && <button disabled={!ready || loading} onClick={() => void load(false, true)}>{weather || error ? '重新获取' : '获取天气'}</button>}
      <button disabled={!ready || loading} onClick={() => void load(true)}>使用示例天气</button>
      <button disabled={loading} onClick={beginManualEdit}>手动调整天气</button>
    </div>
    <small>天气来源：<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a></small>
  </div>;
}
