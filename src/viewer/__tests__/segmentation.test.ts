import { describe, it, expect } from '@jest/globals';

import {
  buildSegmentPalette,
  makeSyntheticDiscLabelMap,
} from '../segmentation';

describe('Phase 7.3 — segmentation primitives', () => {
  describe('buildSegmentPalette', () => {
    it('returns a 256-entry RGBA8 LUT (1024 bytes)', () => {
      const lut = buildSegmentPalette([]);
      expect(lut.length).toBe(256 * 4);
    });

    it('leaves background (id=0) fully transparent regardless of input', () => {
      const lut = buildSegmentPalette([
        { id: 0, label: 'sneaky', r: 1, g: 1, b: 1, opacity: 1 },
      ]);
      expect(lut[0]).toBe(0);
      expect(lut[1]).toBe(0);
      expect(lut[2]).toBe(0);
      expect(lut[3]).toBe(0);
    });

    it('writes RGB and alpha for valid segment IDs', () => {
      const lut = buildSegmentPalette([
        { id: 1, label: 'liver', r: 1, g: 0, b: 0, opacity: 0.5 },
        { id: 7, label: 'lesion', r: 0, g: 1, b: 0 },
      ]);
      expect([lut[4], lut[5], lut[6], lut[7]]).toEqual([
        255,
        0,
        0,
        Math.round(0.5 * 255),
      ]);
      // No `opacity` → defaults to 1 (255).
      expect([
        lut[7 * 4],
        lut[7 * 4 + 1],
        lut[7 * 4 + 2],
        lut[7 * 4 + 3],
      ]).toEqual([0, 255, 0, 255]);
    });

    it('clamps r/g/b/opacity to [0, 1]', () => {
      const lut = buildSegmentPalette([
        { id: 3, label: 'x', r: 99, g: -5, b: 0.5, opacity: 99 },
      ]);
      expect(lut[12]).toBe(255);
      expect(lut[13]).toBe(0);
      expect(lut[14]).toBe(Math.round(0.5 * 255));
      expect(lut[15]).toBe(255);
    });

    it('ignores out-of-range IDs (<=0 or >255) silently', () => {
      const lut = buildSegmentPalette([
        { id: -1, label: 'a', r: 1, g: 1, b: 1 },
        { id: 256, label: 'b', r: 1, g: 1, b: 1 },
      ]);
      // Nothing written outside index 0 (background); LUT is all zeros.
      expect(lut.every((v) => v === 0)).toBe(true);
    });
  });

  describe('makeSyntheticDiscLabelMap', () => {
    it('returns a rows*columns byte buffer', () => {
      const lm = makeSyntheticDiscLabelMap(16, 16, 1);
      expect(lm.length).toBe(16 * 16);
    });

    it('paints the centre pixel with the requested ID', () => {
      const lm = makeSyntheticDiscLabelMap(16, 16, 9);
      expect(lm[8 * 16 + 8]).toBe(9);
    });

    it('leaves corners as background', () => {
      const lm = makeSyntheticDiscLabelMap(16, 16, 1, 0.3);
      expect(lm[0]).toBe(0);
      expect(lm[15]).toBe(0);
      expect(lm[15 * 16]).toBe(0);
      expect(lm[15 * 16 + 15]).toBe(0);
    });

    it('a larger radiusFraction yields more covered pixels', () => {
      const small = makeSyntheticDiscLabelMap(32, 32, 1, 0.2);
      const big = makeSyntheticDiscLabelMap(32, 32, 1, 0.4);
      const count = (arr: Uint8Array) =>
        arr.reduce((acc, v) => acc + (v ? 1 : 0), 0);
      expect(count(big)).toBeGreaterThan(count(small));
    });
  });
});
