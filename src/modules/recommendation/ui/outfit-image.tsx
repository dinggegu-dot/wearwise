'use client';

import { useEffect, useState } from 'react';
import type { Garment } from '@/modules/wardrobe';

type LoadImage = (id: string) => Promise<Blob | undefined>;
type ImageState = {
  load: LoadImage;
  attempt: number;
} & ({ phase: 'loading' | 'missing' | 'error' } | { phase: 'decoding' | 'ready'; url: string });

function ImagePreview({ imageId, name, load }: { imageId: string; name: string; load: LoadImage }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ImageState>({ load, attempt, phase: 'loading' });

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setState({ load, attempt, phase: 'loading' });
    // Catch both synchronous loader failures and rejected reads. Late reads never create URLs.
    void Promise.resolve().then(() => load(imageId)).then(blob => {
      if (!active) return;
      if (!blob) { setState({ load, attempt, phase: 'missing' }); return; }
      objectUrl = URL.createObjectURL(blob);
      setState({ load, attempt, phase: 'decoding', url: objectUrl });
    }).catch(() => { if (active) setState({ load, attempt, phase: 'error' }); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [imageId, load, attempt]);

  // Hide the previous loader/attempt synchronously, before effect cleanup runs.
  const current = state.load === load && state.attempt === attempt ? state : { phase: 'loading' as const };
  const loading = current.phase === 'loading' || current.phase === 'decoding';
  const url = 'url' in current ? current.url : undefined;
  const finish = (phase: 'ready' | 'error') => {
    setState(previous => {
      if (previous.load !== load || previous.attempt !== attempt || previous.phase !== 'decoding' || previous.url !== url) return previous;
      return phase === 'ready' ? { load, attempt, phase, url: previous.url } : { load, attempt, phase };
    });
  };

  return <div style={{ position: 'relative', width: 110, height: 110 }} aria-busy={loading}>
    {url && <img src={url} alt={name} width={110} height={110}
      style={{ visibility: current.phase === 'ready' ? 'visible' : 'hidden', position: 'absolute', inset: 0 }}
      onLoad={() => finish('ready')} onError={() => finish('error')} />}
    {current.phase !== 'ready' && <div className="outfit-placeholder" role="status" style={{ padding: 6, gap: 4 }}>
      <span>{loading ? '图片加载中…' : current.phase === 'missing' ? '暂无图片' : '图片读取失败'}</span>
      {current.phase === 'error' && <button type="button" aria-label={`重新加载${name}的图片`}
        style={{ border: '1px solid #ced8c8', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
        onClick={() => setAttempt(value => value + 1)}>重试</button>}
    </div>}
  </div>;
}

export function OutfitImage({ item, load }: { item: Garment; load: LoadImage }) {
  return <figure className="outfit-item">
    <ImagePreview key={`${item.id}:${item.imageId}`} imageId={item.imageId} name={item.name} load={load} />
    <figcaption>{item.name}</figcaption>
  </figure>;
}
