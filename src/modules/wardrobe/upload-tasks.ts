import type { Category, Garment, WardrobeService } from '.';
import type { RecognitionCandidate } from '@/modules/recognition';
import type { PreparedImage } from '@/modules/media/browser-image-processor';
import { blankDraft, checkedDraft, type WardrobeDraft } from './draft';
import { readTags } from './tag-adapter';

export type TaskStatus = 'queued' | 'processing' | 'ready' | 'failed' | 'saving' | 'saved';
export interface UploadTask {
  id: string; requestId: string; sequence: number; file?: File; filename: string;
  draft: WardrobeDraft; status: TaskStatus; selected: boolean; manual: boolean;
  white?: PreparedImage; recognitionImage?: PreparedImage;
  preparing: boolean; recognizing: boolean; recognized: boolean;
  imageError?: string; recognitionError?: string; saveError?: string; warnings: string[];
  saved?: Garment;
}
interface Ports {
  prepare(file: File, signal: AbortSignal, validated?: (image: PreparedImage) => void): Promise<PreparedImage>;
  recognize?: (image: Blob, signal: AbortSignal) => Promise<RecognitionCandidate>;
  save(draft: WardrobeDraft, white: Blob, requestId: string): ReturnType<WardrobeService['add']>;
}
type Runtime = { abort: AbortController; touched: Set<keyof WardrobeDraft>; whiteOnly?: boolean; recognitionOnly?: boolean };
const message = (error: unknown) => error instanceof Error ? error.message : '处理失败，请重试。';

/** Memory-only queue shared by single and bulk editors. One image/model task at a time.
 * Identity + sequence + abort protect every completion; no UI or persistence side channel.
 */
