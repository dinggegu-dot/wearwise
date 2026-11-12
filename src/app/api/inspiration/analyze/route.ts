import { AIError, aiAvailable, analyzeInspiration } from '@/modules/recognition/infrastructure/ai-provider';
export async function POST(request:Request){
 const requestId=crypto.randomUUID(); const fail=(code:string,message:string,status:number,retryable=status===504)=>Response.json({ok:false,error:{code,message,retryable},requestId},{status});
 if(!aiAvailable())return fail('AI_UNAVAILABLE','AI 服务尚未配置。',503);
 try{const form=await request.formData();const image=form.get('image');if([...form.keys()].some(k=>k!=='image')||!(image instanceof File)||!image.type.startsWith('image/')||!image.size||image.size>4*1024*1024)return fail('VALIDATION_ERROR','请提供不超过 4 MB 的图片。',400);const analysis=await analyzeInspiration(image,request.signal);return Response.json({ok:true,data:analysis,requestId});}
 catch(e){if(e instanceof AIError)return fail(e.code,e.message,e.code==='AI_TIMEOUT'?504:e.code==='AI_UNAVAILABLE'?503:502,e.retryable);return fail('VALIDATION_ERROR','灵感图片分析失败。',400);}
}
