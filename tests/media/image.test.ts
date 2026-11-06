import { describe, expect, it } from 'vitest';
import { inspectImage, prepareImage } from '@/modules/media/browser-image-processor';
function png(width:number,height:number,animated=false) {
  const bytes = new Uint8Array(animated ? 57 : 45), v=new DataView(bytes.buffer);
  bytes.set([137,80,78,71,13,10,26,10]); v.setUint32(8,13); bytes.set([73,72,68,82],12); v.setUint32(16,width); v.setUint32(20,height);
  let p=33; if(animated){ v.setUint32(p,0); bytes.set([97,99,84,76],p+4); p+=12; }
  v.setUint32(p,0);bytes.set([73,69,78,68],p+4);return bytes;
}
describe('图片边界',()=>{
 it('读取 PNG 头并拒绝异常像素或动画',()=>{
  expect(inspectImage(png(1600,1200))).toEqual({type:'image/png',width:1600,height:1200});
  expect(()=>inspectImage(png(12001,2))).toThrow(); expect(()=>inspectImage(png(10000,5000))).toThrow();
  expect(()=>inspectImage(png(20,20,true))).toThrow();
 });
 it('拒绝空文件、过大文件、伪装格式和损坏图',async()=>{
  await expect(prepareImage(new File([],'x.png',{type:'image/png'}))).rejects.toThrow();
  await expect(prepareImage(new File([new Uint8Array(10*1024*1024+1)],'x.png',{type:'image/png'}))).rejects.toThrow();
  await expect(prepareImage(new File([png(10,10)],'x.jpg',{type:'image/jpeg'}))).rejects.toThrow();
  await expect(prepareImage(new File(['broken'],'x.png',{type:'image/png'}))).rejects.toThrow();
 });
 it('拒绝动画 WebP 标记及不支持的格式',async()=>{
  const webp=new Uint8Array(30); webp.set([82,73,70,70],0); webp.set([87,69,66,80,86,80,56,88],8); webp[20]=2;
  expect(()=>inspectImage(webp)).toThrow();
  for (const [name,type] of [['x.gif','image/gif'],['x.svg','image/svg+xml'],['x.heic','image/heic'],['x.avif','image/avif']]) {
   await expect(prepareImage(new File(['not an allowed image'],name,{type}))).rejects.toThrow();
  }
 });
 it('取消操作不会继续解码',async()=>{
  const abort=new AbortController();abort.abort();await expect(prepareImage(new File([png(1,1)],'x.png',{type:'image/png'}),abort.signal)).rejects.toMatchObject({name:'AbortError'});
 });
});
