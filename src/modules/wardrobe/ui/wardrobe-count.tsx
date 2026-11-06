'use client';
import { useEffect, useMemo, useState } from 'react';
import { createServices } from '@/composition';
import { useMode } from '@/composition/mode-provider';
export function WardrobeCount() {
  const { mode } = useMode();
  const services = useMemo(() => createServices(mode), [mode]);
  const [count, setCount] = useState<number>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => { services.wardrobe.count().then(value => { if (active) { setCount(value); setError(false); } }).catch(() => { if (active) setError(true); }); };
    const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(`wearwise-${mode}`);
    if (channel) channel.onmessage = refresh;
    window.addEventListener('focus',refresh); refresh();
    return () => { active = false; channel?.close(); window.removeEventListener('focus',refresh); services.dispose(); };
  },[services,mode]);
  return <span>{error ? '衣橱数量暂不可用' : count === undefined ? '正在读取衣橱…' : `衣橱中有 ${count} 件衣物`}</span>;
}
