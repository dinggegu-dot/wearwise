export async function removeBackgroundOnline(image: Blob, signal?: AbortSignal): Promise<Blob> {
  const form = new FormData();
  form.set('image', image, 'garment.jpg');
  const response = await fetch('/api/background/remove', { method: 'POST', body: form, signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? '在线白底处理失败，请重试。');
  }
  const result = await response.blob();
  if (!result.size || result.size > 12 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(result.type))
    throw new Error('在线白底结果格式无效，请重试。');
  return result;
}
