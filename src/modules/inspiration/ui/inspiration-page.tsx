'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { createServices } from '@/composition';
import { useMode } from '@/composition/mode-provider';
import type { Inspiration } from '@/modules/inspiration';
import { summarizeInspirations } from '@/modules/inspiration/summaries';

const kinds = { color: '配色', style: '风格', fit: '版型', layering: '层次', scene: '场景' } as const;
type Kind = keyof typeof kinds;
type Status = 'idle' | 'analyzing' | 'saving';

function Card({ item, image, view, edit, remove }: { item: Inspiration; image: (id: string) => Promise<Blob | undefined>; view: () => void; edit: () => void; remove: () => void }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let active = true, url = '';
    void image(item.imageId).then(blob => { if (active && blob) { url = URL.createObjectURL(blob); setSrc(url); } }).catch(() => {});
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [image, item.imageId]);
  return <article className="inspiration-card">
    {src ? <img src={src} alt={item.name} className="inspiration-card-image" /> : <div className="inspiration-card-image">图片暂不可用</div>}
    <div className="inspiration-card-content">
      <h2>{item.name}</h2>
      <div className="inspiration-card-tags">{item.tags.slice(0, 3).map((tag, index) => <span key={`${tag.text}-${index}`}>{tag.text}</span>)}{item.tags.length > 3 && <span>另有 {item.tags.length - 3} 项</span>}</div>
      <div className="inspiration-card-analysis"><span>AI分析</span><p className="inspiration-summary">{item.analysis}</p></div>
      <div className="inspiration-actions inspiration-card-actions"><button className="inspiration-view-button" onClick={view}>查看</button><button onClick={edit}>编辑</button><button onClick={remove}>删除</button></div>
    </div>
  </article>;
}