export class UploadTasks {
  private tasks: UploadTask[] = [];
  private runtime = new Map<string, Runtime>();
  private listeners = new Set<() => void>();
  private running = false;
  private closed = false;
  private saving = false;
  constructor(private readonly ports: Ports) {}
  activate() { this.closed = false; }
  snapshot = () => this.tasks;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private emit() { this.tasks = [...this.tasks]; this.listeners.forEach(fn => fn()); }
  private find(id: string) { return this.tasks.find(task => task.id === id); }
  private valid(task: UploadTask, seq: number, abort: AbortController) { return !this.closed && this.find(task.id) === task && task.sequence === seq && !abort.signal.aborted; }
  add(files: File[], category: Category): string[] {
    if (this.closed) return [];
    if (this.tasks.length + files.length > 12) throw new Error('每批最多12张照片，请分批添加。');
    const added = files.map(file => {
      const id = crypto.randomUUID();
      const invalid = !file.size || file.size > 10 * 1024 * 1024;
      const task: UploadTask = { id, requestId: crypto.randomUUID(), sequence: 0, file: invalid ? undefined : file, filename: file.name, draft: blankDraft(category), status: invalid ? 'failed' : 'queued', imageError: invalid ? '图片大小须在 10 MB 以内，请更换图片。' : undefined, selected: false, manual: !this.ports.recognize, preparing: false, recognizing: false, recognized: false, warnings: [] };
      this.tasks.push(task); this.runtime.set(id, { abort: new AbortController(), touched: new Set() }); return id;
    });
    this.emit(); void this.pump(); return added;
  }
  edit<K extends keyof WardrobeDraft>(id: string, key: K, value: WardrobeDraft[K]) {
    const task = this.find(id); if (!task || task.status === 'saving' || task.status === 'saved') return;
    this.runtime.get(id)?.touched.add(key); task.draft = { ...task.draft, [key]: value }; task.saveError = undefined; this.emit();
  }
  seed(id: string, draft: WardrobeDraft, touched: Set<keyof WardrobeDraft>) {
    const task = this.find(id); if (!task) return;
    task.draft = draft; this.runtime.get(id)!.touched = new Set(touched); this.emit();
  }
  select(id: string, selected: boolean) { const task = this.find(id); if (task?.status === 'ready') { task.selected = selected; this.emit(); } }
  private settle(task: UploadTask) {
    if (task.preparing || task.recognizing) task.status = 'processing';
    else task.status = !task.imageError && task.white?.backgroundRemoval === 'removed' && (task.recognized || task.manual) ? 'ready' : 'failed';
    if (task.status !== 'ready') task.selected = false;
  }
  useManual(id: string) {
    const task = this.find(id); if (!task || task.status === 'saving' || task.status === 'saved') return;
    task.manual = true; task.recognitionError = undefined; this.settle(task); this.emit();
  }
  retry(id: string, recognitionOnly = false, whiteOnly = false) {
    const task = this.find(id); if (!task || ['saved','saving','processing','queued'].includes(task.status)) return;
    if (!task.file) { task.imageError = '请更换有效图片后重试。'; this.emit(); return; }
    const runtime = this.runtime.get(id)!;
    runtime.recognitionOnly = !!(recognitionOnly && task.recognitionImage && this.ports.recognize);
    runtime.whiteOnly = whiteOnly;
    task.status = 'queued'; task.saveError = undefined; this.emit(); void this.pump();
  }
  replace(id: string, file?: File) {
    if (!file) return; // Cancelling a native picker preserves the current task.
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('图片大小须在 10 MB 以内。');
    const task = this.find(id); if (!task || task.status === 'saving' || task.status === 'saved') return;
    const runtime = this.runtime.get(id)!; runtime.abort.abort(); runtime.whiteOnly = false; runtime.recognitionOnly = false; task.sequence++;
    task.file = file; task.filename = file.name; task.white = undefined; task.recognitionImage = undefined;
    task.recognized = false; task.preparing = false; task.recognizing = false; task.imageError = undefined; task.recognitionError = undefined; task.saveError = undefined; task.warnings = [];
    task.status = 'queued'; task.selected = false; this.emit(); void this.pump();
  }
  remove(id: string) {
    const task = this.find(id); if (!task || task.status === 'saving') return;
    this.runtime.get(id)?.abort.abort(); this.runtime.delete(id);
    task.sequence++; task.file = undefined; task.recognitionImage = undefined; task.white = undefined;
    this.tasks = this.tasks.filter(task => task.id !== id); this.emit();
  }
  private async recognize(task: UploadTask, image: PreparedImage, seq: number, runtime: Runtime) {
    if (!this.ports.recognize) return;
    const abort = runtime.abort;
    task.recognizing = true; task.recognized = false; task.recognitionError = undefined; this.emit();
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), 95_000);
    try {
      const signal = AbortSignal.any([abort.signal, deadline.signal]);
      const candidate = await Promise.race([
        this.ports.recognize(image.blob, signal),
        new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('AI 识别超时或已取消，请重试或手动填写。')), { once: true })),
      ]);
      if (!this.valid(task, seq, abort)) return;
      const { candidateId: _id, warnings, ...fields } = candidate;
      const normalized = readTags(fields);
      const proposed: Partial<WardrobeDraft> = { ...fields, styleTags: normalized.styleTags, styleOther: normalized.styleOther };
      // M04's current candidate has no scene fields. Absence must not erase a
      // saved/manual scene group when replacing an image with this older API.
      if ('sceneTags' in fields || 'sceneOther' in fields) Object.assign(proposed, { sceneTags: normalized.sceneTags, sceneOther: normalized.sceneOther });
      const next = { ...task.draft };
      for (const key of Object.keys(proposed) as (keyof WardrobeDraft)[]) {
        // Check touched fields at application time, including user deletions during a retry.
        if (!runtime.touched.has(key)) Object.assign(next, { [key]: proposed[key] });
      }
      // Style/other and scene/other are atomic user-edited groups.
      for (const kind of ['style','scene'] as const) if (runtime.touched.has(`${kind}Tags`) || runtime.touched.has(`${kind}Other`)) {
        next[`${kind}Tags`] = task.draft[`${kind}Tags`]; next[`${kind}Other`] = task.draft[`${kind}Other`];
      }
      task.draft = next; task.warnings = warnings; task.recognized = true;
    } catch (error) { if (this.valid(task, seq, abort)) task.recognitionError = message(error); }
    finally { clearTimeout(timer); if (this.valid(task, seq, abort)) { task.recognizing = false; this.emit(); } }
  }
  private async pump() {
    if (this.running || this.closed) return;
    this.running = true;
    try {
      for (let task = this.tasks.find(t => t.status === 'queued'); task && !this.closed; task = this.tasks.find(t => t.status === 'queued')) {
        const runtime = this.runtime.get(task.id)!; runtime.abort.abort(); runtime.abort = new AbortController();
        const abort = runtime.abort, seq = ++task.sequence;
        const recognitionOnly = runtime.recognitionOnly && task.recognitionImage;
        runtime.recognitionOnly = false;
        const needsRecognition = !runtime.whiteOnly && !task.manual && !task.recognized;
        runtime.whiteOnly = false;
        task.status = 'processing'; task.preparing = true; task.recognizing = false; task.imageError = undefined;
        if (needsRecognition) task.recognitionError = undefined;
        this.emit();
        if (recognitionOnly) {
          task.preparing = false;
          await this.recognize(task, recognitionOnly, seq, runtime);
          if (this.valid(task, seq, abort)) { this.settle(task); this.emit(); }
          continue;
        }
        let recognition: Promise<void> | undefined;
        try {
          const result = await this.ports.prepare(task.file!, abort.signal, source => {
            if (!this.valid(task!, seq, abort)) return;
            task!.recognitionImage = source;
            if (needsRecognition) recognition = this.recognize(task!, source, seq, runtime);
          });
          if (this.valid(task, seq, abort)) {
            if (result.backgroundRemoval !== 'removed') task.imageError = '白底处理失败：当前结果仍有原背景，请重试或更换图片，不能保存。';
            else { task.white = result; task.imageError = undefined; }
          }
        } catch (error) { if (this.valid(task, seq, abort)) task.imageError = message(error); }
        finally {
          if (this.valid(task, seq, abort)) { task.preparing = false; this.emit(); }
          // Await recognition too, bounding large image memory and paid-request concurrency to one.
          await recognition;
          if (this.valid(task, seq, abort)) { this.settle(task); this.emit(); }
        }
      }
    } finally { this.running = false; }
  }
  async saveSelected(ids?: string[]): Promise<number> {
    if (this.closed || this.saving) return 0;
    this.saving = true; let savedCount = 0;
    const selected = this.tasks.filter(t => t.status === 'ready' && (ids ? ids.includes(t.id) : t.selected));
    try {
      for (const task of selected) {
        if (this.closed || this.find(task.id) !== task || task.status !== 'ready') continue;
        task.status = 'saving'; task.saveError = undefined; this.emit();
        try {
          const draft = checkedDraft(task.draft);
          if (task.white?.backgroundRemoval !== 'removed') throw new Error('白底图尚未处理成功。');
          task.saved = await this.ports.save(draft, task.white.blob, task.requestId);
          task.status = 'saved'; task.selected = false; task.file = undefined; task.recognitionImage = undefined;
          savedCount++;
        } catch (error) { task.status = 'ready'; task.saveError = `保存失败：${message(error)} 已保留内容，请重试。`; }
        this.emit();
      }
    } finally { this.saving = false; }
    return savedCount;
  }
  dispose() {
    this.closed = true;
    this.runtime.forEach(r => r.abort.abort()); this.runtime.clear();
    for (const task of this.tasks) { task.sequence++; task.file = undefined; task.white = undefined; task.recognitionImage = undefined; }
    this.tasks = []; this.listeners.clear();
  }
}
