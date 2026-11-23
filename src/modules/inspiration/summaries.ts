import type { Inspiration } from '@/modules/inspiration';
import type { SummaryCandidate } from '@/modules/preferences';

// Only explicit statements in the user's confirmed analysis become long-term preferences.
// The photo, title and visual tags provide no evidence of what the user likes.
export function summarizeInspirations(items: Pick<Inspiration, 'id' | 'analysis'>[]): SummaryCandidate[] {
  const byKey = new Map<string, SummaryCandidate>();
  for (const item of items) {
    const clauses = item.analysis.split(/[。；;，,]|但|不过/).map(value => value.trim()).filter(Boolean);
    for (const clause of clauses) {
      const match = clause.match(/(?:^|我|自己|个人)(不喜欢|不想要|喜欢|偏爱)(.+)$/);
      if (!match) continue;
      const negative = match[1] === '不喜欢' || match[1] === '不想要';
      for (const raw of match[2].split(/(?:和|以及|、)/)) {
        const subject = raw.trim().replace(/^(?:这种|这样的|这类)/, '').replace(/(?:的搭配|的穿搭)$/, '').trim();
        if (!subject || subject.length > 80) continue;
        const normalized = subject.replace(/\s+/g, '').replace(/灰白色?搭配|灰白色?配色/g, '灰白配色');
        const key = `${negative ? 'dislike' : 'like'}:${normalized}`;
        const existing = byKey.get(key);
        if (existing) {
          if (!existing.sourceIds.includes(item.id)) existing.sourceIds.push(item.id);
        } else {
          byKey.set(key, { key, content: `${negative ? '不喜欢' : '喜欢'}${subject}`, sourceIds: [item.id] });
        }
      }
    }
  }
  return [...byKey.values()];
}
