import 'server-only';
import { recognitionCandidateSchema } from '@/modules/recognition';

export async function recognizeWithQwen(image: Blob) {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error('RECOGNITION_UNAVAILABLE');
  const base = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const url = new URL(base);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.aliyuncs.com')) throw new Error('RECOGNITION_UNAVAILABLE');
  const data = Buffer.from(await image.arrayBuffer()).toString('base64');
  const response = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.QWEN_MODEL || 'qwen3-vl-plus', response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: '识别单件衣物，仅返回 JSON，字段 name、category、color、warmth、styleTags。category 只能是 top、bottom、outerwear、dress、shoes；warmth 只能是 light、medium、warm、unknown；styleTags 为中文字符串数组。不返回 ID 或时间。' },
      { role: 'user', content: [{ type: 'text', text: '请识别图片主体衣物。' }, { type: 'image_url', image_url: { url: `data:${image.type};base64,${data}` } }] }
    ] })
  });
  if (!response.ok) throw new Error('RECOGNITION_FAILED');
  const body: unknown = await response.json();
  const envelope = await import('zod').then(({ z }) => z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) }).parse(body));
  return recognitionCandidateSchema.parse(JSON.parse(envelope.choices[0].message.content));
}
