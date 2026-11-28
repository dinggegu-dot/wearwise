'use client';
import { useEffect } from 'react';
import { cities, type City, type Weather } from '@/modules/weather';
import { describeWeatherCode } from '@/modules/weather/domain/weather-code';
import { useSharedWeather } from './shared-weather';

export function WeatherPanel({ onChange }: { onChange?: (weather: Weather | undefined) => void }) {
  const { city, weather, ready, loading, savingCity, error, changeCity, refresh } = useSharedWeather();
  useEffect(() => { onChange?.(weather); }, [weather, onChange]);
  return <section className="feature-card weather-card" aria-label="今日天气">
    <span className="card-number">03 / WEATHER</span><h3>今日天气</h3>
    <label>切换城市 <select aria-label="选择城市" value={city} disabled={!ready && !error}
      onChange={event => { void changeCity(event.target.value as City).catch(() => undefined); }}>
      {Object.keys(cities).map(item => <option key={item}>{item}</option>)}
    </select></label>
    {(loading || savingCity) && <p role="status">{savingCity ? '正在保存城市…' : '正在获取天气…'}</p>}
    {error && <p role="alert">{error}</p>}
    {weather && <div className="home-weather-values">
      <p>{weather.example ? '示例天气 · ' : ''}{weather.city} {describeWeatherCode(weather.weatherCode)}</p>
      <strong>当前气温：{weather.temperature}°C</strong>
      <p>体感温度：{weather.apparentTemperature}°C</p>
      <p>当天温度范围：{weather.temperatureMin ?? '--'}°C ~ {weather.temperatureMax ?? '--'}°C</p>
    </div>}
    <button className="secondary-button" disabled={loading || savingCity} onClick={() => void refresh()}>
      {error ? '重试' : weather?.example ? '使用示例天气' : '刷新天气'}
    </button>
    <small>天气来源：{weather?.example ? '示例数据' : <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>}</small>
  </section>;
}
