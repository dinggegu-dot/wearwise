
'use client';

import type { OutfitResult } from '@/modules/session';
import { OutfitImage } from './outfit-image';

type LoadImage = (id: string) => Promise<Blob | undefined>;

const CATEGORY_LABELS: Record<string, string> = {
  top: '上衣',
  bottom: '下装',
  outerwear: '外套',
  dress: '连衣裙',
  shoes: '鞋履'
};

/**
 * 首页与推荐页共用的单品清单组件。
 *
 * 只负责展示衣物快照和提供操作入口。
 * 不读取 Session，不直接调用 AI，不保存推荐结果。
 *
 * onSwapItem 未提供时，仅展示单品清单。
 * onSwapItem 已提供时，展示单件替换按钮。
 */
export interface OutfitGarmentListProps {
  result: OutfitResult;

  load: LoadImage;

  onSwapItem?: (id: string) => void;

  disabled?: boolean;

  swappingGarmentId?: string | null;

  title?: string;
}

export function OutfitGarmentList({
  result,
  load,
  onSwapItem,
  disabled = false,
  swappingGarmentId = null,
  title = '本套单品清单'
}: OutfitGarmentListProps) {
  const swapping = swappingGarmentId !== null;

  return (
    <section
      className="outfit-garment-list"
      aria-busy={swapping}
    >
      <h3>{title}</h3>

      <div className="outfit-garment-grid">
        {result.snapshots.map(item => {
          const isSwapping =
            swappingGarmentId === item.id;

          return (
            <article
              className="outfit-garment-card"
              key={item.id}
            >
              <OutfitImage
                item={item}
                load={load}
              />

              <div className="outfit-garment-info">
                <strong>{item.name}</strong>

                <span>
                  {CATEGORY_LABELS[item.category]
                    ?? item.category}
                </span>

                <span>{item.color}</span>

                {onSwapItem && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={disabled || swapping}
                    aria-label={`换掉${item.name}`}
                    onClick={() => onSwapItem(item.id)}
                  >
                    {isSwapping
                      ? '替换中…'
                      : '换掉这件'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
