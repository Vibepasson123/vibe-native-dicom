import { describe, it, expect } from '@jest/globals';
import {
  pixelDistance,
  distanceMm,
  linearResult,
  angleResult,
  roiRectResult,
  bidirectionalResult,
  cobbResult,
  computeResult,
  formatResult,
} from '../math';
import type {
  AngleMeasurement,
  BidirectionalMeasurement,
  CobbMeasurement,
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

describe('bidirectionalResult', () => {
  it('reports long + short axes and ~0° perpendicularity error for true cross', () => {
    const m: BidirectionalMeasurement = {
      id: 'b1',
      kind: 'bidirectional',
      // Long axis 10 px horizontal, short axis 6 px vertical (perfect cross).
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: -3 },
        { x: 5, y: 3 },
      ],
    };
    const r = bidirectionalResult(m, [1, 1]);
    expect(r.kind).toBe('bidirectional');
    expect(r.longAxis).toBeCloseTo(10, 5);
    expect(r.shortAxis).toBeCloseTo(6, 5);
    expect(r.unit).toBe('mm');
    expect(Math.abs(r.perpendicularityError)).toBeLessThan(0.001);
  });

  it('non-perpendicular axes flag the deviation', () => {
    const m: BidirectionalMeasurement = {
      id: 'b2',
      kind: 'bidirectional',
      // Long axis horizontal, short axis at 45° → 45° off perpendicular.
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ],
    };
    const r = bidirectionalResult(m, null);
    expect(r.unit).toBe('px');
    expect(Math.abs(r.perpendicularityError)).toBeCloseTo(45, 5);
  });

  it('formatResult emits "L × S" with warning when off-perpendicular > 5°', () => {
    const off: BidirectionalMeasurement = {
      id: 'b3',
      kind: 'bidirectional',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ],
    };
    const ok: BidirectionalMeasurement = {
      id: 'b4',
      kind: 'bidirectional',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: -3 },
        { x: 5, y: 3 },
      ],
    };
    const offOut = formatResult(bidirectionalResult(off, [1, 1]));
    const okOut = formatResult(bidirectionalResult(ok, [1, 1]));
    expect(offOut).toContain('×');
    expect(offOut).toContain('off perpendicular');
    expect(okOut).toContain('×');
    expect(okOut).not.toContain('off perpendicular');
  });
});

describe('cobbResult', () => {
  it('two horizontal lines → 0°', () => {
    const m: CobbMeasurement = {
      id: 'c1',
      kind: 'cobb',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 5 },
        { x: 10, y: 5 },
      ],
    };
    expect(cobbResult(m).value).toBeCloseTo(0, 5);
  });
  it('one horizontal + one 45° → 45°', () => {
    const m: CobbMeasurement = {
      id: 'c2',
      kind: 'cobb',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    };
    expect(cobbResult(m).value).toBeCloseTo(45, 5);
  });
  it('reports the acute angle (≤ 90°) regardless of point order', () => {
    const m: CobbMeasurement = {
      id: 'c3',
      kind: 'cobb',
      points: [
        { x: 10, y: 0 }, // first line reversed
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    };
    const r = cobbResult(m);
    expect(r.value).toBeLessThanOrEqual(90);
    expect(r.value).toBeCloseTo(45, 5);
  });
});

describe('computeResult dispatch — phase 4.2', () => {
  it('bidirectional dispatches', () => {
    const m: BidirectionalMeasurement = {
      id: 'd1',
      kind: 'bidirectional',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: -3 },
        { x: 5, y: 3 },
      ],
    };
    expect(computeResult(m, null).kind).toBe('bidirectional');
  });
  it('cobb dispatches', () => {
    const m: CobbMeasurement = {
      id: 'd2',
      kind: 'cobb',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 5 },
        { x: 10, y: 5 },
      ],
    };
    expect(computeResult(m, null).kind).toBe('angle');
  });
});
