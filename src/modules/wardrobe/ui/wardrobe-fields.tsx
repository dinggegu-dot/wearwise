import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CATEGORY_LABELS, WARMTH_LABELS, type WardrobeDraft } from '../draft';
import { OTHER_TAG, SCENE_TAGS, STYLE_TAGS, readTags, type WardrobeTags } from '../tag-adapter';

export function BlobImage({ blob, alt, className = 'wardrobe-image' }: { blob?: Blob; alt: string; className?: string }) {
  const [url, setUrl] = useState<string>(); const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false); if (!blob) { setUrl(undefined); return; }
    const next = URL.createObjectURL(blob); setUrl(next); return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url && !failed ? <img src={url} alt={alt} className={className} onError={() => setFailed(true)}/> : <div className={`${className} wardrobe-placeholder`}>{failed ? '图片加载失败' : '等待图片'}</div>;
}
export function SavedImage({ imageId, load, alt = '衣物白底图' }: { imageId: string; load: (id: string) => Promise<Blob | undefined>; alt?: string }) {
  const [blob, setBlob] = useState<Blob>(); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; setBlob(undefined); setFailed(false);
    load(imageId).then(value => { if (active) { setBlob(value); setFailed(!value); } }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [imageId, load]);
  return failed ? <div className="wardrobe-image wardrobe-placeholder">图片暂不可用</div> : <BlobImage blob={blob} alt={alt}/>;
}
export function TagSummary({ value }: { value: Partial<WardrobeTags> }) {
  const normalized = readTags(value);
  return <div className="tag-summary">{(['style','scene'] as const).map(kind => <div key={kind}><b>{kind === 'style' ? '风格' : '场景'}：</b>{normalized[`${kind}Tags`].length ? normalized[`${kind}Tags`].map(tag => <span className="wardrobe-tag" key={tag}>{tag}{tag === OTHER_TAG ? `：${normalized[`${kind}Other`].join('、')}` : ''}</span>) : <span className="muted">不确定／未选择</span>}</div>)}</div>;
}
function TagChoices({ kind, draft, edit }: { kind: 'style' | 'scene'; draft: WardrobeDraft; edit: EditDraft }) {
  const prefix = useId(), key = `${kind}Tags` as const, otherKey = `${kind}Other` as const;
  const label = kind === 'style' ? '风格' : '场景';
  const toggle = (tag: string) => {
    const next = draft[key].includes(tag) ? draft[key].filter(t => t !== tag) : [...draft[key], tag];
    edit(key, next); if (!next.includes(OTHER_TAG)) edit(otherKey, []);
  };
  return <fieldset className="tag-choices"><legend>{label}标签 <small>可多选</small></legend><div className="tag-options">{[...(kind === 'style' ? STYLE_TAGS : SCENE_TAGS), OTHER_TAG].map(tag => <label className="tag-option" key={tag}><input type="checkbox" checked={draft[key].includes(tag)} onChange={() => toggle(tag)}/><span>{tag}</span></label>)}</div>
    {draft[key].includes(OTHER_TAG) && <label htmlFor={`${prefix}-other`}>{label}其他说明（每行一条）<textarea id={`${prefix}-other`} rows={2} value={draft[otherKey].join('\n')} onChange={event => edit(otherKey, event.target.value.split('\n'))} placeholder="保留原始识别词或补充说明，每条最多30字"/></label>}
    <small className="muted">不确定时可不选；“其他”须填写说明，不会创建公共标签。</small></fieldset>;
}
export type EditDraft = <K extends keyof WardrobeDraft>(key: K, value: WardrobeDraft[K]) => void;
export function WardrobeFields({ draft, edit, disabled = false }: { draft: WardrobeDraft; edit: EditDraft; disabled?: boolean }) {
  return <fieldset className="wardrobe-fields" disabled={disabled}>
    <div className="fields-grid"><label className="full-field">名称<input data-initial-focus required maxLength={100} value={draft.name} onChange={event => edit('name', event.target.value)}/></label>
    <label>类别<select value={draft.category} onChange={event => edit('category', event.target.value as WardrobeDraft['category'])}>{Object.entries(CATEGORY_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>颜色<input required maxLength={50} value={draft.color} onChange={event => edit('color', event.target.value)}/></label>
    <label>版型<input maxLength={50} value={draft.fit ?? ''} onChange={event => edit('fit', event.target.value)}/></label>
    <label>厚薄<select aria-label="厚薄（保暖程度）" value={draft.warmth} onChange={event => edit('warmth', event.target.value as WardrobeDraft['warmth'])}>{Object.entries(WARMTH_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label className="full-field">材质（可选）<input maxLength={100} value={draft.material ?? ''} onChange={event => edit('material', event.target.value)}/></label></div>
    <TagChoices kind="style" draft={draft} edit={edit}/><TagChoices kind="scene" draft={draft} edit={edit}/>
    <label>描述<textarea rows={3} maxLength={1000} value={draft.description ?? ''} onChange={event => edit('description', event.target.value)}/></label>
  </fieldset>;
}
export function Modal({ title, children, onClose, busy = false, wide = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    if (element && !element.open) { element.showModal(); element.querySelector<HTMLElement>('[data-initial-focus]')?.focus(); }
    return () => { if (element?.open) element.close(); if (returnFocus?.isConnected) returnFocus.focus(); };
  }, []);
  return <dialog ref={dialog} className={`wardrobe-dialog r5-dialog ${wide ? 'wide-dialog' : ''}`} aria-labelledby={id} onCancel={event => { if (event.target !== event.currentTarget) return; event.preventDefault(); if (!busy) onClose(); }}>
    <header className="dialog-heading"><h2 id={id}>{title}</h2><button type="button" aria-label="关闭弹窗" disabled={busy} onClick={onClose}>×</button></header>{children}
  </dialog>;
}
