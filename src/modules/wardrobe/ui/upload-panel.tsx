import { useEffect, useRef } from 'react';
import { TargetPicker } from './target-picker';
import { BlobImage } from './wardrobe-fields';
import type { UploadTask, UploadTasks } from '../upload-tasks';

const warningFields: Record<string, string> = {
  material: '材质', category: '类别', outerwear: '外套', top: '上衣',
  warmth: '厚薄', light: '轻薄', fit: '版型',
  styleTags: '风格标签', sceneTags: '场景标签',
  styleOther: '其他风格说明', sceneOther: '其他场景说明',
};

function readableWarning(warning: string) {
  return warning.replace(/\b(material|category|outerwear|top|warmth|light|fit|styleTags|sceneTags|styleOther|sceneOther)\b/g,
    field => warningFields[field] ?? field);
}

export function UploadPanel({ task, queue, disabled = false }: { task: UploadTask; queue: UploadTasks; disabled?: boolean }) {
  const awaitingTarget = task.status === 'awaiting-target';
  const focusPreview = useRef(false);
  const preview = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!awaitingTarget && focusPreview.current) {
      focusPreview.current = false;
      preview.current?.focus({ preventScroll: true });
    }
  }, [awaitingTarget]);
  if (awaitingTarget && task.file) {
    return <section className="upload-panel" aria-label="选择目标衣物">
      <TargetPicker key={task.sequence} file={task.file} onConfirm={crop => { focusPreview.current = true; queue.confirmTarget(task.id, crop); }}/>
    </section>;
  }
  return <section ref={preview} tabIndex={-1} className="upload-panel" aria-label="图片处理与识别">
    <div className="photo-comparison"><figure><figcaption>{task.crop ? '框选的衣物' : '上传图片 · 仅本次预览'}</figcaption><BlobImage blob={task.recognitionImage?.blob ?? task.file} alt={task.crop ? '本次处理的目标衣物' : '上传原图'}/></figure><figure><figcaption>白底结果</figcaption><BlobImage blob={task.white?.blob} alt="照片预览"/></figure></div>
    {task.status === 'queued' && <p role="status">已选定目标，等待处理…</p>}
    {task.preparing && <p role="status">正在处理图片并移除背景…</p>}
    {task.white && !task.imageError && !task.preparing && <p className="success-text" role="status">白底处理完成，请对照原图检查衣物颜色和细节。</p>}
    {task.imageError && <p className="inline-error" role="alert">{task.imageError}</p>}
    {task.recognizing && <p role="status">AI 正在识别衣物信息…</p>}
    {task.recognized && <p className="success-text" role="status">AI 识别完成，请核对表单信息后保存。</p>}
    {task.recognitionError && <p className="inline-error" role="alert">{task.recognitionError}</p>}
    {task.manual && <p className="muted">当前使用手动确认资料，未完成真实 AI 识别。</p>}
    {task.warnings.length > 0 && <details className="recognition-notes">
      <summary>查看 AI 判断说明（{task.warnings.length} 条）</summary>
      <ul>{task.warnings.map((warning, index) => <li key={index}>{readableWarning(warning)}</li>)}</ul>
    </details>}
    <div className="wardrobe-actions">
    {task.file && queue.requiresTarget && <button type="button" disabled={disabled} onClick={() => queue.changeTarget(task.id)}>重新选择目标</button>}
    <button type="button" disabled={disabled || task.status === 'queued' || task.preparing || task.recognizing} onClick={() => queue.retry(task.id,false,true)}>重新处理白底图</button>
    {!task.manual && <button type="button" disabled={disabled || task.status === 'queued' || task.preparing || task.recognizing} onClick={() => queue.retry(task.id, true)}>重新识别衣物</button>}
    {!task.manual && task.status !== 'queued' && !task.recognized && !task.recognizing && <button type="button" disabled={disabled} onClick={() => queue.useManual(task.id)}>改为手动填写并确认</button>}</div>
  </section>;
}
