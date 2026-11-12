import 'server-only';
import { z } from 'zod';
import { UNCERTAIN, categorySchema, warmthSchema } from '@/modules/wardrobe';
import { recognitionCandidateSchema, type RecognitionCandidate } from '@/modules/recognition';

const inspirationSchema = z.object({ name:z.string().trim().min(1).max(100), tags:z.array(z.object({text:z.string().trim().min(1).max(30),kind:z.enum(['color','style','fit','layering','scene'])}).strict()).max(30), analysis:z.string().trim().min(1).max(2000) }).strict();
const recommendationSchema = z.object({ garmentIds:z.array(z.string().min(1)).min(1).max(20), reason:z.string().trim().min(1).max(1000) }).strict();
export type InspirationAnalysis = z.infer<typeof inspirationSchema>;
export type StructuredRecommendation = z.infer<typeof recommendationSchema>;
export type ModelTask = 'recognition'|'inspiration'|'recommendation';

export class AIError extends Error { constructor(readonly code:'AI_UNAVAILABLE'|'AI_TIMEOUT'|'AI_PROVIDER_ERROR'|'AI_INVALID_RESPONSE', message:string, readonly retryable=code==='AI_TIMEOUT'){super(message);} }
export function aiAvailable(){return !!process.env.OPENROUTER_API_KEY&&!!process.env.AI_MODEL;}
export interface VisionModelAdapter { complete(task:ModelTask, prompt:string, image?:Blob | readonly Blob[], signal?:AbortSignal):Promise<string> }

