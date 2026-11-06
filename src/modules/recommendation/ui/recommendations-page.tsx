'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createServices } from '@/composition';
import { useMode } from '@/composition/mode-provider';
import { WeatherPanel } from '@/modules/weather/ui/weather-panel';
import type { Weather } from '@/modules/weather';
import type { Style } from '@/modules/recommendation';
import type { OutfitRecord } from '@/modules/recommendation/service';
import type { FeedbackChoice } from '@/modules/feedback';
import { OutfitImage } from './outfit-image';
import { FeedbackControls } from './feedback-controls';

export function RecommendationsPage() {
  const { mode } = useMode();
  const services = useMemo(() => createServices(mode), [mode]);
  const [weather, setWeather] = useState<Weather>();
  const [style, setStyle] = useState<Style>('日常休闲');
  const [records, setRecords] = useState<OutfitRecord[]>([]);
  const [feedback, setFeedback] = useState<Record<string, FeedbackChoice>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const token = useRef(0);
  const generating = useRef(false);
  const recordsRef = useRef<OutfitRecord[]>([]);
  useEffect(() => { recordsRef.current = records; }, [records]);
  const loadImage = useCallback((id:string) => services.wardrobe.image(id), [services]);
  const loadFeedback = useCallback(async (items: OutfitRecord[]) => {
    const values = await Promise.all(items.map(item => services.recommendation.getFeedback(item.id)));
    setFeedback(Object.fromEntries(values.filter((v): v is NonNullable<typeof v> => !!v).map(value => [value.outfitId, value.choice])));
  }, [services]);
  useEffect(() => {
    let active = true; const initial = token.current;
    services.recommendation.restore().then(async items => {
      if (active && initial === token.current && items.length) { setRecords(items); setWeather(items[0].weather); setStyle(items[0].style); await loadFeedback(items); }
    }).catch(() => { if (active) setError('无法读取上次的推荐记录。'); });
    // 其他标签页变更衣橱后，读取真实版本，不能继续显示旧搭配。
    const check = () => { if (!recordsRef.current.length && !generating.current) return; void services.recommendation.restore().then(items => {
      if (active && !items.length) { token.current++; setBusy(false);
        if (recordsRef.current.length) setError('衣橱已改变，请重新生成穿搭。');
        setRecords([]); setFeedback({}); }
    }).catch(() => { if (active) setError('无法检查衣橱状态，请刷新重试。'); }); };
    const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(`wearwise-${mode}`);
    if (channel) channel.onmessage = check;
    window.addEventListener('focus',check);
    return () => { active = false; token.current++; channel?.close(); window.removeEventListener('focus',check); services.dispose(); };
  }, [services, loadFeedback, mode]);
  const invalidate = useCallback(() => {
    token.current++; setRecords([]); setFeedback({}); setError(''); setBusy(false);
    void services.recommendation.clearActive().catch(() => setError('无法更新推荐状态，请重试。'));
  }, [services]);
  const updateWeather = useCallback((next: Weather | undefined) => { invalidate(); setWeather(next); }, [invalidate]);
  const changeStyle = (next: Style) => { invalidate(); setStyle(next); };
  useEffect(() => {
    setClock(Date.now());
    if (!weather || weather.example) return;
    const expires = Math.min(Date.parse(weather.fetchedAt) + 300_001, Date.parse(weather.dataTime) + 3 * 60 * 60 * 1000 + 1);
    const delay = Math.max(0, expires - Date.now());
    const timer = window.setTimeout(() => setClock(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [weather]);
  const staleAt = (time: number) => !!weather && !weather.example && (time - Date.parse(weather.fetchedAt) > 300_000 || time - Date.parse(weather.dataTime) > 3 * 60 * 60 * 1000);
  const isStale = () => staleAt(Date.now());
  const stale = staleAt(clock);
  const generate = async () => {
    if (!weather || busy || generating.current) return;
    if (isStale()) { setClock(Date.now()); return; }
    generating.current = true; setBusy(true); setError(''); setRecords([]); const current = ++token.current;
    try {
      const result = await services.recommendation.generate(weather, style, crypto.randomUUID(), () => current === token.current);
      if (current === token.current) { setRecords(result.records); setError(result.message ?? ''); await loadFeedback(result.records); }
    } catch (e) { if (current === token.current) setError(e instanceof Error ? e.message : '生成失败，请重试。'); }
    finally { generating.current = false; if (current === token.current) setBusy(false); }
  };
  const rate = async (id: string, choice: FeedbackChoice) => {
    if (isStale()) { setClock(Date.now()); return; }
    const current = token.current;
    try {
      await services.recommendation.setFeedback(id, choice);
      if (current !== token.current) return;
      setFeedback(previous => ({...previous, [id]: choice}));
      setError(previous => previous === '反馈保存失败，请重试。' ? '' : previous);
    } catch { if (current === token.current) setError('反馈保存失败，请重试。'); }
  };
  return <>
    <div className="page-heading"><div><span className="section-kicker">OUTFITS FOR YOU</span><h1>穿搭推荐<span className="heading-dot">.</span></h1><p>从自己的衣橱中找到适合当下的搭配。</p></div></div>
    <div className="recommend-layout"><aside className="recommend-side"><div className="panel"><h2>天气参考</h2><WeatherPanel onChange={updateWeather} exampleOnly={mode === 'demo'} initialWeather={weather}/></div>
      <div className="panel"><h2>选择风格</h2><label>风格<select aria-label="选择风格" value={style} onChange={e => changeStyle(e.target.value as Style)}><option>日常休闲</option><option>简约通勤</option></select></label></div></aside>
      <div className="outfit-panel"><h2>为你推荐</h2><p>根据已确认且可用的衣物、天气和风格生成。</p>
        {weather?.example && <p>{mode === 'demo' ? '当前使用示例天气和示例衣橱。' : '当前使用示例天气，衣物来自你的真实衣橱。'}</p>}
        {stale && <p>上次推荐的天气已过期，仅供查看；请重新获取天气并生成。</p>}
        {!weather && <p>请先获取天气或主动选择示例天气。</p>}
        <button className="primary-link" disabled={!weather || stale || busy} onClick={() => void generate()}>{busy ? '正在生成…' : '生成穿搭'}</button>
        {error && <p role="alert">{error}</p>}
        {records.map((record, index) => <article className="panel" key={record.id}><h3>搭配 {index + 1}</h3><div className="outfit-items">{record.garmentSnapshots.map(item => <OutfitImage key={item.id} item={item} load={loadImage}/>)}</div><p>{record.reason}</p>
          {record.warnings.map(warning => <p key={warning}>{warning}</p>)}<FeedbackControls choice={feedback[record.id]} disabled={stale} onRate={choice => rate(record.id, choice)}/>
        </article>)}
      </div></div>
  </>;
}
