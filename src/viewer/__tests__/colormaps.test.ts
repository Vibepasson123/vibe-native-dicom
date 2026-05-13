import { describe, it, expect } from '@jest/globals';

import { hot, jet, gray, buildColormapLut } from '../colormaps';

describe('Phase 7.2 — colormaps', () => {
  describe('hot', () => {
    it('starts at black, ends at white', () => {
      expect(hot(0)).toEqual([0, 0, 0]);
      expect(hot(1)).toEqual([1, 1, 1]);
    });
    it('hits pure red at t=0.4', () => {
      const [r, g, b] = hot(0.4);
      expect(r).toBeCloseTo(1, 5);
      expect(g).toBeCloseTo(0, 5);
      expect(b).toBeCloseTo(0, 5);
    });
    it('hits pure yellow at t=0.75', () => {
      const [r, g, b] = hot(0.75);
      expect(r).toBeCloseTo(1, 5);
      expect(g).toBeCloseTo(1, 5);
      expect(b).toBeCloseTo(0, 5);
    });
    it('clamps below 0 and above 1', () => {
      expect(hot(-1)).toEqual([0, 0, 0]);
      expect(hot(99)).toEqual([1, 1, 1]);
    });
  });

  describe('jet', () => {
    it('starts blue-ish and ends red-ish', () => {
      const [, , b0] = jet(0);
      const [r1] = jet(1);
      expect(b0).toBeGreaterThan(0);
      expect(r1).toBeGreaterThan(0);
    });
  });

  describe('gray', () => {
    it('is the identity ramp', () => {
      expect(gray(0)).toEqual([0, 0, 0]);
      expect(gray(0.5)).toEqual([0.5, 0.5, 0.5]);
      expect(gray(1)).toEqual([1, 1, 1]);
    });
  });

  describe('buildColormapLut', () => {
    it('returns 256 RGBA8 entries (1024 bytes)', () => {
      const lut = buildColormapLut('hot');
      expect(lut.length).toBe(256 * 4);
    });
    it('every alpha byte is 255 (opaque)', () => {
      const lut = buildColormapLut('hot');
      for (let i = 0; i < 256; i++) {
        expect(lut[i * 4 + 3]).toBe(255);
      }
    });
    it('hot LUT entry 0 is black and entry 255 is white', () => {
      const lut = buildColormapLut('hot');
      expect([lut[0], lut[1], lut[2]]).toEqual([0, 0, 0]);
      expect([lut[255 * 4], lut[255 * 4 + 1], lut[255 * 4 + 2]]).toEqual([
        255, 255, 255,
      ]);
    });
    it('gray LUT is monotonically increasing across all three channels', () => {
      const lut = buildColormapLut('gray');
      for (let i = 1; i < 256; i++) {
        for (const c of [0, 1, 2]) {
          expect(lut[i * 4 + c]).toBeGreaterThanOrEqual(lut[(i - 1) * 4 + c]!);
        }
      }
    });
  });
});
