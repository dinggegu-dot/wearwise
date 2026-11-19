import type { Category, Garment, GarmentInput } from '.';
import { readTags, validateTags, type WardrobeTags } from './tag-adapter';

export const CATEGORY_LABELS = { top: '上衣', bottom: '下装', outerwear: '外套', dress: '连衣裙', shoes: '鞋履' } as const;
export const WARMTH_LABELS = { light: '轻薄', medium: '适中', warm: '保暖', unknown: '不确定' } as const;
export type WardrobeDraft = Omit<GarmentInput, 'sourceType'> & WardrobeTags;
export function blankDraft(category: Category = 'top'): WardrobeDraft {
  return { name: '', category, color: '不确定', fit: '不确定', warmth: 'unknown', material: '不确定', description: '', styleTags: [], sceneTags: [], styleOther: [], sceneOther: [] };
}
export function draftFromGarment(item: Garment): WardrobeDraft {
  return { name: item.name, category: item.category, color: item.color, fit: item.fit, warmth: item.warmth, material: item.material, description: item.description, ...readTags(item) };
}
export function checkedDraft(draft: WardrobeDraft): WardrobeDraft {
  draft = { ...draft, styleOther: draft.styleOther.map(s => s.trim()).filter(Boolean), sceneOther: draft.sceneOther.map(s => s.trim()).filter(Boolean) };
  validateTags(draft);
  if (!draft.name.trim() || draft.name.trim().length > 100) throw new Error('请填写1–100字的衣物名称。');
  if (!draft.color.trim()) throw new Error('请填写颜色，无法判断时写“不确定”。');
  return { ...draft, name: draft.name.trim(), color: draft.color.trim(), fit: draft.fit?.trim() || '不确定' };
}