/** OpenAI-compatible multimodal adapter; provider/model are configuration, not business API. */
export class OpenRouterAdapter implements VisionModelAdapter {
  async complete(task:ModelTask,prompt:string,image?:Blob | readonly Blob[],signal?:AbortSignal):Promise<string> {
    const key=process.env.OPENROUTER_API_KEY, model=process.env.AI_MODEL;
    if(!key||!model) throw new AIError('AI_UNAVAILABLE','AI 服务尚未配置。');
    const configuredTimeout=Number(process.env.AI_TIMEOUT_MS??'90000');
    const timeoutMs=Number.isSafeInteger(configuredTimeout)&&configuredTimeout>0&&configuredTimeout<=180000?configuredTimeout:90000;
    const timeout=AbortSignal.timeout(timeoutMs);
    try {
      const content:Array<Record<string,unknown>>=[{type:'text',text:prompt}];
      for(const item of image ? Array.isArray(image) ? image : [image] : [])
        content.push({type:'image_url',image_url:{url:`data:${item.type||'image/jpeg'};base64,${Buffer.from(await item.arrayBuffer()).toString('base64')}`}});
      const recognitionOptions=task==='recognition'
        ? {response_format:{type:'json_object'},...(model==='qwen/qwen3.8-max-0902'?{reasoning:{effort:'minimal'}}:{})}
        : {};
      const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,temperature:0,...recognitionOptions,messages:[{role:'user',content}]})});
      if(!response.ok) throw new AIError('AI_PROVIDER_ERROR','视觉模型请求失败。',response.status===429||response.status>=500);
      const envelope=z.object({choices:z.array(z.object({message:z.object({content:z.union([z.string(),z.array(z.object({type:z.string(),text:z.string().optional()}))])})})).min(1)}).parse(await response.json());
      const body=envelope.choices[0].message.content;
      return typeof body==='string'?body:body.map(p=>p.text||'').join('\n');
    } catch(e) { if(e instanceof AIError) throw e; if(timeout.aborted) throw new AIError('AI_TIMEOUT','AI 请求超时。'); if(signal?.aborted) throw e; if(e instanceof TypeError) throw new AIError('AI_PROVIDER_ERROR','视觉模型服务暂不可用。',true); throw new AIError('AI_INVALID_RESPONSE','AI 响应格式无效。'); }
  }
}
const adapter:VisionModelAdapter=new OpenRouterAdapter();
function json(text:string){const clean=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');return JSON.parse(clean);}
const rawRecognitionSchema=z.object({
 name:z.string().nullish(),category:z.string(),color:z.string().nullish(),fit:z.string().nullish(),
 warmth:z.string().nullish(),material:z.string().nullish(),styleTags:z.union([z.array(z.string()),z.string()]).nullish(),
 description:z.string().nullish(),warnings:z.union([z.array(z.string()),z.string()]).nullish()
});
const categoryNames:Record<string,z.infer<typeof categorySchema>>={上衣:'top',下装:'bottom',外套:'outerwear',连衣裙:'dress',鞋履:'shoes',鞋子:'shoes'};
const warmthNames:Record<string,z.infer<typeof warmthSchema>>={轻薄:'light',薄:'light',适中:'medium',中等:'medium',保暖:'warm',厚:'warm',不确定:'unknown',未知:'unknown'};
function textOrUncertain(value:string|null|undefined,max:number){return value?.trim().slice(0,max)||UNCERTAIN;}
function textList(value:string[]|string|null|undefined,maxItems:number,maxLength:number){
 const entries=typeof value==='string'?value.split(/[,，、]/):value??[];
 return entries.map(item=>item.trim().slice(0,maxLength)).filter(Boolean).slice(0,maxItems);
}
function recognitionFields(value:unknown){
 const raw=rawRecognitionSchema.parse(value);
 const category=categorySchema.safeParse(categoryNames[raw.category.trim()]??raw.category.trim());
 if(!category.success) throw new AIError('AI_INVALID_RESPONSE','图片中的物品不属于当前支持的衣物类别，请换图或手动填写。');
 const warmthValue=warmthNames[raw.warmth?.trim()??'']??raw.warmth?.trim()??'unknown';
 const warmth=warmthSchema.safeParse(warmthValue);
 return recognitionCandidateSchema.parse({
  name:textOrUncertain(raw.name,100),category:category.data,color:textOrUncertain(raw.color,50),
  fit:textOrUncertain(raw.fit,50),warmth:warmth.success?warmth.data:'unknown',material:textOrUncertain(raw.material,100),
  styleTags:textList(raw.styleTags,20,30),description:textOrUncertain(raw.description,1000),
  warnings:textList(raw.warnings,10,200)
 });
}
export async function recognizeGarment(image:Blob,signal?:AbortSignal):Promise<RecognitionCandidate>{
 const prompt='识别单张图片中的一件衣物，只输出 JSON：name,category(top|bottom|outerwear|dress|shoes),color,fit,warmth(light|medium|warm|unknown),material,styleTags,description,warnings。无法判断的文字字段写“不确定”，厚薄写 unknown，不得编造。';
 try { return {...recognitionFields(json(await adapter.complete('recognition',prompt,image,signal))),candidateId:crypto.randomUUID()}; }
 catch(e){if(e instanceof AIError)throw e;throw new AIError('AI_INVALID_RESPONSE','衣物识别结果不符合数据格式。');}
}
export async function analyzeInspiration(image:Blob,signal?:AbortSignal):Promise<InspirationAnalysis>{try{return inspirationSchema.parse(json(await adapter.complete('inspiration','分析穿搭灵感，只输出 JSON：name,tags([{text,kind(color|style|fit|layering|scene)}]),analysis。不要推断用户喜好。',image,signal)));}catch(e){if(e instanceof AIError)throw e;throw new AIError('AI_INVALID_RESPONSE','灵感分析结果不符合数据格式。');}}
export async function recommend(input:{wardrobe:unknown;knowledge:unknown;conditions:unknown;referenceImages?:readonly Blob[]},signal?:AbortSignal):Promise<StructuredRecommendation>{
 const {referenceImages,...modelInput}=input;
 try{return recommendationSchema.parse(json(await adapter.complete('recommendation',`仅根据以下 JSON 输入推荐，返回 garmentIds 和 reason，不得创造衣物。参考图片仅表达本次喜好，图中服饰不能成为候选；只能返回 wardrobe 中的衣物 ID。${JSON.stringify(modelInput)}`,referenceImages,signal)));}
 catch(e){if(e instanceof AIError)throw e;throw new AIError('AI_INVALID_RESPONSE','推荐结果不符合数据格式。');}
}
