import type { Table } from 'dexie';
import { z } from 'zod';
import { imageInUse, type WearWiseDatabase } from '@/shared/infrastructure/database';
import { garmentSchema } from '@/modules/wardrobe';
import type { OutfitRecord } from '@/modules/recommendation/service';
import type { TransactionContext, UnitOfWork, WriteScope } from '@/shared/domain/unit-of-work';

const metaSchemas = {
  wardrobeRevision:z.number().int().nonnegative().safe(),
  demoSeedVersion:z.number().int().positive().safe(),
  activeBatch:z.object({batchId:z.string().min(1),city:z.enum(['深圳','广州','上海','北京','成都','杭州']),style:z.enum(['日常休闲','简约通勤']),weatherFingerprint:z.string().min(1),wardrobeRevision:z.number().int().nonnegative().safe()}).strict()
};
function checkMeta(key:string, value?:unknown) {
  const schema = metaSchemas[key as keyof typeof metaSchemas];
  if (!schema) throw new Error('未知数据键');
  if (value !== undefined && !schema.safeParse(value).success) throw new Error('本地数据状态无效，请检查数据后重试');
}
export const isDemoDatabase = (name: string) => name === 'wearwise-demo-v1' || name.startsWith('wearwise-test-demo-');
/** 图片引用核对需要读取的表。 */
const imageRefs = ['inspirations','outfits','results','preferences','state'];

/** 将领域事务限制在声明的表范围；只有示例库允许清表。 */
export class DexieUnitOfWork implements UnitOfWork {
  constructor(private readonly db: WearWiseDatabase) {}
  private context(scope: WriteScope): TransactionContext {
    const allowed: Record<WriteScope, string[]> = {
      wardrobe:['garments','media','meta',...imageRefs], recommendation:['garments','outfits','meta'],
      feedback:['outfits','feedback'], demo:['garments','media','outfits','feedback','meta',...imageRefs]
    };
    const check = (table:string) => { if (!allowed[scope].includes(table)) throw new Error('事务访问了范围之外的数据表'); };
    const clear = (table:string) => { check(table); if (scope !== 'demo' || !isDemoDatabase(this.db.name)) throw new Error('仅允许重置示例衣橱'); };
    const db = this.db;
    return {
      mode:isDemoDatabase(db.name) ? 'demo' : 'real',
      garments:{
        get:async id=>{check('garments');const value=await db.garments.get(id);return value ? garmentSchema.parse(value) : undefined;},
        list:async()=>{check('garments');return (await db.garments.toArray()).map(value=>garmentSchema.parse(value));},
        put:async value=>{check('garments');await db.garments.put(garmentSchema.parse(value));},
        add:async value=>{check('garments');await db.garments.add(garmentSchema.parse(value));},
        remove:async id=>{check('garments');await db.garments.delete(id);},
        referencesImage:async id=>{check('garments');return (await db.garments.toArray()).some(g=>g.imageId===id);},
        clear:async()=>{clear('garments');await db.garments.clear();}
      },
      media:{get:async id=>{check('media');return (await db.media.get(id))?.blob;},put:async value=>{check('media');await db.media.put(value);},add:async value=>{check('media');await db.media.add(value);},remove:async id=>{check('media');await db.media.delete(id);},
        inUse:id=>{check("media");for(const t of ["garments",...imageRefs])check(t);return imageInUse(db,id);},clear:async()=>{clear('media');await db.media.clear();}},
      outfits:{get:async id=>{check('outfits');return db.outfits.get(id);},findBatch:async id=>{check('outfits');return (await db.outfits.where('batchId').equals(id).toArray()).filter((value):value is OutfitRecord=>value.recordVersion===2).sort((a,b)=>(a.position??0)-(b.position??0)||a.id.localeCompare(b.id));},addMany:async values=>{check('outfits');await db.outfits.bulkAdd(values);},clear:async()=>{clear('outfits');await db.outfits.clear();}},
      feedback:{get:async id=>{check('feedback');return db.feedback.get(id);},put:async value=>{check('feedback');await db.feedback.put(value);},clear:async()=>{clear('feedback');await db.feedback.clear();}},
      meta:{get:async key=>{check('meta');checkMeta(key);const value=await db.meta.get(key);if(value)checkMeta(key,value.value);return value;},put:async value=>{check('meta');checkMeta(value.key,value.value);await db.meta.put(value);},remove:async key=>{check('meta');checkMeta(key);await db.meta.delete(key);},clear:async()=>{clear('meta');await db.meta.clear();}},
      clearRound2:async()=>{for(const t of imageRefs)clear(t);await Promise.all([db.inspirations.clear(),db.preferences.clear(),db.results.clear(),db.state.clear()]);}
    };
  }
  async readWardrobeSnapshot() {
    return this.db.transaction('r',this.db.garments,this.db.meta,async()=>{const value=await this.db.meta.get('wardrobeRevision');if(value)checkMeta(value.key,value.value);return {garments:(await this.db.garments.toArray()).map(item=>garmentSchema.parse(item)),revision:Number(value?.value??0)};});
  }
  async write<T>(scope:WriteScope,work:(tx:TransactionContext)=>Promise<T>):Promise<T> {
    const refs = [this.db.inspirations,this.db.outfits,this.db.results,this.db.preferences,this.db.state];
    const tables: Record<WriteScope,Table[]> = {
      wardrobe:[this.db.garments,this.db.media,this.db.meta,...refs], recommendation:[this.db.garments,this.db.outfits,this.db.meta],
      feedback:[this.db.outfits,this.db.feedback], demo:[this.db.garments,this.db.media,this.db.outfits,this.db.feedback,this.db.meta,...refs]
    };
    return this.db.transaction('rw',[...new Set(tables[scope])],()=>work(this.context(scope)));
  }
}
