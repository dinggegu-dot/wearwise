'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { createServices, type Mode } from '@/composition';
interface ModeContextValue { mode: Mode; setLocked(value: boolean): void }
const ModeContext = createContext<ModeContextValue | null>(null);
export function useMode() { const value = useContext(ModeContext); if (!value) throw new Error('模式尚未选择'); return value; }
export function ModeProvider({children}:{children:React.ReactNode}) {
  const [mode,setMode] = useState<Mode | null>(null);
  const [loading,setLoading] = useState(true);
  const [working,setWorking] = useState(false);
  const [locked,setLocked] = useState(false);
  const [generation,setGeneration] = useState(0);
  const [error,setError] = useState('');
  const choose = async (next: Mode, reset = false) => {
    if (working || locked) return;
    setWorking(true); setError('');
    try {
      if (next === 'demo') {
        const services = createServices('demo');
        try {
          await services.demo.seed(reset);
          if (reset && typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('wearwise-demo'); channel.postMessage('wardrobeChanged'); channel.close(); }
        } finally { services.dispose(); }
      }
      try { localStorage.setItem('wearwise-mode',next); } catch { setError('模式偏好无法保存，重新打开时需要再次选择。'); }
      setMode(next); setGeneration(value => value + 1);
    } catch { setError('示例衣橱准备失败，请重试。'); }
    finally { setWorking(false); }
  };
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem('wearwise-mode'); } catch { /* 让用户选择模式 */ }
    if (stored === 'real') setMode('real');
    if (stored === 'demo') {
      const services = createServices('demo');
      services.demo.seed().then(() => setMode('demo')).catch(() => setError('示例衣橱准备失败，请重试。')).finally(() => { services.dispose(); setLoading(false); });
    } else setLoading(false);
  }, []);
  if (loading) return <p role="status">正在准备衣橱…</p>;
  if (!mode) return <main className="mode-choice"><h1>欢迎使用 WearWise</h1><p>选择你的衣橱。真实衣物保存在当前浏览器，示例衣橱与真实衣橱分开。</p>{error && <p role="alert">{error}</p>}<div className="wardrobe-actions"><button disabled={working} onClick={() => void choose('real')}>使用真实衣橱</button><button disabled={working} onClick={() => void choose('demo')}>体验示例衣橱</button></div></main>;
  return <ModeContext.Provider value={{mode,setLocked}}><div className="mode-bar"><span>{mode === 'demo' ? '示例模式 · 示例数据' : '真实衣橱 · 仅本浏览器保存'}</span><button disabled={working || locked} onClick={() => void choose(mode === 'real' ? 'demo' : 'real')}>{mode === 'real' ? '切换示例模式' : '切换真实衣橱'}</button>{mode === 'demo' && <button disabled={working || locked} onClick={() => { if (window.confirm('确定重置示例衣橱吗？示例数据将恢复初始状态。')) void choose('demo',true); }}>重置示例</button>}{error && <span role="alert">{error}</span>}</div><div key={`${mode}-${generation}`}>{children}</div></ModeContext.Provider>;
}
