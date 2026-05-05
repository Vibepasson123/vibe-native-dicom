import { describe, it, expect } from '@jest/globals';
import { canvasToImage } from '../canvasToImage';
import type { ViewerTransform } from '../../viewer/useViewerGestures';

const IDENTITY: ViewerTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
  rotation: 0,
};

describe('canvasToImage', () => {
  it('round trip identity: tap centre → image centre', () => {
    // 256x256 canvas, 16x16 image — 'contain' fits at 16x scale, centred.
    const out = canvasToImage(128, 128, 16, 16, 256, 256, IDENTITY);
    expect(out.x).toBeCloseTo(8, 5);
    expect(out.y).toBeCloseTo(8, 5);
  });

  it('round trip with 2x zoom', () => {
    const out = canvasToImage(128, 128, 16, 16, 256, 256, {
      ...IDENTITY,
      scale: 2,
    });
    // The centre pixel of the image stays mapped to canvas centre.
    expect(out.x).toBeCloseTo(8, 5);
    expect(out.y).toBeCloseTo(8, 5);
  });

  it('round trip with translation', () => {
    const out = canvasToImage(128 + 32, 128, 16, 16, 256, 256, {
      ...IDENTITY,
      translateX: 32,
    });
    // Tapping 32px right of centre while the image is shifted 32px right
    // should still land on the image centre.
    expect(out.x).toBeCloseTo(8, 5);
    expect(out.y).toBeCloseTo(8, 5);
  });

  it('handles zero scale defensively (no NaN)', () => {
    const out = canvasToImage(128, 128, 16, 16, 256, 256, {
      ...IDENTITY,
      scale: 0,
    });
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.y)).toBe(true);
  });
});
