import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { WearWiseDatabase, DexieDemoStore, DexieRecommendationStore } from '@/shared/infrastructure/database';
import { DemoService } from '@/modules/demo';
import { RecommendationService } from '@/modules/recommendation/service';
import { RuleRecommendationEngine } from '@/modules/recommendation';
import { ExampleWeatherProvider } from '@/modules/weather';
const opened: WearWiseDatabase[]=[];
function setup() {const db=new WearWiseDatabase(`wearwise-test-demo-${crypto.randomUUID()}`);opened.push(db);return {db,demo:new DemoService(new DexieDemoStore(db))};}
afterEach(async()=>{for(const db of opened.splice(0))await db.delete();});
describe('示例数据库',()=>{
 it('并发初始化一次写入八件，重置递增版本并拒绝旧快照',async()=>{
  const {db,demo}=setup(); await Promise.all([demo.seed(),demo.seed()]); expect(await db.garments.count()).toBe(8); expect(await db.media.count()).toBe(8);
  const before=Number((await db.meta.get('wardrobeRevision'))?.value);
  const store=new DexieRecommendationStore(db);const service=new RecommendationService(store,new RuleRecommendationEngine());
  const old=await service.generate(await new ExampleWeatherProvider().current('深圳'),'日常休闲',crypto.randomUUID());
  expect(old.records.length).toBeGreaterThan(0);await demo.seed(true);
  expect(await db.garments.count()).toBe(8); expect((await db.meta.get('wardrobeRevision'))?.value).toBe(before+1);
  await expect(store.saveBatch(old.records,before)).rejects.toThrow('衣橱已改变');
  await expect(store.activate({batchId:'old',city:'深圳',style:'日常休闲',weatherFingerprint:'',wardrobeRevision:before})).rejects.toThrow('衣橱已改变');
  expect(await service.restore()).toEqual([]);
 });
 it('重置发生写入错误时旧数据完整保留',async()=>{
  const {db,demo}=setup();await demo.seed(); const ids=(await db.garments.toArray()).map(g=>g.id).sort();
  db.garments.hook('creating',()=>{throw new Error('故障注入');});
  await expect(demo.seed(true)).rejects.toThrow('故障注入');
  expect((await db.garments.toArray()).map(g=>g.id).sort()).toEqual(ids);expect(await db.media.count()).toBe(8);
 });
 it('禁止在真实库调用重置',async()=>{const db=new WearWiseDatabase(`wearwise-test-real-${crypto.randomUUID()}`);opened.push(db);await expect(new DemoService(new DexieDemoStore(db)).seed(true)).rejects.toThrow('仅可初始化示例衣橱');});
});
