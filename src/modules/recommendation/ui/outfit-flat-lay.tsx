
'use client';

import type { OutfitResult } from '@/modules/session';
import type { GarmentSnapshot } from '@/modules/session';
import { OutfitImage } from './outfit-image';

type LoadImage = (id: string) => Promise<Blob | undefined>;

export function OutfitFlatLay({
  result,
  load
}: {
  result: OutfitResult;
  load: LoadImage;
}) {
  const snapshotMap = new Map(
    result.snapshots.map(item => [item.id, item])
  );

  // 按平铺层级排序，保证叠穿顺序稳定。
  const items = [...result.flatLay]
    .sort((a, b) => a.layer - b.layer)
    .map(slot => ({
      slot,
      garment: snapshotMap.get(slot.garmentId)
    }))
    .filter(
      (item): item is {
        slot: typeof result.flatLay[number];
        garment: GarmentSnapshot;
      } => !!item.garment
    );

  return (
    <section className="outfit-flatlay">
      <div className="outfit-flatlay-heading">
        <h3>本套穿搭</h3>
        <span>{items.length} 件单品</span>
      </div>

      <div className="outfit-flatlay-stage"
        data-outfit-type={items.some(item => item.slot.slot === 'dress') ? 'dress' : 'separates'}
        data-has-outerwear={items.some(item => item.slot.slot === 'outerwear')}>
        {items.map(({ slot, garment }) => (
          <div
            key={slot.garmentId}
            className={`outfit-flatlay-item slot-${slot.slot}`}
            style={{ zIndex: slot.layer + 1 }}
          >
            <OutfitImage
              item={garment}
              load={load}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
