import { describe, expect, it, vi } from 'vitest';
import { UploadTasks } from '@/modules/wardrobe/upload-tasks';
import type { PreparedImage } from '@/modules/media/browser-image-processor';
import type { RecognitionCandidate } from '@/modules/recognition';
import type { Garment } from '@/modules/wardrobe';
import { blankDraft } from '@/modules/wardrobe/draft';
const image = (backgroundRemoval: 'removed' | 'fallback' = 'removed'): PreparedImage => ({ blob: new Blob(['white'], { type: 'image/jpeg' }), width: 10, height: 10, mime: 'image/jpeg', backgroundRemoval });
const photo = (name = 'photo.jpg') => new File(['photo'], name, { type: 'image/jpeg' });
const candidate = (name = 'AI名称'): RecognitionCandidate => ({ candidateId: crypto.randomUUID(), name, category: 'outerwear', color: '白色', fit: '宽松', warmth: 'medium', material: '不确定', styleTags: ['Minimalist Style'], description: '描述', warnings: [] });
function gate<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const saved = (id: string) => ({ id } as Garment);
const ready = async (q: UploadTasks, count = 1) => vi.waitFor(() => expect(q.snapshot().filter(t => t.status === 'ready')).toHaveLength(count));
const named = (q: UploadTasks, id: string) => q.edit(id, 'name', id);

