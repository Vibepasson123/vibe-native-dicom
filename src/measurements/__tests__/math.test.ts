import { describe, it, expect } from '@jest/globals';
import {
  pixelDistance,
  distanceMm,
  linearResult,
  angleResult,
  roiRectResult,
  computeResult,
  formatResult,
} from '../math';
import type {
  AngleMeasurement,
  LinearMeasurement,
  RoiRectMeasurement,
} from '../types';

describe('pixelDistance', () => {
  it('Pythagoras', () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
  it('zero for coincident points', () => {
    expect(pixelDistance({ x: 7, y: 7 }, { x: 7, y: 7 })).toBe(0);
  });
});

describe('distanceMm', () => {
  it('isotropic 1mm spacing matches pixelDistance', () => {
    expect(distanceMm({ x: 0, y: 0 }, { x: 3, y: 4 }, [1, 1])).toBe(5);
  });
  it('anisotropic spacing scales each axis', () => {
    // 10 px in X with col-spacing 0.5mm = 5mm, 10px in Y with row-spacing
    // 1mm = 10mm. Combined: sqrt(5^2 + 10^2) ≈ 11.18.
    const d = distanceMm({ x: 0, y: 0 }, { x: 10, y: 10 }, [1, 0.5]);
    expect(d).toBeCloseTo(Math.sqrt(125), 5);
  });
});

describe('linearResult', () => {
  const m: LinearMeasurement = {
    id: 'm1',
    kind: 'linear',
    points: [
      { x: 0, y: 0 },
      { x: 6, y: 8 },
    ],
  };
  it('returns mm with spacing', () => {
    expect(linearResult(m, [1, 1])).toEqual({
      kind: 'length',
      value: 10,
      unit: 'mm',
    });
  });
  it('returns px without spacing', () => {
    expect(linearResult(m, null)).toEqual({
      kind: 'length',
      value: 10,
      unit: 'px',
    });
  });
});

describe('angleResult', () => {
  // Vertex at (0,0), one ray at +X, one at +Y → 90°
  const right: AngleMeasurement = {
    id: 'a1',
    kind: 'angle',
    points: [
      { x: 10, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 10 },
    ],
  };
  it('right angle is 90°', () => {
    expect(angleResult(right).value).toBeCloseTo(90, 5);
  });
  it('straight line (180°)', () => {
    const m: AngleMeasurement = {
      id: 'a2',
      kind: 'angle',
      points: [
        { x: -10, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    };
    expect(angleResult(m).value).toBeCloseTo(180, 5);
  });
  it('45° angle', () => {
    const m: AngleMeasurement = {
      id: 'a3',
      kind: 'angle',
      points: [
        { x: 10, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    };
    expect(angleResult(m).value).toBeCloseTo(45, 5);
  });
  it('always returns the |angle| (no negatives)', () => {
    const m: AngleMeasurement = {
      id: 'a4',
      kind: 'angle',
      points: [
        { x: 10, y: 10 }, // mirror of the 45° case across the X axis
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    };
    expect(angleResult(m).value).toBeGreaterThan(0);
  });
});

describe('roiRectResult', () => {
  const r: RoiRectMeasurement = {
    id: 'r1',
    kind: 'roi-rect',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
    ],
  };
  it('area in mm² with spacing', () => {
    // 10 px × 0.5mm = 5mm, 20 px × 1mm = 20mm, area = 100mm²
    const out = roiRectResult(r, [1, 0.5]);
    expect(out).toEqual({ kind: 'area', value: 100, unit: 'mm²' });
  });
  it('area in px² without spacing', () => {
    expect(roiRectResult(r, null)).toEqual({
      kind: 'area',
      value: 200,
      unit: 'px²',
    });
  });
  it('reverse-order points produce the same area', () => {
    const reversed: RoiRectMeasurement = {
      ...r,
      points: [
        { x: 10, y: 20 },
        { x: 0, y: 0 },
      ],
    };
    expect(roiRectResult(reversed, null).value).toBe(200);
  });
});

describe('computeResult dispatch', () => {
  it('dispatches by kind', () => {
    const linear: LinearMeasurement = {
      id: 'l',
      kind: 'linear',
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
    };
    expect(computeResult(linear, null).kind).toBe('length');
    const angle: AngleMeasurement = {
      id: 'a',
      kind: 'angle',
      points: [
        { x: 1, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 1 },
      ],
    };
    expect(computeResult(angle, null).kind).toBe('angle');
    const roi: RoiRectMeasurement = {
      id: 'r',
      kind: 'roi-rect',
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ],
    };
    expect(computeResult(roi, null).kind).toBe('area');
  });
});

describe('formatResult', () => {
  it('integer degrees one decimal', () => {
    expect(formatResult({ kind: 'angle', value: 89.6, unit: 'deg' })).toBe(
      '89.6 deg'
    );
  });
  it('three sig figs for length', () => {
    // floor(log10(12.345)) = 1 → 1 decimal
    expect(formatResult({ kind: 'length', value: 12.345, unit: 'mm' })).toBe(
      '12.3 mm'
    );
    // floor(log10(1.234)) = 0 → 2 decimals
    expect(formatResult({ kind: 'length', value: 1.234, unit: 'mm' })).toBe(
      '1.23 mm'
    );
    // floor(log10(123)) = 2 → 0 decimals (clamped)
    expect(formatResult({ kind: 'length', value: 123, unit: 'mm' })).toBe(
      '123 mm'
    );
  });
  it('handles zero', () => {
    expect(formatResult({ kind: 'length', value: 0, unit: 'mm' })).toBe('0 mm');
  });
  it('handles sub-1 values with extra precision', () => {
    // floor(log10(0.123)) = -1 → 3 decimals
    expect(formatResult({ kind: 'length', value: 0.123, unit: 'mm' })).toBe(
      '0.123 mm'
    );
  });
});
