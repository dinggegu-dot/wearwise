// 改编 Wearly 的“仅使用可用衣物”和“提供不同组合”行为用例；许可见 THIRD_PARTY_NOTICES.md。
import { describe, expect, it } from 'vitest';
import { RuleRecommendationEngine } from '@/modules/recommendation';
import type { Garment } from '@/modules/wardrobe';
import type { Weather } from '@/modules/weather';
const now = '2026-01-01T00:00:00.000Z';
function item(id: string, category: Garment['category'], patch: Partial<Garment> = {}): Garment { return { id,name:id,category,color:'白',warmth:'medium',styleTags:['日常'],imageId:id,sourceType:'manual',fit:'不确定',description:'',revision:1,createdAt:now,updatedAt:now,...patch }; }
function weather(temp: number): Weather { return {city:'深圳',temperature:temp,apparentTemperature:temp,dataTime:now,fetchedAt:now,example:true}; }
const engine = new RuleRecommendationEngine();
describe('穿搭规则', () => {
 it('只选确认且可用的真实衣物，提供不同组合', () => {
  const clothes=[item('a','top'),item('b','top',{pause:{since:now,resumeOn:null}}),item('c','bottom'),item('d','shoes'),item('e','dress')];
  const result=engine.generate(clothes,weather(20),'日常休闲');
  expect(result.outfits).toHaveLength(2); expect(result.outfits.flatMap(o=>o.garmentIds)).not.toContain('b');
  expect(result.outfits.every(o=>o.garmentIds.every(id=>clothes.some(g=>g.id===id)))).toBe(true);
 });
 it('低温拒绝保暖未知的外套，边界 15 度不要求外套', () => {
  const clothes=[item('a','top'),item('b','bottom'),item('c','shoes'),item('d','outerwear',{warmth:'unknown'})];
  expect(engine.generate(clothes,weather(14.9),'日常休闲').outfits).toHaveLength(0);
  expect(engine.generate(clothes,weather(15),'日常休闲').outfits).toHaveLength(1);
 });
 it('22.9 和 23 度选择对应保暖档，忽略已删除与暂停中的衣物',()=>{
  const clothes=[item('medium','top'),item('light','top',{warmth:'light'}),item('archived','top',{deletedAt:now}),item('future','top',{pause:{since:now,resumeOn:'2026-01-02'}}),item('pants','bottom'),item('shoe','shoes')];
  const warm=engine.generate(clothes,weather(22.9),'日常休闲',new Date(now));const hot=engine.generate(clothes,weather(23),'日常休闲',new Date(now));
  expect(warm.outfits[0].garmentIds).toContain('medium');expect(hot.outfits[0].garmentIds).toContain('light');
  expect(warm.outfits.flatMap(o=>o.garmentIds)).not.toContain('archived');expect(warm.outfits.flatMap(o=>o.garmentIds)).not.toContain('future');
 });
 it('缺少类别时返回提示，不伪造衣物',()=>{const result=engine.generate([item('top','top')],weather(20),'日常休闲');expect(result.outfits).toHaveLength(0);expect(result.message).toContain('鞋');});
 it('连衣裙路线只需要裙子和鞋，低温还需要已知保暖外套',()=>{
  const dress=item('dress','dress'), shoe=item('shoe','shoes'), coat=item('coat','outerwear',{warmth:'warm'});
  expect(engine.generate([dress,shoe],weather(20),'日常休闲').outfits[0].garmentIds).toEqual(['dress','shoe']);
  expect(engine.generate([dress,shoe],weather(10),'日常休闲').message).toContain('外套');
  expect(engine.generate([dress,shoe,coat],weather(10),'日常休闲').outfits[0].garmentIds).toEqual(['dress','shoe','coat']);
 });
 it('风格标签重复不重复计分，同分组合与输入顺序无关',()=>{
  const clothes=[item('z','top',{styleTags:['休闲','休闲']}),item('a','top',{styleTags:['休闲']}),item('pants','bottom'),item('shoe','shoes')];
  const one=engine.generate(clothes,weather(20),'日常休闲').outfits.map(o=>o.garmentIds);
  const two=engine.generate([...clothes].reverse(),weather(20),'日常休闲').outfits.map(o=>o.garmentIds);
  expect(one).toEqual(two); expect(one[0]).toContain('a'); expect(one[1]).toContain('z');
 });
 it('100 件衣物在两秒内得到最多两套有效组合', () => {
  const kinds: Garment['category'][]=['top','bottom','shoes','outerwear'];
  const clothes=Array.from({length:100},(_,i)=>item(String(i).padStart(3,'0'),kinds[i%4]));
  const start=performance.now(); const result=engine.generate(clothes,weather(10),'日常休闲');
  const elapsed=performance.now()-start; console.info(`100 件衣物推荐耗时 ${elapsed.toFixed(2)} ms`);
  expect(elapsed).toBeLessThan(2000); expect(result.outfits).toHaveLength(2);
  const known=new Set(clothes.map(item=>item.id));
  for(const outfit of result.outfits) {
    expect(new Set(outfit.garmentIds).size).toBe(outfit.garmentIds.length);
    expect(outfit.garmentIds.every(id=>known.has(id))).toBe(true);
    expect(outfit.garments.map(item=>item.category).sort()).toEqual(['bottom','outerwear','shoes','top']);
  }
  expect(new Set(result.outfits.map(outfit=>[...outfit.garmentIds].sort().join('|'))).size).toBe(2);
 });
});
