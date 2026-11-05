import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DexieMediaRepository, DexieWardrobeRepository, WearWiseDatabase } from '@/shared/infrastructure/database';
import { WardrobeService } from '@/modules/wardrobe';

const databases: WearWiseDatabase[] = [];
function setup() {
  const db = new WearWiseDatabase(`wearwise-test-${crypto.randomUUID()}`);
  databases.push(db);
  return { db, service: new WardrobeService(new DexieWardrobeRepository(db), new DexieMediaRepository(db)) };
}
afterEach(async () => { for (const db of databases.splice(0)) await db.delete(); });
const input = { name: '白色上衣', category: 'top' as const, color: '白', warmth: 'light' as const, styleTags: [], sourceType: 'manual' as const };

describe('衣橱存储事务', () => {
  it('同一请求并发重试只保存一件衣物和一张图', async () => {
    const { db, service } = setup();
    const id = crypto.randomUUID();
    const [first, second] = await Promise.all([service.add(input, new Blob(['first']), id), service.add(input, new Blob(['second']), id)]);
    expect(first.id).toBe(id);
    expect(second.id).toBe(id);
    expect(await db.garments.count()).toBe(1);
    expect(await db.media.count()).toBe(1);
    expect((await db.meta.get('wardrobeRevision'))?.value).toBe(1);
  });
  it('衣物写入失败时图片和版本均回滚', async () => {
    const { db, service } = setup();
    db.garments.hook('creating', () => { throw new Error('注入存储错误'); });
    await expect(service.add(input, new Blob(['photo']))).rejects.toThrow('注入存储错误');
    expect(await db.garments.count()).toBe(0);
    expect(await db.media.count()).toBe(0);
    expect(await db.meta.get('wardrobeRevision')).toBeUndefined();
  });
  it('并发编辑基于旧版本时拒绝覆盖已保存的修改', async () => {
    const { service } = setup();
    const item = await service.add(input, new Blob(['photo']));
    const updated = await service.update(item.id, { name: '新版' }, item.revision);
    expect(updated.revision).toBe(item.revision + 1);
    await expect(service.update(item.id, { name: '旧版' }, item.revision)).rejects.toThrow('已被修改');
    expect((await service.get(item.id))?.name).toBe('新版');
  });
  it('换图时衣物写入失败回滚新图、旧图与版本',async()=>{
    const {db,service}=setup();
    const old=await service.add(input,new Blob(['old image']));
    const before=(await db.meta.get('wardrobeRevision'))?.value;
    const fail=()=>{throw new Error('注入换图失败');};
    db.garments.hook('updating',fail);
    await expect(service.update(old.id,{name:'新名字'},old.revision,{id:'new-image',blob:new Blob(['new image'])})).rejects.toThrow('注入换图失败');
    db.garments.hook('updating').unsubscribe(fail);
    expect(await service.get(old.id)).toEqual(old);
    expect(await (await service.image(old.imageId))?.text()).toBe('old image');
    expect(await service.image('new-image')).toBeUndefined();
    expect((await db.meta.get('wardrobeRevision'))?.value).toBe(before);
  });
  it('关闭并重新打开后衣物与图片仍然存在', async () => {
    const { db, service } = setup();
    const item = await service.add(input, new Blob(['photo']));
    const name = db.name;
    db.close();
    const reopened = new WearWiseDatabase(name);
    databases.push(reopened);
    expect((await reopened.garments.get(item.id))?.name).toBe(input.name);
    expect(await (await reopened.media.get(item.imageId))?.blob.text()).toBe('photo');
  });
});

describe('历史数据与共享图片', () => {
  it('v1 数据迁移到 v2 时保留衣物、图片和旧反馈', async () => {
    const { default: Dexie } = await import('dexie');
    const name = `wearwise-test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({garments:'id, category',media:'id',feedback:'outfitId',outfits:'id, createdAt'});
    const timestamp = new Date().toISOString();
    await old.table('garments').add({id:'old-id',name:'旧衣物',category:'top',color:'白',warmth:'medium',styleTags:[],imageId:'old-photo',status:'confirmed',sourceType:'manual',excludedPermanently:false,createdAt:timestamp,updatedAt:timestamp});
    await old.table('media').add({id:'old-photo',blob:new Blob(['old-photo'])});
    await old.table('outfits').add({id:'old-outfit',garmentIds:['old-id'],createdAt:timestamp});
    await old.table('feedback').add({outfitId:'old-outfit',choice:'like',updatedAt:timestamp});
    old.close();
    const db = new WearWiseDatabase(name); databases.push(db);
    const service = new WardrobeService(new DexieWardrobeRepository(db),new DexieMediaRepository(db));
    expect((await service.get('old-id'))?.revision).toBe(1);
    expect(await (await service.image('old-photo'))?.text()).toBe('old-photo');
    expect((await db.feedback.get('old-outfit'))?.choice).toBe('like');
    expect((await db.outfits.get('old-outfit'))?.recordVersion).toBe(1);
  });
  it('共享图片在最后一个引用删除之前不会被清除', async () => {
    const {db,service}=setup();
    const first=await service.add(input,new Blob(['shared']));
    const second={...first,id:crypto.randomUUID(),name:'同图衣物'};
    await new DexieWardrobeRepository(db).save(second);
    await service.remove(first.id);
    expect(await (await service.image(first.imageId))?.text()).toBe('shared');
    await service.remove(second.id); expect(await service.image(first.imageId)).toBeUndefined();
  });
});
