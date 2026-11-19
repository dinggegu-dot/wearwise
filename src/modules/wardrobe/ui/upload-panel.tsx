import { BlobImage } from './wardrobe-fields';
import type { UploadTask, UploadTasks } from '../upload-tasks';

export function UploadPanel({ task, queue, disabled = false }: { task: UploadTask; queue: UploadTasks; disabled?: boolean }) {
  return <section className="upload-panel" aria-label="图片处理与识别">
    <div className="photo-comparison"><figure><figcaption>上传图片 · 仅本次预览</figcaption><BlobImage blob={task.file} alt="上传原图"/></figure><figure><figcaption>白底结果</figcaption><BlobImage blob={task.white?.blob} alt="照片预览"/></figure></div>
    {task.preparing && <p role="status">正在处理图片并尝试移除背景（首次加载约94 MiB本机模型）…</p>}
    {task.white && !task.imageError && !task.preparing && <p className="success-text" role="status">已在本机完成白底抠图。</p>}
    {task.imageError && <p className="inline-error" role="alert">{task.imageError}</p>}
    {task.recognizing && <p role="status">AI 正在识别衣物信息…</p>}
    {task.recognized && <p role="status">AI 识别结果已填入表单，请检查并修改后确认保存。</p>}
    {task.recognitionError && <p className="inline-error" role="alert">{task.recognitionError}</p>}
    {task.manual && <p className="muted">当前使用手动确认资料，未完成真实 AI 识别。</p>}
    {task.warnings.map(warning => <p className="muted" key={warning}>{warning}</p>)}
    <div className="wardrobe-actions"><button type="button" disabled={disabled || task.preparing || task.recognizing} onClick={() => queue.retry(task.id,false,true)}>重新处理白底图</button>
    {!task.manual && <button type="button" disabled={disabled || task.preparing || task.recognizing} onClick={() => queue.retry(task.id, true)}>重新识别衣物</button>}
    {!task.manual && !task.recognized && !task.recognizing && <button type="button" disabled={disabled} onClick={() => queue.useManual(task.id)}>改为手动填写并确认</button>}</div>
  </section>;
}
