'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createServices, type Mode } from '@/composition';
import type { City, Weather } from '@/modules/weather';
import { beijingDate } from '@/shared/domain/beijing-date';

type SharedWeather = {
  city: City; weather?: Weather; loading: boolean; ready: boolean; savingCity: boolean; error: string;
  changeCity(city: City): Promise<void>; refresh(): Promise<void>; waitForCity(): Promise<void>;
};
const Context = createContext<SharedWeather | null>(null);
export function useSharedWeather() {
  const value = useContext(Context);
  if (!value) throw new Error('共享天气尚未初始化');
  return value;
}

/** Shared display state lives above routes; saved outfit weather remains a separate snapshot. */
export function SharedWeatherProvider({ mode, children }: { mode: Mode; children: React.ReactNode }) {
  const services = useMemo(() => createServices(mode), [mode]);
  const [city, setCity] = useState<City>('深圳'), [weather, setWeather] = useState<Weather>();
  const [loading, setLoading] = useState(false), [ready, setReady] = useState(false);
  const [savingCity, setSavingCity] = useState(false), [error, setError] = useState('');
  const cityRef = useRef<City>('深圳'), date = useRef(beijingDate());
  const mounted = useRef(false), request = useRef(0), cityVersion = useRef(0);
  const abort = useRef<AbortController | undefined>(undefined), queue = useRef<Promise<void>>(Promise.resolve());
  const load = useCallback(async (next: City, refresh = false) => {
    const seq = ++request.current; abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    setLoading(true); setError(''); setWeather(undefined);
    try {
      const result = await services.weather.current(next, { refresh, signal: controller.signal });
      if (mounted.current && seq === request.current) setWeather(result);
    } catch { if (mounted.current && seq === request.current) setError('暂时无法获取天气，请重试或切换城市。'); }
    finally { if (mounted.current && seq === request.current) setLoading(false); }
  }, [services]);
  useEffect(() => {
    mounted.current = true; let active = true;
    const initialize = async () => {
      try {
        const saved = await services.session.getCity(); if (!active) return;
        const initial = saved ?? '深圳'; if (!saved) await services.session.setCity(initial); if (!active) return;
        cityRef.current = initial; date.current = beijingDate(); setCity(initial); setReady(true); await load(initial);
      } catch { if (active) setError('城市读取失败，请重试。'); }
    };
    void initialize();
    const synchronize = async () => {
      try {
        await queue.current; const saved = await services.session.getCity(); if (!active) return;
        const today = beijingDate();
        if ((saved && saved !== cityRef.current) || today !== date.current) {
          cityRef.current = saved ?? cityRef.current; date.current = today; setCity(cityRef.current); await load(cityRef.current);
        }
      } catch { if (active) setError('城市同步失败，请重试。'); }
    };
    const focus = () => { void synchronize(); };
    const visibility = () => { if (document.visibilityState === 'visible') focus(); };
    const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(`wearwise-weather-${mode}`);
    if (channel) channel.onmessage = focus;
    const timer = window.setInterval(focus, 30000);
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility);
    return () => {
      active = false; mounted.current = false; request.current++; abort.current?.abort(); channel?.close();
      window.clearInterval(timer); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); services.dispose();
    };
  }, [services, mode, load]);
  const changeCity = useCallback((next: City) => {
    const seq = ++cityVersion.current; request.current++; abort.current?.abort();
    cityRef.current = next; setCity(next); setWeather(undefined); setLoading(false); setSavingCity(true); setError('');
    const save = queue.current.catch(() => undefined).then(() => services.session.setCity(next)); queue.current = save;
    return save.then(async () => {
      if (!mounted.current || seq !== cityVersion.current) return;
      setSavingCity(false); setReady(true); date.current = beijingDate();
      if (typeof BroadcastChannel !== 'undefined') { const c = new BroadcastChannel(`wearwise-weather-${mode}`); c.postMessage('cityChanged'); c.close(); }
      await load(next);
    }).catch(error => {
      if (mounted.current && seq === cityVersion.current) { setSavingCity(false); setError('城市保存失败，请重新选择城市后重试。'); }
      throw error;
    });
  }, [services, mode, load]);
  const refresh = useCallback(async () => {
    try { await services.session.setCity(cityRef.current); queue.current = Promise.resolve(); setReady(true); date.current = beijingDate(); await load(cityRef.current, true); }
    catch { if (mounted.current) setError('城市保存失败，请重试。'); }
  }, [services, load]);
  return <Context.Provider value={{ city, weather, loading, ready, savingCity, error, changeCity, refresh, waitForCity: () => queue.current }}>{children}</Context.Provider>;
}
