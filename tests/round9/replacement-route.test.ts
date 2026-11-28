import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { POST } from '@/app/api/recommendation/route';
import { snapshotOf } from '@/modules/session';
import { testGarment } from '../fixtures/recommendation';

const top = testGarment('new-top', { category: 'top' });
const kept = [snapshotOf(testGarment('deleted-bottom', { category: 'bottom' })), snapshotOf(testGarment('paused-shoes', { category: 'shoes' }))];
const input = () => ({ wardrobe: [top], conditions: {}, operation: { kind: 'swap-item', currentGarmentIds: ['old-top', ...kept.map(item => item.id)], targetGarmentId: 'old-top', targetCategory: 'top', keptGarments: kept } });
const request = (value: unknown) => new Request('http://localhost/api/recommendation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
beforeEach(() => { vi.stubEnv('OPENROUTER_API_KEY', 'unit-test-key'); vi.stubEnv('AI_MODEL', 'test-model'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('已删除/暂停快照仅作为冻结位置进入模型，不进入可选衣橱或泄露图片引用', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ garmentIds: ['new-top', ...kept.map(item => item.id)], reason: '只替换上衣，保留其他位置' }) } }] })));
  vi.stubGlobal('fetch', fetcher);
  expect((await POST(request(input()))).status).toBe(200);
  const prompt = JSON.parse(fetcher.mock.calls[0][1].body).messages[0].content[0].text as string;
  expect(prompt).toContain('keptGarments'); expect(prompt).not.toContain('imageId');
  const payload = JSON.parse(prompt.slice(prompt.indexOf('{"wardrobe"')));
  expect(payload.wardrobe.map((item: { id: string }) => item.id)).toEqual(['new-top']);
  expect(payload.operation.keptGarments.map((item: { id: string }) => item.id)).toEqual(kept.map(item => item.id));
});
it('冻结位置与当前搭配不一致时拒绝请求', async () => {
  const payload = input(); payload.operation.keptGarments = kept.slice(0, 1);
  expect((await POST(request(payload))).status).toBe(400);
});
it('拒绝模型擅自改其他位置或将旧目标当替代', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ garmentIds: ['old-top', ...kept.map(item => item.id)], reason: '没有替换' }) } }] }))));
  expect((await POST(request(input()))).status).toBe(502);
});
