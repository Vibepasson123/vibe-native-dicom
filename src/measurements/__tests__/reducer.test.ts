import { describe, it, expect } from '@jest/globals';
import { reducer as measurementsReducer } from '../useMeasurementsReducer';
import type { ImagePoint, Measurement, MeasurementToolKind } from '../types';

type State = {
  measurements: Measurement[];
  tool: MeasurementToolKind | null;
  draft: { kind: MeasurementToolKind; points: ImagePoint[] } | null;
  seq: number;
};

const INITIAL: State = {
  measurements: [],
  tool: null,
  draft: null,
  seq: 0,
};

const p = (x: number, y: number): ImagePoint => ({ x, y });

describe('measurements reducer', () => {
  it('select-tool sets the active tool and clears any draft', () => {
    const s1 = measurementsReducer(INITIAL, {
      type: 'select-tool',
      tool: 'linear',
    });
    expect(s1.tool).toBe('linear');
    expect(s1.draft).toBeNull();
  });

  it('add-point with no tool is a no-op', () => {
    const s = measurementsReducer(INITIAL, {
      type: 'add-point',
      point: p(1, 2),
    });
    expect(s).toBe(INITIAL);
  });

  it('linear tool commits after 2 points', () => {
    const s1 = measurementsReducer(INITIAL, {
      type: 'select-tool',
      tool: 'linear',
    });
    const s2 = measurementsReducer(s1, { type: 'add-point', point: p(0, 0) });
    expect(s2.draft?.points).toHaveLength(1);
    expect(s2.measurements).toHaveLength(0);
    const s3 = measurementsReducer(s2, { type: 'add-point', point: p(3, 4) });
    expect(s3.draft).toBeNull();
    expect(s3.measurements).toHaveLength(1);
    expect(s3.measurements[0]?.kind).toBe('linear');
    expect(s3.tool).toBe('linear'); // tool stays active for next placement
  });

  it('angle tool commits after 3 points', () => {
    let s = measurementsReducer(INITIAL, {
      type: 'select-tool',
      tool: 'angle',
    });
    s = measurementsReducer(s, { type: 'add-point', point: p(1, 0) });
    s = measurementsReducer(s, { type: 'add-point', point: p(0, 0) });
    expect(s.measurements).toHaveLength(0);
    s = measurementsReducer(s, { type: 'add-point', point: p(0, 1) });
    expect(s.measurements).toHaveLength(1);
    expect(s.measurements[0]?.kind).toBe('angle');
  });

  it('bidirectional commits after 4 points', () => {
    let s = measurementsReducer(INITIAL, {
      type: 'select-tool',
      tool: 'bidirectional',
    });
    s = measurementsReducer(s, { type: 'add-point', point: p(0, 0) });
    s = measurementsReducer(s, { type: 'add-point', point: p(10, 0) });
    s = measurementsReducer(s, { type: 'add-point', point: p(5, -3) });
    expect(s.measurements).toHaveLength(0);
    s = measurementsReducer(s, { type: 'add-point', point: p(5, 3) });
    expect(s.measurements).toHaveLength(1);
    expect(s.measurements[0]?.kind).toBe('bidirectional');
  });

  it('cobb commits after 4 points', () => {
    let s = measurementsReducer(INITIAL, {
      type: 'select-tool',
      tool: 'cobb',
    });
    s = measurementsReducer(s, { type: 'add-point', point: p(0, 0) });
    s = measurementsReducer(s, { type: 'add-point', point: p(10, 0) });
    s = measurementsReducer(s, { type: 'add-point', point: p(0, 5) });
    expect(s.measurements).toHaveLength(0);
    s = measurementsReducer(s, { type: 'add-point', point: p(10, 5) });
    expect(s.measurements).toHaveLength(1);
    expect(s.measurements[0]?.kind).toBe('cobb');
  });

  it('roi-rect commits after 2 points', () => {
    let s = measurementsReducer(INITIAL, {
      type: 'select-tool',
      tool: 'roi-rect',
    });
    s = measurementsReducer(s, { type: 'add-point', point: p(0, 0) });
    s = measurementsReducer(s, { type: 'add-point', point: p(10, 10) });
    expect(s.measurements).toHaveLength(1);
    expect(s.measurements[0]?.kind).toBe('roi-rect');
  });

  it('switching tool mid-draft cancels in-progress points', () => {
    let s = measurementsReducer(INITIAL, {
      type: 'select-tool',
      tool: 'angle',
    });
    s = measurementsReducer(s, { type: 'add-point', point: p(1, 0) });
    s = measurementsReducer(s, { type: 'add-point', point: p(0, 0) });
    s = measurementsReducer(s, { type: 'select-tool', tool: 'linear' });
    expect(s.draft).toBeNull();
    expect(s.tool).toBe('linear');
  });

  it('cancel-draft drops in-progress points but keeps tool', () => {
    let s = measurementsReducer(INITIAL, {
      type: 'select-tool',
      tool: 'angle',
    });
    s = measurementsReducer(s, { type: 'add-point', point: p(1, 0) });
    s = measurementsReducer(s, { type: 'cancel-draft' });
    expect(s.draft).toBeNull();
    expect(s.tool).toBe('angle');
  });

  it('remove deletes by id', () => {
    let s = measurementsReducer(INITIAL, {
      type: 'select-tool',
      tool: 'linear',
    });
    s = measurementsReducer(s, { type: 'add-point', point: p(0, 0) });
    s = measurementsReducer(s, { type: 'add-point', point: p(3, 4) });
    const id = s.measurements[0]!.id;
    s = measurementsReducer(s, { type: 'remove', id });
    expect(s.measurements).toHaveLength(0);
  });

  it('clear-all wipes both committed + draft', () => {
    let s = measurementsReducer(INITIAL, {
      type: 'select-tool',
      tool: 'linear',
    });
    s = measurementsReducer(s, { type: 'add-point', point: p(0, 0) });
    s = measurementsReducer(s, { type: 'add-point', point: p(1, 1) });
    s = measurementsReducer(s, { type: 'add-point', point: p(2, 2) });
    expect(s.measurements).toHaveLength(1);
    expect(s.draft?.points).toHaveLength(1);
    s = measurementsReducer(s, { type: 'clear-all' });
    expect(s.measurements).toHaveLength(0);
    expect(s.draft).toBeNull();
    expect(s.tool).toBe('linear'); // clear-all keeps the tool
  });

  it('IDs are unique and monotonic', () => {
    let s = measurementsReducer(INITIAL, {
      type: 'select-tool',
      tool: 'linear',
    });
    s = measurementsReducer(s, { type: 'add-point', point: p(0, 0) });
    s = measurementsReducer(s, { type: 'add-point', point: p(1, 1) });
    s = measurementsReducer(s, { type: 'add-point', point: p(2, 2) });
    s = measurementsReducer(s, { type: 'add-point', point: p(3, 3) });
    expect(s.measurements.map((m) => m.id)).toEqual(['m-1', 'm-2']);
  });
});
