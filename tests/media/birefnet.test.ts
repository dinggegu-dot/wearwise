import { describe, expect, it } from 'vitest';
import { biRefNetAlphaMask, preprocessBiRefNetPixels } from '@/modules/media/birefnet-background-remover';

describe('BiRefNet 512×512 输入输出处理', () => {
  it('按模型预处理器执行 RGB NCHW ImageNet 归一化', () => {
    const rgba = new Uint8ClampedArray(512 * 512 * 4);
    rgba.set([255, 128, 0, 255]);
    const tensor = preprocessBiRefNetPixels(rgba);
    expect(tensor).toHaveLength(3 * 512 * 512);
    expect(tensor[0]).toBeCloseTo((1 - 0.485) / 0.229, 6);
    expect(tensor[512 * 512]).toBeCloseTo((128 / 255 - 0.456) / 0.224, 6);
    expect(tensor[2 * 512 * 512]).toBeCloseTo((0 - 0.406) / 0.225, 6);
    expect(() => preprocessBiRefNetPixels(new Uint8ClampedArray(4))).toThrow('512×512');
  });

  it('将 logits 经 sigmoid 转换为全白 RGB alpha 遮罩', () => {
    const logits = new Float32Array(512 * 512);
    logits[0] = -20; logits[1] = 0; logits[2] = 20;
    const mask = biRefNetAlphaMask(logits);
    expect(mask).toHaveLength(512 * 512 * 4);
    expect(Array.from(mask.slice(0, 4))).toEqual([255, 255, 255, 0]);
    expect(Array.from(mask.slice(4, 8))).toEqual([255, 255, 255, 128]);
    expect(Array.from(mask.slice(8, 12))).toEqual([255, 255, 255, 255]);
    expect(() => biRefNetAlphaMask(new Float32Array(1))).toThrow('512×512');
  });
});
