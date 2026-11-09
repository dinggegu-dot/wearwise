import type { Garment, Media } from '@/modules/wardrobe';
import type { Feedback } from '@/modules/feedback';
import type { OutfitRecord } from '@/modules/recommendation/service';
export type WriteScope = 'wardrobe' | 'recommendation' | 'feedback' | 'demo';
export interface LegacyOutfit { id:string; garmentIds:string[]; createdAt:string; recordVersion?:1 }
export interface MetaRecord { key:string; value:unknown }
export interface TransactionContext {
  readonly mode: 'real' | 'demo';
  garments: { get(id:string):Promise<Garment | undefined>; list():Promise<Garment[]>; put(value:Garment):Promise<void>; add(value:Garment):Promise<void>; remove(id:string):Promise<void>; referencesImage(id:string):Promise<boolean>; clear():Promise<void> };
  /** inUse 检查图片是否仍被衣物、搭配快照、永久反馈、灵感或推荐设置引用。 */
  media: { get(id:string):Promise<Blob | undefined>; put(value:Media):Promise<void>; add(value:Media):Promise<void>; remove(id:string):Promise<void>; inUse(id:string):Promise<boolean>; clear():Promise<void> };
  outfits: { get(id:string):Promise<OutfitRecord | LegacyOutfit | undefined>; findBatch(id:string):Promise<OutfitRecord[]>; addMany(values:OutfitRecord[]):Promise<void>; clear():Promise<void> };
  feedback: { get(id:string):Promise<Feedback | undefined>; put(value:Feedback):Promise<void>; clear():Promise<void> };
  meta: { get(key:string):Promise<MetaRecord | undefined>; put(value:MetaRecord):Promise<void>; remove(key:string):Promise<void>; clear():Promise<void> };
  /** 仅示例库重置使用：清空灵感、长期偏好、搭配结果与推荐过程状态。 */
  clearRound2():Promise<void>;
}
export interface UnitOfWork {
  readWardrobeSnapshot():Promise<{garments:Garment[];revision:number}>;
  write<T>(scope:WriteScope,work:(tx:TransactionContext)=>Promise<T>):Promise<T>;
}
