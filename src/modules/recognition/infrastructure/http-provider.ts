import { z } from 'zod';
import { recognitionCandidateSchema, type RecognitionCandidate, type RecognitionProvider } from '@/modules/recognition';
const candidateSchema = recognitionCandidateSchema.extend({candidateId:z.string().uuid()});
const capabilitySchema = z.object({recognition:z.object({available:z.boolean()})});
const successSchema = z.object({ok:z.literal(true),data:z.object({candidate:candidateSchema})});
export class UnavailableRecognitionProvider implements RecognitionProvider {
  async recognize(): Promise<RecognitionCandidate> { throw new Error('图片识别暂不可用，请手动填写。'); }
}
export class HttpRecognitionProvider implements RecognitionProvider {
  async recognize(image: Blob, signal?: AbortSignal): Promise<RecognitionCandidate> {
    const capability = await fetch('/api/capabilities',{signal});
    if (!capability.ok || !capabilitySchema.parse(await capability.json()).recognition.available) throw new Error('图片识别暂未配置，请手动填写。');
    const form = new FormData(); form.set('image',image,'garment.jpg');
    const response = await fetch('/api/recognition',{method:'POST',body:form,signal});
    const body:unknown = await response.json();
    if (!response.ok) {
      const failure=z.object({error:z.object({message:z.string().max(200)})}).safeParse(body);
      throw new Error(failure.success ? failure.data.error.message : '图片识别失败，请手动填写。');
    }
    return successSchema.parse(body).data.candidate;
  }
}
