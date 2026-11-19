// 改编自 Closet Kit 的浏览器 Canvas 图片处理；许可与来源见 THIRD_PARTY_NOTICES.md。
import { removeBiRefNetBackground } from './birefnet-background-remover';

export interface PreparedImage { blob: Blob; width: number; height: number; mime: 'image/jpeg'; backgroundRemoval?: 'removed' | 'fallback' }
const fail = () => { throw new Error('图片损坏或格式不受支持，请选择静态 JPEG、PNG 或 WebP 图片。'); };
const stopped = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('已取消', 'AbortError'); };
const ascii = (b: Uint8Array, start: number, n: number) => String.fromCharCode(...b.subarray(start, start + n));

/** 在解码前读取真实格式和尺寸，限制异常大图及动画。 */
export function inspectImage(bytes: Uint8Array): { type: string; width: number; height: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let type = '', width = 0, height = 0;
  if (bytes.length >= 24 && ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') {
    type = 'image/png'; width = v.getUint32(16); height = v.getUint32(20);
    for (let p = 8; p + 12 <= bytes.length;) {
      const len = v.getUint32(p); if (len > bytes.length - p - 12) fail();
      const tag = ascii(bytes, p + 4, 4); if (tag === 'acTL') fail();
      p += len + 12; if (tag === 'IEND') break;
    }
  } else if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    type = 'image/webp'; const chunk = ascii(bytes, 12, 4);
    if (chunk === 'VP8X') {
      if (bytes[20] & 2) fail();
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
      width = v.getUint16(26, true) & 0x3fff; height = v.getUint16(28, true) & 0x3fff;
    } else if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits = v.getUint32(21, true); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    } else fail();
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    type = 'image/jpeg'; let p = 2;
    while (p + 4 <= bytes.length) {
      if (bytes[p++] !== 0xff) fail();
      while (p < bytes.length && bytes[p] === 0xff) p++;
      const marker = bytes[p++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7) continue;
      if (p + 2 > bytes.length) fail();
      const len = v.getUint16(p); if (len < 2 || p + len > bytes.length) fail();
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        if (len < 7) fail(); height = v.getUint16(p + 3); width = v.getUint16(p + 5); break;
      }
      p += len;
    }
  } else fail();
  if (!width || !height || width > 12000 || height > 12000 || width * height > 40_000_000) fail();
  return { type, width, height };
}

async function jpegBlob(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<Blob> {
  for (const quality of [0.85, 0.75, 0.65]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality)); stopped(signal);
    if (!blob) throw new Error('图片转换失败，请重试。');
    if (blob.size <= 4 * 1024 * 1024) return blob;
  }
  throw new Error('图片处理后仍然过大，请选择其他图片。');
}

export async function prepareImage(file: File, signal?: AbortSignal, onValidatedImage?: (image: PreparedImage) => void): Promise<PreparedImage> {
  stopped(signal);
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('图片大小须在 10 MB 以内。');
  const metadata = inspectImage(new Uint8Array(await file.arrayBuffer())); stopped(signal);
  const ext = file.name.toLowerCase().split('.').pop();
  const validExt = metadata.type === 'image/jpeg' ? ['jpg','jpeg'] : metadata.type === 'image/png' ? ['png'] : ['webp'];
  if (file.type !== metadata.type || !ext || !validExt.includes(ext)) fail();
  const src = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('图片无法解码。')); img.src = src;
    });
    stopped(signal);
    const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('图片处理不可用。');
    ctx.drawImage(image, 0, 0, width, height);
    // Recognition can start with the validated original while local background removal runs.
    if (onValidatedImage) onValidatedImage({ blob: await jpegBlob(canvas, signal), width, height, mime: 'image/jpeg' });
    let backgroundRemoval: PreparedImage['backgroundRemoval'] = 'fallback';
    try {
      const cutout = await removeBiRefNetBackground(canvas, width, height, signal);
      stopped(signal);
      ctx.clearRect(0, 0, width, height); ctx.drawImage(cutout.canvas, 0, 0);
      backgroundRemoval = 'removed';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      // Keep the established image preparation path usable when the local model or GPU is unavailable.
      ctx.fillStyle = '#f5f0e8'; ctx.fillRect(0, 0, width, height); ctx.drawImage(image, 0, 0, width, height);
    }
    return { blob: await jpegBlob(canvas, signal), width, height, mime: 'image/jpeg', backgroundRemoval };
  } finally { URL.revokeObjectURL(src); }
}
