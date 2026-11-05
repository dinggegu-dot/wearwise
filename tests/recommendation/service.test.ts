import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { WearWiseDatabase, DexieMediaRepository, DexieWardrobeRepository, DexieRecommendationStore } from '@/shared/infrastructure/database';
import { WardrobeService } from '@/modules/wardrobe';
import { RuleRecommendationEngine } from '@/modules/recommendation';
import { RecommendationService } from '@/modules/recommendation/service';
import { ExampleWeatherProvider } from '@/modules/weather';
const dbs: WearWiseDatabase[] = [];
function setup() { const db = new WearWiseDatabase(`wearwise-test-${crypto.randomUUID()}`); dbs.push(db); return { db, wardrobe:new WardrobeService(new DexieWardrobeRepository(db),new DexieMediaRepository(db)), service:new RecommendationService(new DexieRecommendationStore(db),new RuleRecommendationEngine()) }; }
afterEach(async () => { for (const db of dbs.splice(0)) await db.delete(); });
async function seed(wardrobe: WardrobeService) { for (const category of ['top','bottom','shoes'] as const) await wardrobe.add({name:category,category,color:'白',warmth:'medium',styleTags:[],sourceType:'manual'},new Blob(['x'])); }
describe('推荐与反馈事务', () => {
 it('相同请求只创建一批，反馈可修改并恢复', async () => {
  const {db,wardrobe,service}=setup(); await seed(wardrobe); const weather=await new ExampleWeatherProvider().current('深圳'); const batch=crypto.randomUUID();
  const first=await service.generate(weather,'日常休闲',batch); const again=await service.generate(weather,'日常休闲',batch);
  expect(first.records[0].id).toBe(again.records[0].id); expect(await db.outfits.count()).toBe(1);
  await service.setFeedback(first.records[0].id,'like'); await service.setFeedback(first.records[0].id,'dislike');
  expect(await db.feedback.count()).toBe(1); expect((await service.getFeedback(first.records[0].id))?.choice).toBe('dislike');
  expect((await service.restore())[0].id).toBe(first.records[0].id);
 });
 it('两套搭配刷新后顺序稳定，反馈仍属于原搭配', async () => {
  const {wardrobe,service}=setup(); await seed(wardrobe);
  await wardrobe.add({name:'dress',category:'dress',color:'白',warmth:'medium',styleTags:[],sourceType:'manual'},new Blob(['x']));
  const generated=await service.generate(await new ExampleWeatherProvider().current('深圳'),'日常休闲',crypto.randomUUID());
  expect(generated.records).toHaveLength(2); await service.setFeedback(generated.records[0].id,'like');
  const restored=await service.restore(); expect(restored.map(record=>record.id)).toEqual(generated.records.map(record=>record.id));
  expect((await service.getFeedback(restored[0].id))?.choice).toBe('like');
 });
 it('衣橱变更后旧结果失效，过期快照不可写入', async () => {
  const {db,wardrobe,service}=setup(); await seed(wardrobe); const weather=await new ExampleWeatherProvider().current('深圳');
  const result=await service.generate(weather,'日常休闲',crypto.randomUUID()); expect(result.records).toHaveLength(1);
  await wardrobe.remove(result.records[0].garmentIds[0]); expect(await service.restore()).toEqual([]);
  const store=new DexieRecommendationStore(db); await expect(store.saveBatch(result.records,result.records[0].wardrobeRevision)).rejects.toThrow('衣橱已改变');
 });
 it('生成期间上下文变更时只保留历史记录，不激活旧结果',async()=>{
  const {db,wardrobe}=setup();await seed(wardrobe);const store=new DexieRecommendationStore(db);
  let unblock!:()=>void;const gate=new Promise<void>(resolve=>{unblock=resolve;});
  let saved!:()=>void;const reached=new Promise<void>(resolve=>{saved=resolve;});
  const original=store.saveBatch.bind(store);
  store.saveBatch=async(records,revision)=>{const value=await original(records,revision);saved();await gate;return value;};
  const service=new RecommendationService(store,new RuleRecommendationEngine());let current=true;
  const pending=service.generate(await new ExampleWeatherProvider().current('深圳'),'日常休闲',crypto.randomUUID(),()=>current);
  await reached;current=false;unblock();
  expect((await pending).records).toEqual([]);expect(await service.restore()).toEqual([]);
  expect(await db.outfits.count()).toBe(1);expect(await db.meta.get('activeBatch')).toBeUndefined();
 });
 it('不存在的推荐不能写入反馈', async () => { const {service}=setup(); await expect(service.setFeedback('missing','like')).rejects.toThrow('不存在'); });
});
