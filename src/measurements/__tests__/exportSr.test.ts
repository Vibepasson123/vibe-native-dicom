import { describe, it, expect } from '@jest/globals';
// Pull from the pure-TS module (no TurboModule import) so the test
// runs in node without mocking the bridge.
import { measurementsToSrLines } from '../srLines';
import type {
  AngleMeasurement,
  BidirectionalMeasurement,
  CobbMeasurement,
  LinearMeasurement,
  Measurement,
  RoiRectMeasurement,
} from '../types';

describe('measurementsToSrLines', () => {
  it('emits one line per measurement, with kind + formatted result + points', () => {
    const linear: LinearMeasurement = {
      id: 'l',
      kind: 'linear',
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
    };
    const angle: AngleMeasurement = {
      id: 'a',
      kind: 'angle',
      points: [
        { x: 1, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 1 },
      ],
    };
    const roi: RoiRectMeasurement = {
      id: 'r',
      kind: 'roi-rect',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ],
    };
    const bidi: BidirectionalMeasurement = {
      id: 'b',
      kind: 'bidirectional',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: -3 },
        { x: 5, y: 3 },
      ],
    };
    const cobb: CobbMeasurement = {
      id: 'c',
      kind: 'cobb',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 5 },
        { x: 10, y: 5 },
      ],
    };
    const all: Measurement[] = [linear, angle, roi, bidi, cobb];
    const lines = measurementsToSrLines(all, [1, 1]);
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('linear:');
    expect(lines[0]).toContain('mm');
    expect(lines[0]).toContain('pts');
    expect(lines[1]).toContain('angle:');
    expect(lines[1]).toContain('deg');
    expect(lines[2]).toContain('roi-rect:');
    expect(lines[2]).toContain('mm²');
    expect(lines[3]).toContain('bidirectional:');
    expect(lines[3]).toContain('×');
    expect(lines[4]).toContain('cobb:');
    expect(lines[4]).toContain('deg');
  });

  it('falls back to px / px² when spacing is null', () => {
    const linear: LinearMeasurement = {
      id: 'l',
      kind: 'linear',
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ],
    };
    const lines = measurementsToSrLines([linear], null);
    expect(lines[0]).toContain('px');
    expect(lines[0]).not.toContain('mm');
  });

  it('serialised points have 2 decimal places', () => {
    const linear: LinearMeasurement = {
      id: 'l',
      kind: 'linear',
      points: [
        { x: 1.234, y: 2.567 },
        { x: 5, y: 6 },
      ],
    };
    const lines = measurementsToSrLines([linear], null);
    expect(lines[0]).toContain('(1.23,2.57)');
    expect(lines[0]).toContain('(5.00,6.00)');
  });
});