describe('single/bulk task lifecycle', () => {
  it('an empty or oversized file fails independently without rejecting valid bulk files', async () => {
    const prepare = vi.fn(async () => image()); const huge = photo('huge.jpg'); Object.defineProperty(huge,'size',{value:10*1024*1024+1});
    const queue = new UploadTasks({ prepare, save: vi.fn() });
    queue.add([photo(),new File([],'empty.jpg',{type:'image/jpeg'}),huge], 'top'); await ready(queue);
    expect(queue.snapshot().map(t=>t.status)).toEqual(['ready','failed','failed']); expect(prepare).toHaveBeenCalledTimes(1); expect(queue.snapshot()[2].file).toBeUndefined(); queue.dispose();
  });
  it('bounds concurrency, keeps mixed rows, partially saves only selected successes and never saves fallback', async () => {
    const wait = gate<PreparedImage>(); let active = 0, peak = 0;
    const save = vi.fn(async (_draft, _white, id) => saved(id));
    const queue = new UploadTasks({ prepare: async file => { active++; peak = Math.max(peak, active); const out = file.name === 'hold.jpg' ? await wait.promise : image(file.name === 'fail.jpg' ? 'fallback' : 'removed'); active--; return out; }, save });
    const ids = queue.add([photo('one.jpg'), photo('fail.jpg'), photo('hold.jpg')], 'bottom'); ids.forEach(id => named(queue,id));
    await vi.waitFor(() => expect(queue.snapshot().map(t => t.status)).toEqual(['ready','failed','processing']));
    expect(queue.snapshot()[0].draft.category).toBe('bottom'); queue.select(ids[0], true); queue.select(ids[1], true);
    expect(await queue.saveSelected()).toBe(1); expect(save).toHaveBeenCalledTimes(1);
    expect(queue.snapshot().map(t => t.status)).toEqual(['saved','failed','processing']);
    expect(queue.snapshot()[0].file).toBeUndefined(); expect(peak).toBe(1);
    await queue.saveSelected([ids[0],ids[1]]); expect(save).toHaveBeenCalledTimes(1);
    wait.resolve(image()); await ready(queue); expect(queue.snapshot()[1].imageError).toContain('原背景'); queue.dispose();
  });
  it('keeps per-item save errors, stable requestIds and handles simultaneous save clicks', async () => {
    const wait = gate<Garment>(); let calls = 0;
    const save = vi.fn(async (_draft,_white,id) => { calls++; if (calls === 1) return wait.promise; if (calls === 2) throw new Error('quota'); return saved(id); });
    const queue = new UploadTasks({ prepare: async () => image(), save });
    const ids = queue.add([photo(),photo()], 'top'); ids.forEach(id => { named(queue,id); }); await ready(queue,2); ids.forEach(id => queue.select(id,true));
    const requestIds = queue.snapshot().map(t => t.requestId);
    const first = queue.saveSelected(); expect(await queue.saveSelected()).toBe(0); wait.resolve(saved(requestIds[0])); expect(await first).toBe(1);
    expect(queue.snapshot()[1].saveError).toContain('quota'); expect(queue.snapshot()[1].selected).toBe(true);
    expect(await queue.saveSelected()).toBe(1); expect(save.mock.calls.map(call => call[2])).toEqual([requestIds[0],requestIds[1],requestIds[1]]); queue.dispose();
  });
  it('late AI and retry preserve user edits and deleted tags at application time', async () => {
    const ai = gate<RecognitionCandidate>();
    const queue = new UploadTasks({ prepare: async (_f,_s,validated) => { validated?.(image()); return image(); }, recognize: async () => ai.promise, save: async (_d,_w,id) => saved(id) });
    const [id] = queue.add([photo()], 'top'); queue.edit(id,'name','用户名称'); queue.edit(id,'styleTags',[]); queue.edit(id,'sceneTags',['学习']);
    ai.resolve(candidate()); await ready(queue);
    expect(queue.snapshot()[0].draft).toMatchObject({ name:'用户名称',styleTags:[],sceneTags:['学习'],styleOther:[],color:'白色',category:'outerwear' });
    queue.retry(id,true); await ready(queue); expect(queue.snapshot()[0].draft.styleTags).toEqual([]); queue.dispose();
  });
  it('an older AI candidate without scene fields preserves the existing untouched scene group', async () => {
    const ai = gate<RecognitionCandidate>();
    const queue = new UploadTasks({ prepare: async (_f,_s,validated) => { validated?.(image()); return image(); }, recognize: async () => ai.promise, save: vi.fn() });
    const [id] = queue.add([photo()], 'top');
    queue.seed(id, { ...blankDraft(), sceneTags: ['学习','其他'], sceneOther: ['音乐节'] }, new Set());
    ai.resolve(candidate()); await ready(queue);
    expect(queue.snapshot()[0].draft).toMatchObject({ sceneTags: ['学习','其他'], sceneOther: ['音乐节'], styleTags: ['简约风'] }); queue.dispose();
  });
  it('replacement ignores the old request even when its provider ignores AbortSignal', async () => {
    const old = gate<RecognitionCandidate>();
    const recognize = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValue(candidate('新图'));
    const queue = new UploadTasks({ prepare: async (_f,_s,validated) => { validated?.(image()); return image(); }, recognize, save: async (_d,_w,id) => saved(id) });
    const [id] = queue.add([photo('old.jpg')], 'top'); queue.replace(id,photo('new.jpg'));
    old.resolve(candidate('旧图')); await ready(queue); expect(queue.snapshot()[0].draft.name).toBe('新图'); expect(queue.snapshot()[0].sequence).toBeGreaterThan(1); queue.dispose();
  });
  it('recognition failure requires explicit manual confirmation, processing never counts as success', async () => {
    const queue = new UploadTasks({ prepare: async (_f,_s,validated) => { validated?.(image()); return image(); }, recognize: async () => { throw new Error('识别失败'); }, save: async (_d,_w,id) => saved(id) });
    const [id] = queue.add([photo()], 'top'); named(queue,id);
    await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('failed')); expect(await queue.saveSelected([id])).toBe(0);
    queue.useManual(id); await ready(queue); expect(await queue.saveSelected([id])).toBe(1); queue.dispose();
  });
  it('a failed recognition retry cannot reuse the earlier success flag', async () => {
    const recognize = vi.fn().mockResolvedValueOnce(candidate()).mockRejectedValueOnce(new Error('retry failed'));
    const queue = new UploadTasks({ prepare: async (_f,_s,validated) => { validated?.(image()); return image(); }, recognize, save: vi.fn() });
    const [id] = queue.add([photo()], 'top'); await ready(queue); queue.retry(id,true);
    await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('failed'));
    expect(queue.snapshot()[0].recognized).toBe(false); expect(queue.snapshot()[0].draft.name).toBe('AI名称'); expect(await queue.saveSelected([id])).toBe(0); queue.dispose();
  });
  it('white-only reprocessing does not spend another AI call or fake a failed recognition success', async () => {
    const recognize = vi.fn().mockRejectedValue(new Error('AI unavailable'));
    const queue = new UploadTasks({ prepare: async (_f,_s,validated) => { validated?.(image()); return image(); }, recognize, save: vi.fn() });
    const [id] = queue.add([photo()], 'top'); await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('failed'));
    queue.retry(id,false,true); await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('failed'));
    expect(recognize).toHaveBeenCalledTimes(1); expect(queue.snapshot()[0].recognitionError).toContain('AI unavailable'); queue.dispose();
  });
  it('cancel picker retains state; remove/dispose release originals and forbid late writes', async () => {
    const wait = gate<PreparedImage>(); const save = vi.fn();
    const queue = new UploadTasks({ prepare: async () => wait.promise, save });
    const [id] = queue.add([photo()], 'top'); const task = queue.snapshot()[0]; queue.replace(id,undefined); expect(task.file?.name).toBe('photo.jpg');
    queue.dispose(); wait.resolve(image()); await Promise.resolve(); expect(task.file).toBeUndefined(); expect(queue.snapshot()).toEqual([]); expect(await queue.saveSelected([id])).toBe(0); expect(save).not.toHaveBeenCalled();
  });
  it('reprocessing failure keeps an old preview but cannot pass as a successful replacement', async () => {
    let calls = 0;
    const queue = new UploadTasks({ prepare: async () => image(++calls === 1 ? 'removed' : 'fallback'), save: vi.fn() });
    const [id] = queue.add([photo()], 'top'); await ready(queue); queue.retry(id);
    await vi.waitFor(() => expect(queue.snapshot()[0].status).toBe('failed')); expect(queue.snapshot()[0].white).toBeDefined(); expect(await queue.saveSelected([id])).toBe(0); queue.dispose();
  });
  it('times out an unresponsive AI without hanging the remaining queue', async () => {
    vi.useFakeTimers();
    const queue = new UploadTasks({ prepare: async (_f,_s,validated) => { validated?.(image()); return image(); }, recognize: async () => new Promise(() => {}), save: vi.fn() });
    queue.add([photo()], 'top'); await vi.advanceTimersByTimeAsync(95_001);
    expect(queue.snapshot()[0].status).toBe('failed'); expect(queue.snapshot()[0].recognitionError).toContain('超时'); queue.dispose(); vi.useRealTimers();
  });
});
