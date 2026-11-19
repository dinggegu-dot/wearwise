'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Shirt } from 'lucide-react';
import { createServices } from '@/composition';
import { useMode } from '@/composition/mode-provider';
import { availability, type Category, type Garment } from '@/modules/wardrobe';
import { beijingDate } from '@/shared/domain/beijing-date';
import { CATEGORY_LABELS, WARMTH_LABELS } from '../draft';
import { readTags } from '../tag-adapter';
import { Modal, SavedImage, TagSummary } from './wardrobe-fields';
import { BatchEditor, WardrobeEditor } from './wardrobe-editor';
import './wardrobe.css';

export function WardrobePage() {
  const { mode, setLocked } = useMode();
  const services = useMemo(() => createServices(mode), [mode]);
  const [items, setItems] = useState<Garment[]>([]), [category, setCategory] = useState<Category | 'all'>('all');
  const [editor, setEditor] = useState<{ item?: Garment }>(), [batch, setBatch] = useState(false);
  const [detail, setDetail] = useState<Garment>(), [pausing, setPausing] = useState<Garment>();
  const [resumeOn, setResumeOn] = useState(beijingDate(Date.now() + 86_400_000));
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true), [readFailed, setReadFailed] = useState(false);
  const [busy, setBusy] = useState(false); const mutation = useRef(false), reads = useRef(0), mounted = useRef(false);
  const loadImage = useCallback((id: string) => services.wardrobe.image(id), [services]);
  const refresh = useCallback(async () => {
    const seq = ++reads.current;
    try {
      const next = await services.wardrobe.list();
      if (!mounted.current || seq !== reads.current) return;
      setItems(next); setReadFailed(false); setError('');
      setDetail(current => current ? next.find(item => item.id === current.id) : undefined);
    } catch { if (mounted.current && seq === reads.current) { setReadFailed(true); setError('无法读取衣橱，请重试。'); } }
    finally { if (mounted.current && seq === reads.current) setLoading(false); }
  }, [services]);
  useEffect(() => {
    mounted.current = true;
    const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(`wearwise-${mode}`);
    const read = () => { void refresh(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') read(); };
    if (channel) channel.onmessage = read;
    window.addEventListener('focus', read); document.addEventListener('visibilitychange', onVisibility); void refresh();
    return () => { mounted.current = false; reads.current++; channel?.close(); window.removeEventListener('focus', read); document.removeEventListener('visibilitychange', onVisibility); services.dispose(); };
  }, [services, mode, refresh]);
  const written = async () => {
    if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel(`wearwise-${mode}`); channel.postMessage('wardrobeChanged'); channel.close(); }
    await refresh(); setNotice('衣物已保存。');
  };
  const change = async (operation: () => Promise<unknown>, success: string) => {
    if (mutation.current) return false; mutation.current = true; setBusy(true); setLocked(true); setError('');
    try { await operation(); await written(); setNotice(success); return true; }
    catch (error) { setError(error instanceof Error ? error.message : '操作失败，请重试。'); return false; }
    finally { mutation.current = false; setBusy(false); setLocked(false); }
  };
  const start = (item?: Garment) => { setDetail(undefined); setError(''); setNotice(''); setEditor({ item }); };
  const remove = async (item: Garment) => {
    if (!window.confirm(`确定删除“${item.name}”吗？旧搭配快照仍会保留。`)) return;
    if (await change(() => services.wardrobe.remove(item.id), '衣物已删除，旧搭配快照继续保留。')) setDetail(undefined);
  };
  const resume = (item: Garment) => void change(() => services.wardrobe.resume(item.id, item.revision), '已恢复推荐资格，不保证下一次一定选中。');
  const openPause = (item: Garment) => { setDetail(undefined); setError(''); setResumeOn(beijingDate(Date.now() + 86_400_000)); setPausing(item); };
  const counts = Object.fromEntries(Object.keys(CATEGORY_LABELS).map(key => [key, items.filter(item => item.category === key).length]));
  const statusText = (item: Garment) => availability(item) === 'paused' ? `暂停推荐，${item.pause?.resumeOn ?? '未设置日期'}${item.pause?.resumeOn ? ' 起恢复' : ''}` : '可用于穿搭推荐';
  const visible = items.filter(item => category === 'all' || item.category === category);
  const activeCategory = category === 'all' ? 'top' : category;
  return <div className="r5-wardrobe">
    <div className="page-heading"><div><span className="section-kicker">YOUR WARDROBE</span><h1>我的衣橱<span className="heading-dot">.</span></h1><p>为每一件喜欢的衣物，找到属于它的位置。</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => { setNotice(''); setBatch(true); }}>批量添加</button><button className="primary-link" onClick={() => start()}>＋ 添加衣物</button></div></div>
    <div className="wardrobe-filters" aria-label="衣物分类"><button aria-label="全部" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>全部 <span>{items.length}</span></button>{Object.entries(CATEGORY_LABELS).map(([key,label]) => <button aria-label={label} key={key} aria-pressed={category === key} onClick={() => setCategory(key as Category)}>{label} <span>{counts[key]}</span></button>)}</div>
    <p className="storage-note">衣物保存在当前浏览器，清理站点数据可能导致丢失。暂停的衣物仍计入数量。</p>
    {notice && <p className="wardrobe-notice" role="status">{notice}</p>}
    {error && !pausing && <div className="wardrobe-error" role="alert">{error} <button className="secondary-button" onClick={() => void refresh()}>重试</button></div>}
    {loading ? <p role="status">正在读取衣橱…</p> : readFailed ? null : visible.length === 0 ? <div className="empty-state"><div className="empty-hanger" aria-hidden="true"><Shirt size={60} strokeWidth={1.2}/></div><h2>你的衣橱，值得被好好整理</h2><p>{items.length ? '这个分类还没有衣物。' : '添加第一件衣物，开始整理你的衣橱。'}</p><button className="primary-link" onClick={() => start()}>添加衣物</button></div> : <div className="wardrobe-grid">{visible.map(item => {
      const paused = availability(item) === 'paused'; const tags = readTags(item);
      return <article className="wardrobe-item" key={item.id}>
        <div className="card-photo"><button type="button" aria-label={`查看${item.name}详情`} onClick={() => setDetail(item)}><SavedImage imageId={item.imageId} load={loadImage} alt={`${item.name}白底图`}/></button>{paused && <span className="pause-badge">暂时不推荐</span>}</div>
        <div className="wardrobe-item-content"><h2>{item.name}</h2><div className="card-tags"><span className="wardrobe-tag">{CATEGORY_LABELS[item.category]}</span><span className="wardrobe-tag">{item.color}</span>{tags.styleTags.slice(0,2).map(tag => <span className="wardrobe-tag" key={tag}>{tag}</span>)}</div><p className={`card-status ${paused ? 'paused' : ''}`}>{statusText(item)}</p>
        <div className="wardrobe-actions card-actions"><button onClick={() => setDetail(item)}>查看详情</button><button onClick={() => start(item)}>编辑</button>{paused ? <button disabled={busy} className="resume-button" onClick={() => resume(item)}>恢复推荐</button> : <button disabled={busy} onClick={() => openPause(item)}>暂时不推荐</button>}<button disabled={busy} onClick={() => void remove(item)}>删除</button></div></div>
      </article>;
    })}</div>}
    {editor && <WardrobeEditor key={editor.item?.id ?? 'new'} services={services} mode={mode} category={activeCategory} item={editor.item} onClose={() => setEditor(undefined)} onSaved={async savedCategory => { if (category !== 'all' && savedCategory) setCategory(savedCategory); await written(); }} setLocked={setLocked}/>}
    {batch && <BatchEditor services={services} mode={mode} category={activeCategory} onClose={() => setBatch(false)} onSaved={written} setLocked={setLocked}/>}
    {detail && <Modal title="衣物详情" onClose={() => setDetail(undefined)} busy={busy}>
      <SavedImage imageId={detail.imageId} load={loadImage} alt={`${detail.name}白底图`}/><h3 className="detail-name">{detail.name}</h3>
      <div className="card-tags">{[CATEGORY_LABELS[detail.category], detail.color, detail.fit, WARMTH_LABELS[detail.warmth]].map((value,index) => <span className="wardrobe-tag" key={index}>{value}</span>)}</div>
      <TagSummary value={detail}/><dl className="detail-attributes"><div><dt>材质</dt><dd>{detail.material || '不确定'}</dd></div><div><dt>描述</dt><dd>{detail.description || '暂无描述'}</dd></div><div><dt>状态</dt><dd>{statusText(detail)}</dd></div><div><dt>添加日期</dt><dd>{beijingDate(detail.createdAt)}</dd></div></dl>
      <div className="wardrobe-actions"><button className="r5-primary" onClick={() => start(detail)}>编辑衣物</button>{availability(detail) === 'paused' ? <button disabled={busy} onClick={() => resume(detail)}>恢复推荐</button> : <button disabled={busy} onClick={() => openPause(detail)}>暂时不推荐</button>}<button disabled={busy} onClick={() => void remove(detail)}>删除</button></div>
    </Modal>}
    {pausing && <Modal title="暂时不推荐" onClose={() => setPausing(undefined)} busy={busy}>
      <div className="pause-preview"><SavedImage imageId={pausing.imageId} load={loadImage}/><h3>{pausing.name}</h3></div>
      <form onSubmit={event => { event.preventDefault(); void change(() => services.wardrobe.pause(pausing.id, resumeOn, pausing.revision), '暂停已保存，衣物仍保留在衣橱。').then(ok => { if (ok) setPausing(undefined); }); }}>
        <label>恢复日期<input type="date" required min={beijingDate(Date.now() + 86_400_000)} value={resumeOn} onChange={event => setResumeOn(event.target.value)}/></label><p className="muted">到期日北京时间00:00起恢复推荐资格，也可提前点击“恢复推荐”。暂停期间不参与新搭配。</p>
        {error && <p className="inline-error" role="alert">{error}</p>}<div className="wardrobe-actions"><button type="button" disabled={busy} onClick={() => setPausing(undefined)}>取消</button><button type="submit" className="r5-primary" disabled={busy}>确认暂停</button></div>
      </form>
    </Modal>}
  </div>;
}
