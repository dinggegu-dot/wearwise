import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { ImageCrop } from '@/modules/media/browser-image-processor';
import { BlobImage } from './wardrobe-fields';

const whole = { left: 0, top: 0, right: 100, bottom: 100 };
const edgeLabels = { left: '左边', top: '上边', right: '右边', bottom: '下边' } as const;

export function TargetPicker({ file, onConfirm }: { file: File; onConfirm: (crop?: ImageCrop) => void }) {
  const [crop, setCrop] = useState<ImageCrop>();
  const action = useRef<HTMLButtonElement>(null);
  const firstEdge = useRef<HTMLInputElement>(null);
  const cropping = !!crop;
  useEffect(() => {
    (cropping ? firstEdge.current : action.current)?.focus({ preventScroll: true });
  }, [cropping]);
  const start = useRef<{ x: number; y: number } | null>(null);
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = (value: number) => Math.round(Math.max(0, Math.min(100, value)));
    return { x: percent((event.clientX - rect.left) * 100 / rect.width), y: percent((event.clientY - rect.top) * 100 / rect.height) };
  };
  const valid = crop && crop.right - crop.left >= 5 && crop.bottom - crop.top >= 5 &&
    (crop.left > 0 || crop.top > 0 || crop.right < 100 || crop.bottom < 100);
  return <div className="target-picker">
    <p>这张照片里如果有多件衣物，请框出要录入的一件。白底处理和识别都会使用同一范围。</p>
    {crop ? <>
      <div className="target-preview"
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          start.current = point(event);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const origin = start.current;
          if (!origin || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const end = point(event);
          setCrop({ left: Math.min(origin.x, end.x), top: Math.min(origin.y, end.y), right: Math.max(origin.x, end.x), bottom: Math.max(origin.y, end.y) });
        }}
        onLostPointerCapture={() => { start.current = null; }}>
        <BlobImage blob={file} alt="待框选的上传照片" className="target-image"/>
        <span className="target-outline" aria-hidden="true" style={{
          left: `${crop.left}%`, top: `${crop.top}%`,
          width: `${crop.right - crop.left}%`, height: `${crop.bottom - crop.top}%`,
        }}/>
      </div>
      <p className="muted">拖动框选，也可用方向键微调四条边。请保留目标衣物的完整轮廓。</p>
      <div className="target-edges">
        {(Object.keys(edgeLabels) as Array<keyof ImageCrop>).map(edge => {
          const min = edge === 'bottom' ? Math.min(100, crop.top + 5) : edge === 'right' ? Math.min(100, crop.left + 5) : 0;
          const max = edge === 'top' ? Math.max(0, crop.bottom - 5) : edge === 'left' ? Math.max(0, crop.right - 5) : 100;
          return <label key={edge}>{edgeLabels[edge]}<input ref={edge === 'left' ? firstEdge : undefined} type="range" min={min} max={max} value={crop[edge]}
            onChange={event => setCrop({ ...crop, [edge]: event.target.valueAsNumber })}/></label>;
        })}
      </div>
      <div className="wardrobe-actions">
        <button type="button" onClick={() => setCrop(undefined)}>返回选图确认</button>
        <button type="button" disabled={!valid} onClick={() => onConfirm(crop)}>使用框选范围</button>
      </div>
    </> : <>
      <BlobImage blob={file} alt="待处理的上传照片"/>
      <div className="wardrobe-actions">
        <button ref={action} type="button" onClick={() => setCrop(whole)}>框选目标衣物</button>
        <button type="button" onClick={() => onConfirm()}>原图只有一件，开始处理</button>
      </div>
    </>}
  </div>;
}
