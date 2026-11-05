import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'WearWise', description: '让每天的穿搭更轻松' };
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="zh-CN"><body>{children}</body></html>; }
