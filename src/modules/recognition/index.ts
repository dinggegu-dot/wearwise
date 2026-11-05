import { z } from 'zod';
import { categorySchema, warmthSchema } from '@/modules/wardrobe';
// 候选不包含正式衣物的 ID、状态或时间。
export const recognitionCandidateSchema = z.object({ name: z.string().trim().min(1).max(100), category: categorySchema, color: z.string().trim().min(1).max(50), warmth: warmthSchema, styleTags: z.array(z.string().trim().min(1).max(30)).max(20) }).strict();
export type RecognitionCandidate = z.infer<typeof recognitionCandidateSchema>;
export interface RecognitionProvider { recognize(image: Blob): Promise<RecognitionCandidate> }
export class RecognitionService {
  constructor(private readonly provider: RecognitionProvider) {}
  async recognize(image: Blob) { return recognitionCandidateSchema.parse(await this.provider.recognize(image)); }
}