export function InspirationPage() {
  const { mode } = useMode();
  const services = useMemo(() => createServices(mode), [mode]);
  const image = useCallback((id: string) => services.inspiration.image(id), [services]);
  const [items, setItems] = useState<Inspiration[]>([]);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState('');
  const [name, setName] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [tags, setTags] = useState<Inspiration['tags']>([]);
  const [newTag, setNewTag] = useState('');
  const [newKind, setNewKind] = useState<Kind | ''>('');
  const [editing, setEditing] = useState<Inspiration>();
  const [imageChanged, setImageChanged] = useState(false);
  const [viewing, setViewing] = useState<Inspiration>();
  const [viewImage, setViewImage] = useState('');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [analyzed, setAnalyzed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const sequence = useRef(0), controller = useRef<AbortController | null>(null), requestId = useRef(''), saving = useRef(false), active = useRef(false);
  const refresh = useCallback(async () => { const list = await services.inspiration.list(); if (active.current) setItems(list); return list; }, [services]);
  const reconcile = useCallback(async () => { await services.preferences.reconcileInspirationSummaries(summarizeInspirations(await services.inspiration.list())); if (active.current) setSummaryError(''); }, [services]);
  useEffect(() => { active.current = true; void refresh().then(reconcile).catch(() => { if (active.current) setSummaryError('灵感归纳暂未更新，请重试。'); }); return () => { active.current = false; sequence.current++; controller.current?.abort(); services.dispose(); }; }, [refresh, reconcile, services]);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  useEffect(() => { if (!viewing) { setViewImage(''); return; } let activeView = true, url = ''; void image(viewing.imageId).then(blob => { if (activeView && blob) { url = URL.createObjectURL(blob); setViewImage(url); } }).catch(() => {}); return () => { activeView = false; if (url) URL.revokeObjectURL(url); }; }, [image, viewing]);
  const close = () => { sequence.current++; controller.current?.abort(); controller.current = null; setOpen(false); setViewing(undefined); setEditing(undefined); setFile(undefined); setName(''); setAnalysis(''); setTags([]); setNewTag(''); setNewKind(''); setStatus('idle'); setAnalyzed(false); setFailed(false); setError(''); };
  const choose = (next?: File, replacing = false) => { sequence.current++; controller.current?.abort(); controller.current = null; if (!next) return; if (!replacing) { requestId.current = crypto.randomUUID(); setEditing(undefined); } setImageChanged(replacing); setFile(next); setOpen(true); setViewing(undefined); setName(''); setAnalysis(''); setTags([]); setNewTag(''); setNewKind(''); setStatus('idle'); setAnalyzed(false); setFailed(false); setError(''); void analyze(next); };
  const analyze = async (candidate = file) => {
    if (!candidate) return;
    const current = ++sequence.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort; setStatus('analyzing'); setAnalyzed(false); setFailed(false); setError('');
    try { const form = new FormData(); form.set('image', candidate); const response = await fetch('/api/inspiration/analyze', { method: 'POST', body: form, signal: abort.signal }); const body = await response.json(); if (!response.ok || body.ok !== true) throw new Error(body.error?.message || 'AI分析失败。'); if (current !== sequence.current || abort.signal.aborted || !active.current) return; setName(body.data.name); setAnalysis(body.data.analysis); setTags(body.data.tags); setAnalyzed(true); }
    catch (cause) { if (current === sequence.current && !abort.signal.aborted && active.current) { setFailed(true); setError(cause instanceof Error ? cause.message : 'AI分析失败。'); } }
    finally { if (current === sequence.current && active.current) setStatus('idle'); }
  };
  const save = async () => {
    if (!file || !analyzed || status !== 'idle' || saving.current || !name.trim() || !analysis.trim()) return;
    saving.current = true; setStatus('saving'); setError('');
    try { if (editing) await services.inspiration.update(editing.id, { name, tags, analysis }, editing.revision, imageChanged ? file : undefined); else await services.inspiration.create({ name, tags, analysis }, file, requestId.current ||= crypto.randomUUID()); }
    catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : '保存失败，请重试。'); saving.current = false; if (active.current) setStatus('idle'); return; }
    try { close(); await refresh(); } catch { if (active.current) setError('灵感已保存，但列表刷新失败。请刷新页面。'); }
    try { await reconcile(); } catch { if (active.current) setSummaryError('灵感已保存，但归纳失败。请重试归纳。'); }
    saving.current = false; if (active.current) setStatus('idle');
  };
  const edit = async (item: Inspiration) => { const current = ++sequence.current; controller.current?.abort(); try { const blob = await services.inspiration.image(item.imageId); if (!blob) throw new Error('灵感图片不可用，请刷新后重试。'); if (current !== sequence.current || !active.current) return; setViewing(undefined); setEditing(item); setImageChanged(false); setFile(new File([blob], 'inspiration.jpg', { type: blob.type || 'image/jpeg' })); setName(item.name); setTags(item.tags); setAnalysis(item.analysis); setAnalyzed(true); setFailed(false); setOpen(true); } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : '读取灵感失败。'); } };
  const remove = async (item: Inspiration) => { if (!window.confirm(`删除“${item.name}”？相关自动归纳将重新核对。`)) return; try { await services.inspiration.remove(item.id); } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : '删除失败。'); return; } setViewing(undefined); try { await refresh(); } catch { if (active.current) setError('灵感已删除，但列表刷新失败。请刷新页面。'); } try { await reconcile(); } catch { if (active.current) setSummaryError('灵感已删除，但归纳未完全更新。请重试归纳。'); } };
  const addTag = () => { const text = newTag.trim(); if (!text || tags.length >= 30) return; setTags(current => [...current, { text, ...(newKind ? { kind: newKind } : {}) }]); setNewTag(''); setNewKind(''); };
  return <>
    <div className="page-heading inspiration-page-heading"><div><span className="section-kicker">STYLE INSPIRATION</span><h1>穿搭灵感<span className="heading-dot">.</span></h1><p>收藏喜欢的穿搭，记录自己的灵感。</p></div><label className="primary-link">＋ 上传灵感<input hidden disabled={status === 'saving'} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }} /></label></div>
    {error && !open && <p role="alert" className="wardrobe-error">{error}</p>}
    {summaryError && <p role="alert" className="wardrobe-error">{summaryError} <button onClick={() => void reconcile().catch(() => setSummaryError('灵感归纳暂未更新，请重试。'))}>重试归纳</button></p>}
    {items.length === 0 && <div className="empty-state"><h2>还没有保存的穿搭灵感</h2><p>上传照片，检查 AI 分析后留作长期参考。</p></div>}
    <div className="inspiration-grid">{items.map(item => <Card key={item.id} item={item} image={image} view={() => setViewing(item)} edit={() => void edit(item)} remove={() => void remove(item)} />)}</div>
    <p className="inspiration-page-note">保存后作为长期参考；图片保留至你主动删除。<br />图中服饰不会自动加入衣橱。</p>
    {open && <div className="inspiration-backdrop"><section className="inspiration-dialog" role="dialog" aria-modal="true" aria-label={editing ? '编辑灵感' : '上传灵感'}>
      <div className="inspiration-dialog-heading"><h2>{editing ? '编辑穿搭灵感' : '添加穿搭灵感'}</h2><button className="inspiration-close-button" aria-label="关闭" disabled={status === 'saving'} onClick={close}><X size={24} /></button></div>
      <div className="inspiration-editor">
        <div className="inspiration-image-column">{preview ? <img src={preview} alt="灵感预览" className="inspiration-preview" /> : <div className="inspiration-preview">正在读取图片…</div>}<label className="inspiration-change-image"><ImageIcon size={18} /> 更换图片<input disabled={status === 'saving'} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { choose(event.target.files?.[0], true); event.target.value = ''; }} /></label></div>
        <div className="inspiration-fields">
          {status === 'analyzing' && <div className="inspiration-analysis-state" role="status"><LoaderCircle className="inspiration-spin" size={34} /><div><h3>AI分析中</h3><p>正在识别配色、风格与搭配特点</p></div></div>}
          {failed && <div className="inspiration-analysis-state inspiration-failed-state" role="alert"><TriangleAlert size={36} /><div><h3>AI分析失败</h3><p><span className="inspiration-visually-hidden">AI分析失败。</span>图片已保留，请重试或更换图片。{error}</p></div></div>}
          {status === 'analyzing' && <div className="inspiration-skeleton" aria-hidden="true"><span>灵感名称</span><div /><span>标签</span><div className="inspiration-skeleton-tags"><i /><i /><i /></div><span>AI分析</span><div className="inspiration-skeleton-analysis"><i /><i /><i /></div></div>}
          {failed && <div className="inspiration-retry-actions"><button disabled={status !== 'idle'} onClick={() => void analyze()}>重新分析/重试</button></div>}
          {status !== 'analyzing' && !failed && <>
            {error && <p role="alert">{error}</p>}
            <label>名称<input maxLength={100} disabled={status !== 'idle' || !analyzed} value={name} onChange={event => setName(event.target.value)} /></label>
            <div className="inspiration-tags-heading">标签</div>
            <div aria-label="灵感标签" className="inspiration-tag-list">{tags.map((tag, index) => <div key={`${tag.text}-${index}`}><span>{kinds[tag.kind as Kind] || '自定义'} · {tag.text}</span><button aria-label={`删除标签 ${index + 1}`} disabled={status !== 'idle'} onClick={() => setTags(current => current.filter((_, position) => position !== index))}><X size={14} /></button></div>)}</div>
            <div className="inspiration-add-tag"><label>新增标签<input maxLength={30} disabled={status !== 'idle' || !analyzed} value={newTag} onChange={event => setNewTag(event.target.value)} /></label><label>标签类型<select disabled={status !== 'idle' || !analyzed} value={newKind} onChange={event => setNewKind(event.target.value as Kind | '')}><option value="">自定义</option>{Object.entries(kinds).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label><button disabled={status !== 'idle' || !analyzed || !newTag.trim() || tags.length >= 30} onClick={addTag}>＋ 添加标签</button></div>
            <label>分析<textarea maxLength={2000} disabled={status !== 'idle' || !analyzed} value={analysis} onChange={event => setAnalysis(event.target.value)} /></label>
            <p className="inspiration-edit-hint">可直接修改 AI 分析，保存后以你确认的内容为准。</p>
            <button className="inspiration-reanalyze-button" disabled={status !== 'idle'} onClick={() => void analyze()}>重新分析/重试</button>
          </>}
        </div>
      </div>
      <div className="inspiration-dialog-footer"><p>{failed ? '分析完成后才可确认保存。' : '灵感图片长期保留，图中服饰不会自动加入衣橱。'}</p><div><button disabled={status === 'saving'} onClick={close}>取消</button><button className="inspiration-save-button" disabled={status !== 'idle' || !analyzed || !name.trim() || !analysis.trim()} onClick={() => void save()}>{editing ? '保存修改' : '确认保存'}</button></div></div>
    </section></div>}
    {viewing && <div className="inspiration-backdrop"><section className="inspiration-dialog" role="dialog" aria-modal="true" aria-label="查看灵感"><div className="inspiration-dialog-heading"><h2>{viewing.name}</h2><button onClick={() => setViewing(undefined)}>关闭</button></div>{viewImage && <img src={viewImage} alt={viewing.name} className="inspiration-preview" />}<p>{viewing.tags.map(tag => `${kinds[tag.kind as Kind] || '自定义'}：${tag.text}`).join(' · ')}</p><p>{viewing.analysis}</p><div className="inspiration-actions"><button onClick={() => void edit(viewing)}>编辑</button><button onClick={() => void remove(viewing)}>删除</button></div></section></div>}
  </>;
}
