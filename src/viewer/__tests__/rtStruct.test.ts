import { describe, it, expect } from '@jest/globals';

import { makeSyntheticCircleContour, pixelToScreen } from '../rtStruct';

describe('Phase 7.4 — RT contour primitives', () => {
  describe('makeSyntheticCircleContour', () => {
    it('returns `segments` points', () => {
      const c = makeSyntheticCircleContour(0, 0, 5, 16);
      expect(c).toHaveLength(16);
    });

    it('every point is on the circle (radius within float tolerance)', () => {
      const c = makeSyntheticCircleContour(10, 20, 5, 32);
      for (const p of c) {
        const dx = p.x - 10;
        const dy = p.y - 20;
        const r = Math.sqrt(dx * dx + dy * dy);
        expect(r).toBeCloseTo(5, 5);
      }
    });

    it('throws if segments < 3 (degenerate polygon)', () => {
      expect(() => makeSyntheticCircleContour(0, 0, 1, 2)).toThrow(/segments/);
    });
  });

  describe('pixelToScreen — fit=contain mapping', () => {
    it('square image → square canvas: pixel (0,0) maps to (0,0)', () => {
      const p = pixelToScreen(0, 0, 16, 16, 256, 256);
      expect(p.x).toBeCloseTo(0, 5);
      expect(p.y).toBeCloseTo(0, 5);
    });

    it('square image → square canvas: image extent maps to canvas extent', () => {
      const p = pixelToScreen(16, 16, 16, 16, 256, 256);
      expect(p.x).toBeCloseTo(256, 5);
      expect(p.y).toBeCloseTo(256, 5);
    });

    it('image wider than canvas (aspect mismatch) → letterboxed top/bottom', () => {
      // 32x16 image into 256x256 canvas: drawW=256, drawH=128, offsetY=64
      const top = pixelToScreen(0, 0, 32, 16, 256, 256);
      expect(top.x).toBeCloseTo(0, 5);
      expect(top.y).toBeCloseTo(64, 5);
      const bot = pixelToScreen(32, 16, 32, 16, 256, 256);
      expect(bot.x).toBeCloseTo(256, 5);
      expect(bot.y).toBeCloseTo(64 + 128, 5);
    });

    it('image taller than canvas → letterboxed left/right', () => {
      // 16x32 image into 256x256 canvas: drawH=256, drawW=128, offsetX=64
      const left = pixelToScreen(0, 0, 16, 32, 256, 256);
      expect(left.x).toBeCloseTo(64, 5);
      expect(left.y).toBeCloseTo(0, 5);
      const right = pixelToScreen(16, 32, 16, 32, 256, 256);
      expect(right.x).toBeCloseTo(64 + 128, 5);
      expect(right.y).toBeCloseTo(256, 5);
    });

    it('image centre always maps to canvas centre', () => {
      const a = pixelToScreen(16, 16, 32, 32, 200, 200);
      expect(a.x).toBeCloseTo(100, 5);
      expect(a.y).toBeCloseTo(100, 5);
      // Asymmetric — centre still maps to canvas centre.
      const b = pixelToScreen(16, 8, 32, 16, 256, 256);
      expect(b.x).toBeCloseTo(128, 5);
      expect(b.y).toBeCloseTo(128, 5);
    });
  });
});
