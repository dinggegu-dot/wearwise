'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Heart, Layers, PenLine, Plus, Sparkles, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import { createServices } from '@/composition';
import { useMode } from '@/composition/mode-provider';
import type { Preference, PreferenceGroup } from '@/modules/preferences';
import type { GarmentSnapshot } from '@/modules/session/schema';

type Choice = 'like' | 'dislike';
/** 弹窗状态：新增明确偏好、编辑任一条目、查看永久反馈。 */
type Dialog =
  | { kind: 'add'; requestId: string }
  | { kind: 'edit'; item: Preference }
  | { kind: 'view'; item: Preference };

const badges: Record<PreferenceGroup, string> = { explicit: '你主动设置', inspiration: '根据穿搭灵感归纳', feedback: '来自搭配反馈' };
const choiceText: Record<Choice, string> = { like: '喜欢', dislike: '不喜欢' };
const MAX_CONTENT = 500;

/** 永久反馈保存的是当时那套搭配的快照图，不随当前推荐或衣橱变化。 */
function OutfitThumbnails({ snapshots, image, large = false }: { snapshots: GarmentSnapshot[]; image: (id: string) => Promise<Blob | undefined>; large?: boolean }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true; const created: string[] = [];
    void Promise.all(snapshots.map(async s => {
      try { const blob = await image(s.imageId); if (!blob) return [s.id, ''] as const; const url = URL.createObjectURL(blob); created.push(url); return [s.id, url] as const; }
      catch { return [s.id, ''] as const; }
    })).then(entries => { if (active) setUrls(Object.fromEntries(entries)); });
    return () => { active = false; for (const url of created) URL.revokeObjectURL(url); };
  }, [image, snapshots]);
  return <div className={large ? 'prefs-outfit prefs-outfit-large' : 'prefs-outfit'} aria-label="当时被评价的搭配">
    {snapshots.map(s => <figure key={s.id}>{urls[s.id] ? <img src={urls[s.id]} alt={s.name} /> : <span className="prefs-outfit-missing">图片不可用</span>}{large && <figcaption>{s.name}</figcaption>}</figure>)}
  </div>;
}

function Row({ item, icon, onEdit, onRemove, busy }: { item: Preference; icon: React.ReactNode; onEdit: () => void; onRemove: () => void; busy: boolean }) {
  return <li className="prefs-row">
    <span className="prefs-row-icon" aria-hidden="true">{icon}</span>
    <p className="prefs-row-content">{item.content}</p>
    <span className="prefs-badge">{badges[item.group]}</span>
    <div className="prefs-row-actions">
      <button disabled={busy} onClick={onEdit}><PenLine size={16} /> 编辑</button>
      <button disabled={busy} onClick={onRemove}><Trash2 size={16} /> 删除</button>
    </div>
  </li>;
}

