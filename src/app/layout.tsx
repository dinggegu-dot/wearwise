import './globals.css';
import { ModeProvider } from '@/composition/mode-provider';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'WearWise', description: '让每天的穿搭更轻松' };
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="zh-CN"><body><ModeProvider>{children}</ModeProvider></body></html>; }
