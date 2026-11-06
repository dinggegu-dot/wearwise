'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createServices, illustration } from '@/composition';
import { useMode } from '@/composition/mode-provider';
import type { Garment, GarmentInput } from '@/modules/wardrobe';
import { prepareImage, type PreparedImage } from '@/modules/media/browser-image-processor';

const labels = { top: '上衣', bottom: '下装', outerwear: '外套', dress: '连衣裙', shoes: '鞋履' } as const;
const warmths = { light: '轻薄', medium: '适中', warm: '保暖', unknown: '未知' } as const;
type Draft = Omit<GarmentInput, 'sourceType'>;
const blank: Draft = { name: '', category: 'top', color: '', warmth: 'unknown', styleTags: [] };

function GarmentImage({ id, image, load, alt = '' }: { id: string; image: string; load: (id: string) => Promise<Blob | undefined>; alt?: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true; let current: string | undefined;
    setUrl(undefined);
    load(image).then(blob => { if (blob && active) { current = URL.createObjectURL(blob); setUrl(current); } }).catch(() => {});
    return () => { active = false; if (current) URL.revokeObjectURL(current); };
  }, [id, image, load]);
  return url ? <img src={url} alt={alt} className="wardrobe-image" /> : <div className="wardrobe-image wardrobe-placeholder">暂无图片</div>;
}

