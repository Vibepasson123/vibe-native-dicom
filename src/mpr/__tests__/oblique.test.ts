import { describe, it, expect } from '@jest/globals';
import { buildObliqueSpec } from '../useObliqueController';
import type { VolumeInfo } from '../types';

const VOLUME: VolumeInfo = {
  handle: 1,
  columns: 64,
  rows: 64,
  depth: 32,
  bitsAllocated: 16,
  pixelRepresentation: 0,
  pixelSpacingRow: 1,
  pixelSpacingCol: 1,
  sliceSpacing: 2,
  photometricInterpretation: 'MONOCHROME2',
};

const TWO_PI = Math.PI * 2;
const closeTo = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const vecCloseTo = (a: [number, number, number], b: [number, number, number]) =>
  closeTo(a[0], b[0]) && closeTo(a[1], b[1]) && closeTo(a[2], b[2]);

describe('buildObliqueSpec', () => {
  it('zero rotation = axial: u=(1,0,0) v=(0,1,0)', () => {
    const spec = buildObliqueSpec(VOLUME, 0, 0, 0);
    expect(vecCloseTo(spec.uMm, [1, 0, 0])).toBe(true);
    expect(vecCloseTo(spec.vMm, [0, 1, 0])).toBe(true);
  });

  it('center is the volume geometric centre in mm', () => {
    const spec = buildObliqueSpec(VOLUME, 0, 0, 0);
    // (columns-1) * colSpacing / 2 = 63 / 2 = 31.5
    expect(spec.centerMm[0]).toBeCloseTo(31.5, 9);
    expect(spec.centerMm[1]).toBeCloseTo(31.5, 9);
    // (depth-1) * sliceSpacing / 2 = 31 * 2 / 2 = 31
    expect(spec.centerMm[2]).toBeCloseTo(31, 9);
  });

  it('basis vectors stay unit-length under arbitrary rotation', () => {
    const spec = buildObliqueSpec(VOLUME, 0.4, -0.7, 1.2);
    const lenU = Math.hypot(spec.uMm[0], spec.uMm[1], spec.uMm[2]);
    const lenV = Math.hypot(spec.vMm[0], spec.vMm[1], spec.vMm[2]);
    expect(lenU).toBeCloseTo(1, 9);
    expect(lenV).toBeCloseTo(1, 9);
  });

  it('basis vectors stay orthogonal under arbitrary rotation', () => {
    const spec = buildObliqueSpec(VOLUME, 0.3, 0.5, -0.8);
    const dot =
      spec.uMm[0] * spec.vMm[0] +
      spec.uMm[1] * spec.vMm[1] +
      spec.uMm[2] * spec.vMm[2];
    expect(dot).toBeCloseTo(0, 9);
  });

  it('Z rotation by 90° rotates u,v in the XY plane', () => {
    const spec = buildObliqueSpec(VOLUME, 0, 0, Math.PI / 2);
    expect(vecCloseTo(spec.uMm, [0, 1, 0])).toBe(true);
    expect(vecCloseTo(spec.vMm, [-1, 0, 0])).toBe(true);
  });

  it('output is square and large enough for the volume diagonal', () => {
    const spec = buildObliqueSpec(VOLUME, 0, 0, 0);
    expect(spec.columns).toBe(spec.rows);
    // Diagonal = sqrt(63^2 + 63^2 + 62^2) ≈ 108.0 mm; pixelSpacing=1 →
    // sideLen ≥ 108.
    expect(spec.columns).toBeGreaterThanOrEqual(108);
  });

  it('pixelSpacingMm = min of input axes', () => {
    const spec = buildObliqueSpec(VOLUME, 0, 0, 0);
    expect(spec.pixelSpacingMm).toBe(1); // min(1, 1, 2)
  });

  it('full-turn rotations leave the basis unchanged (within tolerance)', () => {
    const spec0 = buildObliqueSpec(VOLUME, 0, 0, 0);
    const specTurn = buildObliqueSpec(VOLUME, TWO_PI, TWO_PI, TWO_PI);
    expect(vecCloseTo(spec0.uMm, specTurn.uMm)).toBe(true);
    expect(vecCloseTo(spec0.vMm, specTurn.vMm)).toBe(true);
  });
});
