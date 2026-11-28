'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Shirt, Sparkles, RefreshCw } from 'lucide-react';
import { createServices } from '@/composition';
import { useMode } from '@/composition/mode-provider';
import { AIRecommendationClientError } from '@/modules/recommendation/ai-client';
import { WeatherPanel } from '@/modules/weather/ui/weather-panel';
import { useSharedWeather } from '@/modules/weather/ui/shared-weather';
import { OutfitFlatLay, OutfitGarmentList, OutfitImage } from '@/modules/recommendation/ui';
import type { GarmentSnapshot, OutfitResult } from '@/modules/session';

type Thumbnail = Pick<GarmentSnapshot, 'id' | 'name' | 'imageId'>;
type Action = { kind: 'generate' | 'swap-outfit' | 'swap-item'; target?: string };

export function HomePage() {
  const { mode } = useMode();
  const staticPages = process.env.NEXT_PUBLIC_RUNTIME_TARGET === 'pages';
  const sharedWeather = useSharedWeather();
  const services = useMemo(() => createServices(mode), [mode]);
  const [current, setCurrent] = useState<OutfitResult>();
  const [total, setTotal] = useState<number>(), [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [status, setStatus] = useState<{ deleted: GarmentSnapshot[]; paused: GarmentSnapshot[] }>();
  const [ready, setReady] = useState(false), [readError, setReadError] = useState(''), [error, setError] = useState('');
  const [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState<Action>(), [retry, setRetry] = useState<Action>();
  const alive = useRef(false), reads = useRef(0), operation = useRef<AbortController | undefined>(undefined);
  const loadImage = useCallback((id: string) => services.wardrobe.image(id), [services]);
  const refresh = useCallback(async () => {
    const seq = ++reads.current;
    try {
      const [home, counts, thumbs] = await Promise.all([services.session.readHome(), services.wardrobe.counts(), services.wardrobe.thumbnails(3)]);
      const state = home.current ? await services.session.resultStatus(home.current) : undefined;
      if (!alive.current || seq !== reads.current) return;
      setCurrent(home.current); setTotal(counts.total); setThumbnails(thumbs); setStatus(state); setReady(true); setReadError('');
    } catch { if (alive.current && seq === reads.current) setReadError('首页数据读取失败，请重试。'); }
  }, [services]);
  useEffect(() => {
    alive.current = true; void refresh();
    const read = () => { void refresh(); };
    const visibility = () => { if (document.visibilityState === 'visible') read(); };
    const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(`wearwise-${mode}`);
    if (channel) channel.onmessage = read;
    const timer = window.setInterval(read, 30000);
    window.addEventListener('focus', read); document.addEventListener('visibilitychange', visibility);
    return () => {
      alive.current = false; reads.current++; operation.current?.abort(); operation.current = undefined;
      channel?.close(); window.clearInterval(timer); window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', visibility); services.dispose();
    };
  }, [services, mode, refresh]);
  const run = async (action: Action) => {
    if (operation.current || !ready || !sharedWeather.ready || sharedWeather.savingCity) return;
    const controller = new AbortController(); operation.current = controller; setBusy(action); setError(''); setRequestId(''); setRetry(undefined);
    try {
      await sharedWeather.waitForCity(); controller.signal.throwIfAborted();
      const options = { signal: controller.signal };
      const result = action.kind === 'generate' ? await services.recommendationCore.generateHome(options)
        : action.kind === 'swap-outfit' ? await services.recommendationCore.swapHomeOutfit(options)
        : await services.recommendationCore.swapHomeItem(action.target!, options);
      if (!alive.current || operation.current !== controller || controller.signal.aborted) return;
      if (result.status !== 'committed') setError(result.message);
      else await refresh();
    } catch (error) {
      if (alive.current && operation.current === controller && !controller.signal.aborted) {
        setError(error instanceof Error ? error.message : '今日穿搭操作失败，请重试。');
        if (error instanceof AIRecommendationClientError && error.requestId) setRequestId(error.requestId);
        setRetry(action);
      }
    } finally {
      if (operation.current === controller) { operation.current = undefined; if (alive.current) setBusy(undefined); }
    }
  };
  const disabled = staticPages || !ready || !sharedWeather.ready || sharedWeather.savingCity || !!busy;
  return <>
    <section className="hero home-hero">
      <div className="hero-copy">
        <div className="eyebrow"><span/> YOUR PERSONAL WARDROBE</div>
        <p className="greeting">你好，欢迎来到 WearWise <span>✳</span></p>
        <h1>让穿搭变简单，<br/><em>让生活更从容。</em></h1>
        <p className="hero-description">为你的衣橱留一个舒适的空间。<br/>整理所爱，发现每一天的穿搭灵感。</p>
        <div className="hero-actions"><Link href="/wardrobe" className="primary-link">进入我的衣橱 <ArrowRight size={17}/></Link><Link href="/recommendations" className="text-link">探索穿搭 <ArrowUpRight size={16}/></Link></div>
      </div>
      <section className="home-today" aria-label="今日穿搭" aria-busy={!!busy}>
        <span className="section-kicker">TODAY'S LOOK</span><h2>今日穿搭</h2>
        <div className="home-basis-tags"><span>长期偏好</span><span>当天真实天气</span></div>
        {staticPages && <p>生成今日穿搭需要启动带模型配置的 WearWise 服务。</p>}
        {readError && <div role="alert">{readError} <button onClick={() => void refresh()}>重试读取</button></div>}
        {!ready && !readError && <p role="status">正在读取首页…</p>}
        {busy && <p role="status">{busy.kind === 'swap-item' ? '正在寻找替代衣物…' : '正在为你搭配…'}</p>}
        {error && <div role="alert" className="home-notice">{error}{requestId && <small>请求编号 {requestId}</small>}{retry && <button className="secondary-button" disabled={disabled} onClick={() => void run(retry)}>重试搭配</button>}</div>}
        {current ? <>
          <div className="home-outfit-layout">
            <OutfitFlatLay result={current} load={loadImage}/>
            <OutfitGarmentList result={current} load={loadImage} title="今日穿搭单品" disabled={disabled}
              onSwapItem={target => void run({ kind: 'swap-item', target })} swappingGarmentId={busy?.kind === 'swap-item' ? busy.target : undefined}/>
          </div>
          <p className="home-reason">{current.reason}</p><p className="home-basis">生成依据：{current.basis.label}</p>
          {!!status?.deleted.length && <p role="status">存在已删除衣物：{status.deleted.map(item => item.name).join('、')}。下次生成新一套搭配时不再使用。</p>}
          {!!status?.paused.length && <p role="status">存在已暂停搭配衣物：{status.paused.map(item => item.name).join('、')}。暂停期间不再作为新候选。</p>}
          <div className="home-today-actions"><button className="primary-link" disabled={disabled} onClick={() => void run({ kind: 'swap-outfit' })}><RefreshCw size={16}/>换一套</button><Link href="/recommendations" className="text-link">进入穿搭推荐 <ArrowRight size={16}/></Link></div>
        </> : ready && <div className="home-outfit-empty">
          <Shirt size={44} strokeWidth={1.2}/><h3>{total === 0 ? '你的衣橱还是空的' : '为今天搭配一套'}</h3>
          <p>{total === 0 ? '添加衣物后，为你生成今日穿搭' : '结合长期偏好和当前城市当天的天气，从你的衣橱中选择。'}</p>
          {total === 0 ? <Link href="/wardrobe" className="primary-link">添加衣物 <ArrowRight size={16}/></Link> : <button className="primary-link" disabled={disabled} onClick={() => void run({ kind: 'generate' })}>生成今日穿搭</button>}
          {total !== 0 && <Link href="/wardrobe" className="text-link">添加衣物</Link>}
        </div>}
      </section>
    </section>
    <section className="home-intro"><div><span className="section-kicker">YOUR EVERYDAY COMPANION</span><h2>从衣橱开始，<em>好好过每一天。</em></h2></div><p>整理衣物、查看天气，找到适合当下的穿搭。</p></section>
    <section className="feature-grid" aria-label="功能分区">
      <section className="feature-card home-wardrobe" aria-label="衣橱概况"><span className="card-number">01 / WARDROBE</span><h3>我的衣橱</h3><p>让每一件喜爱的衣物都有自己的位置。</p>
        <strong className="home-count">{total === undefined ? '正在读取衣橱…' : `${total} 件衣物`}</strong>
        <div className="home-thumbnails">{thumbnails.map(item => <OutfitImage key={item.id} item={item} load={loadImage}/>)}</div>
        {total === 0 && <p>你的衣橱还是空的</p>}<Link className="card-bottom" href="/wardrobe">{total === 0 ? '添加衣物' : '进入我的衣橱'} <ArrowRight size={15}/></Link>
      </section>
      <Link href="/recommendations" className="feature-card"><span className="icon-circle peach"><Sparkles size={21}/></span><span className="card-number">02 / OUTFITS</span><h3>穿搭推荐</h3><p>为每天的选择，留一点灵感和余地。</p><span className="card-bottom">探索穿搭 <ArrowRight size={15}/></span></Link>
      <WeatherPanel/>
    </section>
    <div className="closing-note"><Sparkles size={16}/>生活不必太复杂，穿搭也是。</div>
  </>;
}
