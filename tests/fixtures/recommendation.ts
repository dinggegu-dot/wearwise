import type { Garment } from '@/modules/wardrobe';

export function testGarment(id: string, patch: Partial<Garment> = {}): Garment {
  return {
    id, name: '测试衣物', category: 'top', color: '白色', fit: '合身', warmth: 'light',
    material: '棉', styleTags: ['日常'], description: '测试衣物', imageId: `image-${id}`,
    sourceType: 'photo', revision: 1,
    createdAt: '2026-11-10T00:00:00.000Z', updatedAt: '2026-11-10T00:00:00.000Z',
    ...patch,
  };
}
