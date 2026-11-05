import { z } from 'zod';
import { categorySchema, warmthSchema } from '@/modules/wardrobe';
// 模型候选不包含正式衣物的 ID、状态或时间。
export const recognitionCandidateSchema = z.object({ name: z.string().trim().min(1).max(100), category: categorySchema, color: z.string().trim().min(1).max(50), warmth: warmthSchema, material: z.string().max(100).optional(), styleTags: z.array(z.string().trim().min(1).max(30)).max(20), warnings: z.array(z.string().max(200)).max(10) }).strict();
export type RecognitionCandidate = z.infer<typeof recognitionCandidateSchema> & { candidateId: string };
export interface RecognitionProvider { recognize(image: Blob, signal?: AbortSignal): Promise<RecognitionCandidate> }
export class RecognitionService {
  constructor(private readonly provider: RecognitionProvider) {}
  async recognize(image: Blob, signal?: AbortSignal) {
    const { candidateId, ...fields } = await this.provider.recognize(image, signal);
    return { ...recognitionCandidateSchema.parse(fields), candidateId: z.string().uuid().parse(candidateId) };
  }
}
