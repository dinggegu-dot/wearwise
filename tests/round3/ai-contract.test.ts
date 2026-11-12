import { describe, expect, it } from 'vitest';
import { recognitionCandidateSchema } from '@/modules/recognition';
import { categorySchema, UNCERTAIN } from '@/modules/wardrobe';

describe('round 3 AI data contracts',()=>{
 it('recognition candidate matches round 2 garment fields and uncertainty values',()=>{
  const value=recognitionCandidateSchema.parse({name:'上衣',category:'top',color:UNCERTAIN,fit:UNCERTAIN,warmth:'unknown',material:UNCERTAIN,styleTags:[],description:UNCERTAIN,warnings:[]});
  expect(value).toMatchObject({fit:UNCERTAIN,warmth:'unknown',description:UNCERTAIN});
  expect(categorySchema.safeParse('coat').success).toBe(false);
 });
});
