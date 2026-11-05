export type FeedbackChoice = 'like' | 'dislike';
export interface Feedback { outfitId: string; choice: FeedbackChoice; updatedAt: string }
export interface FeedbackRepository { put(feedback: Feedback): Promise<void>; get(outfitId: string): Promise<Feedback | undefined> }
export class FeedbackService {
  constructor(private readonly repository: FeedbackRepository) {}
  set(outfitId: string, choice: FeedbackChoice) { return this.repository.put({ outfitId, choice, updatedAt: new Date().toISOString() }); }
  get(outfitId: string) { return this.repository.get(outfitId); }
}
