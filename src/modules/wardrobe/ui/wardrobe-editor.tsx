import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { createServices, Mode } from '@/composition';
import { illustration } from '@/composition';
import type { Category, Garment } from '..';
import { prepareImage } from '@/modules/media/browser-image-processor';
import { removeBackgroundOnline } from '@/modules/media/openrouter-background-client';
import { blankDraft, checkedDraft, draftFromGarment, type WardrobeDraft } from '../draft';
import { UploadTasks } from '../upload-tasks';
import { BlobImage, Modal, SavedImage, TagSummary, WardrobeFields, type EditDraft } from './wardrobe-fields';
import { UploadPanel } from './upload-panel';

type Services = ReturnType<typeof createServices>;
type EditorProps = { services: Services; mode: Mode; category: Category; item?: Garment; onClose: () => void; onSaved: (category?: Category) => Promise<void>; setLocked: (value: boolean) => void };
function useQueue(services: Services, mode: Mode, item?: Garment) {
  const online = mode === 'real' && process.env.NEXT_PUBLIC_RUNTIME_TARGET !== 'pages';
  const [queue] = useState(() => new UploadTasks({
    requireTarget: online,
    prepare: (file, signal, validated, crop) =>
      prepareImage(file, signal, validated, online ? removeBackgroundOnline : undefined, crop),
    recognize: online ? (blob, signal) => services.recognition.recognize(blob, signal) : undefined,
    save: (draft, white, requestId) => item
      ? services.wardrobe.update(item.id, draft, item.revision, { id: requestId, blob: white })
      : services.wardrobe.add({ ...draft, sourceType: mode === 'demo' ? 'demo' : 'photo' }, white, requestId),
  }));
  useEffect(() => { queue.activate(); return () => queue.dispose(); }, [queue]);
  const tasks = useSyncExternalStore(queue.subscribe, queue.snapshot, queue.snapshot);
  return { queue, tasks };
}
const hint = '支持 JPG、PNG、WebP，每张不超过 10 MB；原图仅用于本次处理，保存后保留白底图与确认信息。';
export function WardrobeEditor({ services, mode, category, item, onClose, onSaved, setLocked }: EditorProps) {
  const { queue, tasks } = useQueue(services, mode, item);
  const task = tasks[0];
  const photoInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<WardrobeDraft>(() => item ? draftFromGarment(item) : blankDraft(category));
  const touched = useRef(new Set<keyof WardrobeDraft>());
  const [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [error, setError] = useState(''); const requestId = useRef(crypto.randomUUID());
  const loadImage = useRef((id: string) => services.wardrobe.image(id)).current;
  useEffect(() => { setLocked(busy); return () => setLocked(false); }, [busy, setLocked]);
  const current = task?.draft ?? draft;
  const edit: EditDraft = (key, value) => {
    touched.current.add(key);
    if (task) queue.edit(task.id, key, value); else setDraft(prev => ({ ...prev, [key]: value }));
    setError('');
  };
  const choose = (file?: File) => {
    if (!file) return;
    setError('');
    try {
      if (task) queue.replace(task.id, file);
      else { const id = queue.add([file], category)[0]; queue.seed(id, current, touched.current); }
    } catch (error) { setError(error instanceof Error ? error.message : '无法选择图片。'); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setLocked(true); setError('');
    try {
      if (task) { if (await queue.saveSelected([task.id]) === 0) return; }
      else {
        const value = checkedDraft(current);
        if (item) await services.wardrobe.update(item.id, value, item.revision);
        else await services.wardrobe.add({ ...value, sourceType: mode === 'demo' ? 'demo' : 'manual' }, illustration(value.category, value.color), requestId.current);
      }
      await onSaved(current.category); onClose();
    } catch (error) { setError(`保存失败，已保留填写内容。${error instanceof Error ? error.message : '请重试。'}`); }
    finally { busyRef.current = false; setBusy(false); setLocked(false); }
  };
  return <Modal title={item ? '编辑衣物' : '添加衣物'} onClose={onClose} busy={busy} wide>
    <form className="garment-editor" onSubmit={save} aria-describedby={error || task?.saveError ? 'wardrobe-form-error' : undefined}>
      <div className="editor-photo-side">
        {task && <UploadPanel task={task} queue={queue} disabled={busy}/>}
        {!task && item && <><SavedImage imageId={item.imageId} load={loadImage} alt="已保存的衣物照片"/><p className="muted">原始照片未保存；如需重新处理白底图，请重新选择照片。</p></>}
        <button type="button" className={task || item ? 'photo-picker' : 'photo-empty'} disabled={busy}
          onClick={() => photoInput.current?.click()}>
          {task || item ? '更换图片' : <><span aria-hidden="true">＋</span><b>选择衣物照片（可选）</b></>}
        </button>
        <input ref={photoInput} hidden aria-label="衣物照片（可选）" type="file" disabled={busy} accept="image/jpeg,image/png,image/webp"
          onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }}/>
        <p className="muted upload-hint">{hint}</p>
        {mode === 'real' && process.env.NEXT_PUBLIC_RUNTIME_TARGET !== 'pages' && <p className="muted upload-hint">上传照片会通过 OpenRouter 进行云端白底与识别，通常每张涉及两次付费请求。</p>}
        {task && item && <button type="button" className="secondary-button" disabled={busy} onClick={() => { setDraft(task.draft); queue.remove(task.id); }}>放弃新图片，保留原有白底图</button>}
      </div>
      <WardrobeFields draft={current} edit={edit} disabled={busy}/>
      <div className="editor-footer">
        {(error || task?.saveError) && <p id="wardrobe-form-error" className="inline-error" role="alert">{error || task?.saveError}</p>}
        <p className="muted">请检查图片及全部资料后确认保存。</p><div className="wardrobe-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="r5-primary" type="submit" disabled={busy || (!!task && task.status !== 'ready')}>{busy ? '保存中…' : '确认保存'}</button></div>
      </div>
    </form>
  </Modal>;
}
const statusLabels = { 'awaiting-target': '待确认目标衣物', queued: '等待处理', processing: '处理中', ready: '处理成功', failed: '处理失败', saving: '保存中', saved: '已加入衣橱' };
export function BatchEditor({ services, mode, category, onClose, onSaved, setLocked }: Omit<EditorProps, 'item'>) {
  const { queue, tasks } = useQueue(services, mode);
  const [active, setActive] = useState<string>(), [viewOnly, setViewOnly] = useState(false);
  const [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [error, setError] = useState('');
  const selected = tasks.filter(task => task.status === 'ready' && task.selected).length;
  const saved = tasks.filter(task => task.status === 'saved').length;
  const current = tasks.find(task => task.id === active);
  const waiting = tasks.filter(task => task.status === 'awaiting-target');
  useEffect(() => { setLocked(busy); return () => setLocked(false); }, [busy, setLocked]);
  const save = async () => {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setLocked(true);
    try { if (await queue.saveSelected() > 0) await onSaved(); }
    catch { setError('衣物已保存，但列表刷新失败，请关闭后重新读取。'); }
    finally { busyRef.current = false; setBusy(false); setLocked(false); }
  };
  return <Modal title="批量添加衣物" onClose={onClose} busy={busy} wide>
    <p className="muted">每张图片对应一件衣物 · 每批最多12件 · 逐项处理与确认</p>
    <label className="photo-picker">选择多张照片<input type="file" multiple disabled={busy} accept="image/jpeg,image/png,image/webp" onChange={event => {
      const files = Array.from(event.target.files ?? []); event.target.value = ''; if (!files.length) return;
      try { queue.add(files, category); setError(''); } catch (error) { setError(error instanceof Error ? error.message : '无法选择图片。'); }
    }}/></label>
    <p className="muted upload-hint">{hint}{mode === 'real' && process.env.NEXT_PUBLIC_RUNTIME_TARGET !== 'pages' ? ' 每张会进行云端白底与识别，可能产生费用；请逐件核对后保存。' : ' 当前使用本机白底与手动确认资料。'}</p>
    {error && <p role="alert" className="inline-error">{error}</p>}
    {!tasks.length && <div className="batch-empty">选择照片，开始整理这一批衣物。</div>}
    {waiting.length > 1 && <button type="button" className="secondary-button" disabled={busy} onClick={() => {
      for (const task of waiting) queue.confirmTarget(task.id);
    }}>待处理原图均为单件，开始处理</button>}
    <div className="batch-list">{tasks.map(task => <article className="batch-row" key={task.id} data-task-id={task.id}>
      <BlobImage blob={task.white?.blob ?? task.file} alt={`${task.draft.name || task.filename}预览`}/>
      <div className="batch-info"><h3>{task.draft.name || task.filename}</h3><p className={task.status === 'failed' ? 'inline-error' : 'success-text'} role="status">{statusLabels[task.status]}</p>
        {task.status === 'processing' && <small>{task.preparing ? '白底处理中' : '正在识别资料'}…</small>}
        {task.imageError && <p className="inline-error">{task.imageError}</p>}{task.recognitionError && <p className="inline-error">{task.recognitionError}</p>}{task.saveError && <p className="inline-error" role="alert">{task.saveError}</p>}
      </div>
      <div className="batch-row-actions">
        {task.status === 'awaiting-target' && <button type="button" disabled={busy} onClick={() => { setActive(task.id); setViewOnly(false); }}>确认目标</button>}
        {['ready','failed'].includes(task.status) && <><button type="button" disabled={busy} onClick={() => { setActive(task.id); setViewOnly(true); }}>查看结果</button><button type="button" disabled={busy} onClick={() => { setActive(task.id); setViewOnly(false); }}>编辑</button></>}
        {task.status === 'failed' && <button type="button" disabled={busy} onClick={() => queue.retry(task.id)}>重试</button>}
        {task.status !== 'saved' && <button type="button" disabled={busy} onClick={() => { queue.remove(task.id); if (active === task.id) setActive(undefined); }}>移除</button>}
        <input type="checkbox" aria-label={`选择${task.draft.name || task.filename}`} disabled={busy || task.status !== 'ready'} checked={task.selected} onChange={event => queue.select(task.id, event.target.checked)}/>
      </div>
    </article>)}</div>
    {current && current.status !== 'saved' && <section className="batch-inspector" aria-label="单项检查"><div className="dialog-heading"><h3>检查这件衣物</h3><button type="button" aria-label="关闭单项检查" onClick={() => setActive(undefined)}>×</button></div>
      <UploadPanel task={current} queue={queue} disabled={busy}/>
      <label className="photo-picker">更换这件衣物的图片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { try { queue.replace(current.id,event.target.files?.[0]); setError(''); } catch (error) { setError(error instanceof Error ? error.message : '无法选择图片。'); } event.target.value = ''; }}/></label>
      {viewOnly ? <><h3>{current.draft.name || '名称未填写'}</h3><TagSummary value={current.draft}/><p>{current.draft.description || '暂无描述'}</p><button type="button" onClick={() => setViewOnly(false)}>编辑这件衣物</button></> : <WardrobeFields draft={current.draft} edit={(key,value) => queue.edit(current.id, key, value)} disabled={busy}/>}
      <button type="button" className="secondary-button" onClick={() => setActive(undefined)}>完成检查</button>
    </section>}
    <footer className="batch-footer"><p role="status">已选{selected}件{saved > 0 ? ` · 已保存${saved}件，其余项目继续保留` : ''}</p><div className="wardrobe-actions"><button type="button" disabled={busy} onClick={onClose}>{saved ? '完成' : '取消'}</button><button type="button" className="r5-primary" disabled={busy || !selected} onClick={() => void save()}>{busy ? '保存中…' : '保存所选衣物'}</button></div></footer>
  </Modal>;
}