export function WardrobePage() {
  const { mode, setLocked } = useMode();
  const services = useMemo(() => createServices(mode), [mode]);
  const [items, setItems] = useState<Garment[]>([]);
  const [category, setCategory] = useState<keyof typeof labels | 'all'>('all');
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<Garment | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [recognitionWarnings, setRecognitionWarnings] = useState<string[]>([]);
  const recognitionAbort = useRef<AbortController | null>(null);
  const [photo, setPhoto] = useState<PreparedImage>();
  const [preview, setPreview] = useState<string>();
  const photoSequence = useRef(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const requestId = useRef('');
  const dialog = useRef<HTMLDialogElement>(null);
  const loadImage = useMemo(() => (id: string) => services.wardrobe.image(id), [services]);
  const notify = () => { if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel(`wearwise-${mode}`); channel.postMessage('wardrobeChanged'); channel.close(); } };
  const refresh = async () => { setLoading(true); try { setItems(await services.wardrobe.list()); setReadFailed(false); setError(''); } catch { setReadFailed(true); setError('无法读取衣橱，请重试。'); } finally { setLoading(false); } };
  useEffect(() => {
    const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(`wearwise-${mode}`);
    const onFocus = () => { void refresh(); };
    if (channel) channel.onmessage = onFocus; window.addEventListener('focus',onFocus); void refresh();
    return () => { channel?.close(); window.removeEventListener('focus',onFocus); services.dispose(); };
  }, [services,mode]);
  // 切换模式或离开页面时取消在途识别，并丢弃旧图片处理结果。
  useEffect(() => () => { photoSequence.current++; recognitionAbort.current?.abort(); }, []);
  useEffect(() => { if (open && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [open]);
  useEffect(() => { if (!photo) { setPreview(undefined); return; } const url = URL.createObjectURL(photo.blob); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  const start = (item?: Garment) => {
    photoSequence.current++; recognitionAbort.current?.abort(); setRecognizing(false); setRecognitionWarnings([]); setPhoto(undefined); setPreparing(false);
    setEditing(item ?? null); requestId.current = crypto.randomUUID();
    setDraft(item ? { name: item.name, category: item.category, color: item.color, warmth: item.warmth, styleTags: item.styleTags, material: item.material } : { ...blank, category: category === 'all' ? blank.category : category });
    setError(''); setNotice(''); setOpen(true);
  };
  const close = () => { if (!busy) { photoSequence.current++; recognitionAbort.current?.abort(); setRecognizing(false); setRecognitionWarnings([]); setPhoto(undefined); setPreparing(false); dialog.current?.close(); setOpen(false); } };
  const choosePhoto = async (file?: File) => {
    const sequence = ++photoSequence.current; recognitionAbort.current?.abort(); setRecognizing(false); setRecognitionWarnings([]); setPhoto(undefined); setError('');
    if (!file) { setPreparing(false); return; }
    setPreparing(true);
    try { const result = await prepareImage(file); if (sequence === photoSequence.current) setPhoto(result); }
    catch (e) { if (sequence === photoSequence.current) setError(e instanceof Error ? e.message : '图片处理失败。'); }
    finally { if (sequence === photoSequence.current) setPreparing(false); }
  };
  const recognize = async () => {
    if (!photo || recognizing || mode === 'demo') return;
    if (process.env.NEXT_PUBLIC_RUNTIME_TARGET === 'pages') { setError('静态版暂不支持图片识别，请手动填写。'); return; }
    const sequence = photoSequence.current; const abort = new AbortController(); recognitionAbort.current = abort;
    setRecognizing(true); setError('');
    try {
      const candidate = await services.recognition.recognize(photo.blob, abort.signal);
      if (sequence !== photoSequence.current) return;
      setRecognitionWarnings(candidate.warnings);
      setDraft({ name:candidate.name, category:candidate.category, color:candidate.color, warmth:candidate.warmth, material:candidate.material, styleTags:candidate.styleTags });
    } catch (e) { if (!abort.signal.aborted && sequence === photoSequence.current) setError(e instanceof Error ? e.message : '图片识别失败，请手动填写。'); }
    finally { if (sequence === photoSequence.current) setRecognizing(false); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || preparing) return; setBusy(true); setLocked(true); setError('');
    try {
      const cleaned = { ...draft, styleTags: [...new Set(draft.styleTags.map(tag => tag.trim()).filter(Boolean))] };
      if (editing) await services.wardrobe.update(editing.id, cleaned, editing.revision, photo ? { id: crypto.randomUUID(), blob: photo.blob } : undefined);
      else await services.wardrobe.add({ ...cleaned, sourceType: mode === 'demo' ? 'demo' : photo ? 'photo' : 'manual' }, photo?.blob ?? illustration(draft.category, draft.color), requestId.current);
      // Keep a successfully saved garment visible when its category changed.
      if (category !== 'all' && category !== cleaned.category) setCategory(cleaned.category);
      dialog.current?.close(); setOpen(false); notify(); await refresh(); setNotice(editing ? '衣物修改已保存。' : '衣物已保存。');
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试。'); }
    finally { setBusy(false); setLocked(false); }
  };
  const remove = async (item: Garment) => {
    if (!window.confirm(`确定删除“${item.name}”吗？`)) return;
    try { await services.wardrobe.remove(item.id); notify(); await refresh(); } catch { setError('删除失败，请重试。'); }
  };
  const toggle = async (item: Garment) => {
    try { await services.wardrobe.update(item.id, { excludedPermanently: !item.excludedPermanently }, item.revision); notify(); await refresh(); }
    catch { setError('更新失败，衣物可能已被修改，请刷新重试。'); }
  };
  const visible = items.filter(item => item.status === 'confirmed' && (category === 'all' || item.category === category));
  return <>
    <div className="page-heading"><div><span className="section-kicker">YOUR WARDROBE</span><h1>我的衣橱<span className="heading-dot">.</span></h1><p>为每一件喜欢的衣物，找到属于它的位置。</p></div><button className="primary-link" onClick={() => start()}>＋ 添加衣物</button></div>
    <p>衣物保存在当前浏览器，清理站点数据可能导致丢失。</p>
    {notice && <p role="status">{notice}</p>}
    {error && !open && <div role="alert" className="wardrobe-error">{error} <button onClick={() => void refresh()}>重试</button></div>}
    <div className="wardrobe-filters" aria-label="衣物分类"><button aria-pressed={category === 'all'} onClick={() => setCategory('all')}>全部</button>{Object.entries(labels).map(([key, value]) => <button key={key} aria-pressed={category === key} onClick={() => setCategory(key as keyof typeof labels)}>{value}</button>)}</div>
    {loading ? <p>正在读取衣橱…</p> : readFailed ? null : visible.length === 0 ? <div className="empty-state"><h2>你的衣橱，值得被好好整理</h2><p>{items.length ? '这个分类还没有衣物。' : '添加第一件衣物，开始整理你的衣橱。'}</p><button className="primary-link" onClick={() => start()}>添加衣物</button></div> : <div className="wardrobe-grid">{visible.map(item => <article className="wardrobe-item" key={item.id}>
      <GarmentImage id={item.id} image={item.imageId} load={loadImage}/><div className="wardrobe-item-content"><h2>{item.name}</h2><p>{labels[item.category]} · {item.color} · {warmths[item.warmth]}</p><p>{item.excludedPermanently ? '已排除穿搭推荐' : '可用于穿搭推荐'}</p><details><summary>查看详情</summary><p>风格：{item.styleTags.length ? item.styleTags.join('、') : '未设置'}</p><p>材质：{item.material || '未设置'}</p><p>添加时间：{new Date(item.createdAt).toLocaleDateString('zh-CN')}</p></details><div className="wardrobe-actions"><button onClick={() => start(item)}>编辑</button><button onClick={() => void toggle(item)}>{item.excludedPermanently ? '恢复推荐' : '排除推荐'}</button><button onClick={() => void remove(item)}>删除</button></div></div>
    </article>)}</div>}
    {open && <dialog ref={dialog} className="wardrobe-dialog" style={{ margin: 'auto' }} aria-labelledby="wardrobe-dialog-title" onCancel={event => {
      // File inputs bubble cancel when their picker is cancelled or the same file is chosen.
      // Only a cancel targeted at this dialog should close the garment editor.
      if (event.target !== event.currentTarget) return;
      event.preventDefault(); close();
    }}><form onSubmit={save} aria-describedby={error ? 'wardrobe-form-error' : undefined}>
      <h2 id="wardrobe-dialog-title">{editing ? '编辑衣物' : '添加衣物'}</h2><label>名称<input required maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label>
      <label>类别<select size={5} value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value as Draft['category'] })}>{Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <label>颜色<input required maxLength={50} value={draft.color} onChange={event => setDraft({ ...draft, color: event.target.value })}/></label>
      <label>保暖程度<select value={draft.warmth} onChange={event => setDraft({ ...draft, warmth: event.target.value as Draft['warmth'] })}>{Object.entries(warmths).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
      <label>材质（可选）<input maxLength={100} value={draft.material ?? ''} onChange={event => setDraft({ ...draft, material: event.target.value })}/></label>
      <label>衣物照片（可选）<input type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="wardrobe-photo-hint" onChange={event => void choosePhoto(event.target.files?.[0])}/></label>
      <small id="wardrobe-photo-hint">（如果选错照片，可以点击文件名，重新上传正确照片；取消选择会保留当前照片。）</small>
      {editing && !photo && !preparing && <div key={`${editing.id}:${editing.imageId}`}>
        <p>当前已保存的照片</p>
        <GarmentImage id={editing.id} image={editing.imageId} load={loadImage} alt="已保存的衣物照片"/>
      </div>}
      {preparing && <p>正在处理图片…</p>}{preview && <img src={preview} alt="照片预览" className="wardrobe-image"/>}{recognitionWarnings.map(warning => <p key={warning}>{warning}</p>)}{photo && mode === 'real' && <div><p>识别时照片将发送至配置的模型服务，请确认后主动使用。</p><button type="button" disabled={recognizing || busy} onClick={() => void recognize()}>{recognizing ? '识别中…' : 'AI 识别衣物'}</button></div>}
      <label>风格标签（用逗号分隔）<input value={draft.styleTags.join(',')} onChange={event => setDraft({ ...draft, styleTags: event.target.value.split(',') })}/></label>
      {error && <p id="wardrobe-form-error" role="alert">{error}</p>}<div className="wardrobe-actions"><button type="button" disabled={busy} onClick={close}>取消</button><button type="submit" disabled={busy || preparing || recognizing}>{busy ? '保存中…' : '确认保存'}</button></div>
    </form></dialog>}
  </>;
}
