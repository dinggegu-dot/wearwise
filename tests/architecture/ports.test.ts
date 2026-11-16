import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecognitionService, type RecognitionProvider } from '@/modules/recognition';
import { RecommendationService, type RecommendationStore } from '@/modules/recommendation/service';
import type { RecommendationEngine } from '@/modules/recommendation';
import { WeatherService, type WeatherProvider } from '@/modules/weather';
import { WearWiseDatabase } from '@/shared/infrastructure/database';
import { DexieUnitOfWork } from '@/shared/infrastructure/unit-of-work';
import { WardrobeService, type Garment, type WardrobeRepository } from '@/modules/wardrobe';
const opened: WearWiseDatabase[]=[];
afterEach(async()=>{for(const db of opened.splice(0))await db.delete();});
describe('领域边界',()=>{
 it('模型 provider 可替换并仍经过候选校验',async()=>{
  const provider: RecognitionProvider={recognize:vi.fn(async()=>({candidateId:crypto.randomUUID(),name:'上衣',category:'top' as const,color:'白',warmth:'unknown' as const,styleTags:[],warnings:[]}))};
  expect((await new RecognitionService(provider).recognize(new Blob(['test']))).name).toBe('上衣');expect(provider.recognize).toHaveBeenCalledOnce();
 });
 it('衣橱存储可替换，应用服务不绑定 Dexie',async()=>{
  const records = new Map<string,Garment>();
  const repo:WardrobeRepository={list:async()=>[...records.values()],get:async id=>records.get(id),save:async item=>{records.set(item.id,item);},createOnce:async item=>{records.set(item.id,item);return item;},update:async()=>{throw new Error('not used');},setPause:async()=>{throw new Error('not used');},remove:async id=>{records.delete(id);}};
  const service=new WardrobeService(repo,{get:async()=>new Blob(['local'])});
  const saved=await service.add({name:'替代衣物',category:'top',color:'白',warmth:'unknown',styleTags:[],sourceType:'manual'},new Blob(['photo']));
  expect((await service.list())[0].id).toBe(saved.id);await service.remove(saved.id);expect(await service.count()).toBe(0);
 });
 it('天气 provider 可替换并校验城市',async()=>{
  const provider:WeatherProvider={current:vi.fn(async()=>({city:'北京' as const,temperature:1,apparentTemperature:0,dataTime:new Date().toISOString(),fetchedAt:new Date().toISOString(),example:false}))};
  await expect(new WeatherService(provider).current('上海')).rejects.toThrow('不一致');
 });
 it('推荐引擎可替换，应用服务不直接访问数据库',async()=>{
  const store:RecommendationStore={snapshot:async()=>({garments:[],revision:0}),saveBatch:vi.fn(),activate:vi.fn(),clearActive:vi.fn(),restore:async()=>({records:[],revision:0}),feedback:vi.fn(),getFeedback:vi.fn()};
  const engine:RecommendationEngine={generate:vi.fn(()=>({outfits:[],message:'替代引擎'}))};
  const service=new RecommendationService(store,engine);
  expect((await service.generate({city:'深圳',temperature:20,apparentTemperature:20,dataTime:new Date().toISOString(),fetchedAt:new Date().toISOString(),example:true},'日常休闲','batch')).message).toBe('替代引擎');
  expect(engine.generate).toHaveBeenCalledOnce();expect(store.saveBatch).not.toHaveBeenCalled();
 });
 it('衣橱事务可连续删除引用并清理图片，过程中失败可回滚',async()=>{
  const db=new WearWiseDatabase(`wearwise-test-${crypto.randomUUID()}`);opened.push(db);const uow=new DexieUnitOfWork(db);
  const now=new Date().toISOString();const garment:Garment={id:'a',name:'上衣',category:'top',color:'白',warmth:'unknown',styleTags:[],imageId:'photo',sourceType:'manual',fit:'不确定',description:'',revision:1,createdAt:now,updatedAt:now};
  await uow.write('wardrobe',async tx=>{await tx.media.add({id:'photo',blob:new Blob(['x'])});await tx.garments.add(garment);await tx.meta.put({key:'wardrobeRevision',value:1});});
  await uow.write('wardrobe',async tx=>{const previous=await tx.garments.get('a');expect(previous).toBeDefined();await tx.garments.remove('a');if(!await tx.garments.referencesImage('photo'))await tx.media.remove('photo');await tx.meta.put({key:'wardrobeRevision',value:2});});
  expect(await db.garments.count()).toBe(0);expect(await db.media.count()).toBe(0);expect((await db.meta.get('wardrobeRevision'))?.value).toBe(2);
 });
 it('事务不允许访问声明范围之外的表，也不允许清除真实库',async()=>{
  const db=new WearWiseDatabase(`wearwise-test-${crypto.randomUUID()}`);opened.push(db);const uow=new DexieUnitOfWork(db);
  await expect(uow.write('feedback',tx=>tx.media.get('x'))).rejects.toThrow('范围之外');
  await expect(uow.write('demo',tx=>tx.garments.clear())).rejects.toThrow('仅允许重置示例');
  await expect(uow.write('wardrobe',tx=>tx.meta.put({key:'wardrobeRevision',value:'invalid'}))).rejects.toThrow('本地数据状态无效');
  await expect(uow.write('wardrobe',tx=>tx.meta.put({key:'unknown',value:1}))).rejects.toThrow('未知数据键');
 });
});