export function PreferencesPage() {
  const { mode } = useMode();
  const services = useMemo(() => createServices(mode), [mode]);
  const image = useCallback((id: string) => services.wardrobe.image(id), [services]);
  const [items, setItems] = useState<Preference[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pageError, setPageError] = useState('');
  const [dialog, setDialog] = useState<Dialog>();
  const [content, setContent] = useState('');
  const [choice, setChoice] = useState<Choice>('dislike');
  const [dialogError, setDialogError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState('');
  const active = useRef(false), busy = useRef(false);

  const refresh = useCallback(async () => {
    const list = await services.preferences.listActive();
    if (active.current) { setItems(list); setLoaded(true); }
  }, [services]);
  useEffect(() => {
    active.current = true;
    void refresh().catch(() => { if (active.current) { setLoaded(true); setPageError('偏好读取失败，请刷新页面重试。'); } });
    return () => { active.current = false; services.dispose(); };
  }, [refresh, services]);

  const groups = useMemo(() => ({
    explicit: items.filter(p => p.group === 'explicit'),
    inspiration: items.filter(p => p.group === 'inspiration'),
    feedback: items.filter(p => p.group === 'feedback')
  }), [items]);

  const close = () => { if (busy.current) return; setDialog(undefined); setContent(''); setDialogError(''); };
  const openAdd = () => { setPageError(''); setDialogError(''); setContent(''); setDialog({ kind: 'add', requestId: crypto.randomUUID() }); };
  const openEdit = (item: Preference) => { setPageError(''); setDialogError(''); setContent(item.content); setChoice(item.feedback?.choice ?? 'dislike'); setDialog({ kind: 'edit', item }); };

  const save = async () => {
    if (!dialog || dialog.kind === 'view' || busy.current) return;
    const text = content.trim();
    const isFeedback = dialog.kind === 'edit' && dialog.item.group === 'feedback';
    if (!isFeedback && !text) { setDialogError('请填写偏好内容。'); return; }
    busy.current = true; setSaving(true); setDialogError('');
    try {
      if (dialog.kind === 'add') await services.preferences.addExplicit(text, dialog.requestId);
      else await services.preferences.edit(dialog.item.id, isFeedback ? { content: text, choice } : { content: text }, dialog.item.revision);
    } catch (cause) {
      // 保存失败：保留弹窗和填写内容，页面上的原条目不变。
      busy.current = false; if (active.current) { setSaving(false); setDialogError(cause instanceof Error ? cause.message : '保存失败，请重试。'); }
      // 例如别处已修改：让背后的列表显示最新内容，弹窗里的填写保留给用户自行处理。
      void refresh().catch(() => {});
      return;
    }
    busy.current = false;
    if (!active.current) return;
    setSaving(false); setDialog(undefined); setContent('');
    try { await refresh(); } catch { if (active.current) setPageError('已保存，但列表刷新失败，请刷新页面。'); }
  };

  const remove = async (item: Preference) => {
    if (busy.current) return;
    const label = item.group === 'feedback' ? '这条永久反馈' : `“${item.content}”`;
    if (!window.confirm(`删除${label}？删除后不再作为长期推荐依据。`)) return;
    busy.current = true; setRemoving(item.id); setPageError('');
    try { await services.preferences.remove(item.id); }
    catch (cause) { if (active.current) setPageError(cause instanceof Error ? cause.message : '删除失败，请重试。'); }
    finally { busy.current = false; if (active.current) setRemoving(''); }
    if (dialog?.kind === 'view' && dialog.item.id === item.id) setDialog(undefined);
    try { await refresh(); } catch { if (active.current) setPageError('列表刷新失败，请刷新页面。'); }
  };

  const editingGroup = dialog?.kind === 'edit' ? dialog.item.group : 'explicit';
  const isBusy = saving || !!removing;

  return <div className="prefs-page">
    <div className="page-heading prefs-heading">
      <div><span className="section-kicker">YOUR PREFERENCES</span><h1>我的偏好<span className="heading-dot">.</span></h1><p>你可以决定，我该记住什么</p></div>
      <p className="prefs-note">推荐页是否采用长期记录，由本轮“考虑过往记忆与偏好”开关控制。<br />本轮刚提交的反馈继续用于当前调整；首页今日穿搭固定考虑长期偏好。</p>
      <button className="primary-link prefs-add" disabled={isBusy} onClick={openAdd}><Plus size={18} /> 添加偏好</button>
    </div>
    {pageError && <p role="alert" className="wardrobe-error">{pageError}</p>}

    <section className="prefs-card" aria-labelledby="prefs-explicit">
      <h2 id="prefs-explicit">明确偏好</h2>
      {loaded && !groups.explicit.length && <p className="prefs-empty">还没有主动设置的偏好。点击“添加偏好”写下你希望长期记住的穿搭喜好。</p>}
      <ul>{groups.explicit.map(item => <Row key={item.id} item={item} icon={<Heart size={20} />} busy={isBusy} onEdit={() => openEdit(item)} onRemove={() => void remove(item)} />)}</ul>
    </section>

    <section className="prefs-card" aria-labelledby="prefs-inspiration">
      <h2 id="prefs-inspiration">灵感归纳 <small>来源于对“穿搭灵感”的归纳总结</small></h2>
      {loaded && !groups.inspiration.length && <p className="prefs-empty">暂无灵感归纳。保存穿搭灵感时，分析中明确写出的喜欢或不喜欢会归纳到这里。</p>}
      <ul>{groups.inspiration.map(item => <Row key={item.id} item={item} icon={<Layers size={20} />} busy={isBusy} onEdit={() => openEdit(item)} onRemove={() => void remove(item)} />)}</ul>
    </section>

    <section className="prefs-card" aria-labelledby="prefs-feedback">
      <h2 id="prefs-feedback">永久反馈</h2>
      {loaded && !groups.feedback.length && <p className="prefs-empty">暂无永久反馈。在穿搭推荐中评价搭配并选择“永久适用”后会保存在这里。</p>}
      <ul>{groups.feedback.map(item => {
        const fb = item.feedback!;
        return <li key={item.id} className="prefs-row prefs-feedback-row">
          <OutfitThumbnails snapshots={fb.outfit.snapshots} image={image} />
          <div className="prefs-feedback-body">
            <p className="prefs-row-content">{item.content ? `原因：${item.content}` : '未填写原因（只表示对这套整体的态度）'}</p>
            <div className="prefs-feedback-meta">
              <span className={`prefs-choice prefs-choice-${fb.choice}`}>{fb.choice === 'like' ? <ThumbsUp size={15} /> : <ThumbsDown size={15} />} {choiceText[fb.choice]}</span>
              <span className="prefs-badge">{badges.feedback}</span>
            </div>
          </div>
          <div className="prefs-row-actions">
            <button disabled={isBusy} onClick={() => setDialog({ kind: 'view', item })}><Eye size={16} /> 查看</button>
            <button disabled={isBusy} onClick={() => openEdit(item)}><PenLine size={16} /> 编辑</button>
            <button disabled={isBusy} onClick={() => void remove(item)}><Trash2 size={16} /> 删除</button>
          </div>
        </li>;
      })}</ul>
    </section>

    {dialog && dialog.kind !== 'view' && <div className="inspiration-backdrop" onKeyDown={event => { if (event.key === 'Escape') close(); }}>
      <section className="inspiration-dialog prefs-dialog" role="dialog" aria-modal="true" aria-label={dialog.kind === 'add' ? '添加偏好' : '编辑偏好'}>
        <div className="inspiration-dialog-heading"><h2>{dialog.kind === 'add' ? '添加偏好' : editingGroup === 'feedback' ? '编辑永久反馈' : '编辑偏好'}</h2><button className="inspiration-close-button" aria-label="关闭" disabled={saving} onClick={close}><X size={22} /></button></div>
        {dialog.kind === 'edit' && editingGroup === 'feedback' && <>
          <OutfitThumbnails snapshots={dialog.item.feedback!.outfit.snapshots} image={image} />
          <fieldset className="prefs-choice-field"><legend>评价</legend>
            {(['like', 'dislike'] as const).map(value => <label key={value}><input type="radio" name="prefs-choice" checked={choice === value} disabled={saving} onChange={() => setChoice(value)} /> {choiceText[value]}</label>)}
          </fieldset>
        </>}
        <label className="prefs-field">
          <span className="prefs-field-label">{editingGroup === 'feedback' ? '原因（可选）' : '偏好内容'}{dialog.kind === 'edit' && <span className="prefs-badge">{badges[editingGroup]}</span>}</span>
          <textarea autoFocus maxLength={MAX_CONTENT} disabled={saving} value={content} placeholder={dialog.kind === 'add' ? '例如：喜欢宽松的上衣' : undefined} onChange={event => setContent(event.target.value)} />
        </label>
        <p className="prefs-hint">{dialog.kind === 'add' ? '填写你希望长期记住的穿搭喜好' : '保存后以修改后的内容为准'}</p>
        {dialogError && <p role="alert" className="prefs-dialog-error">{dialogError}</p>}
        <div className="inspiration-dialog-footer"><span /><div>
          <button disabled={saving} onClick={close}>取消</button>
          <button className="inspiration-save-button" disabled={saving || (editingGroup !== 'feedback' && !content.trim())} onClick={() => void save()}>{saving ? '保存中…' : dialog.kind === 'add' ? '保存' : '保存修改'}</button>
        </div></div>
      </section>
    </div>}

    {dialog?.kind === 'view' && <div className="inspiration-backdrop" onKeyDown={event => { if (event.key === 'Escape') close(); }}>
      <section className="inspiration-dialog prefs-dialog" role="dialog" aria-modal="true" aria-label="查看永久反馈">
        <div className="inspiration-dialog-heading"><h2>永久反馈</h2><button className="inspiration-close-button" aria-label="关闭" onClick={close}><X size={22} /></button></div>
        <OutfitThumbnails snapshots={dialog.item.feedback!.outfit.snapshots} image={image} large />
        <p><b>评价：</b>{choiceText[dialog.item.feedback!.choice]}</p>
        <p><b>原因：</b>{dialog.item.content || '未填写（只表示对这套整体的态度，不代表不喜欢其中每一件）'}</p>
        <p className="prefs-hint"><Sparkles size={14} /> 搭配图为评价当时的快照，不随当前推荐或衣橱变化。</p>
        <div className="inspiration-actions"><button onClick={() => openEdit(dialog.item)}>编辑</button><button onClick={() => void remove(dialog.item)}>删除</button></div>
      </section>
    </div>}
  </div>;
}
