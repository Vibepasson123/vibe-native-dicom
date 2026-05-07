import { describe, it, expect, jest } from '@jest/globals';

// Mock the TurboModule the same way the existing index test does, so
// the .native variant resolves cleanly under node.
jest.mock('../../NativeVibeNativeDicom', () => ({
  __esModule: true,
  default: {
    buildVolumeFromDicoms: (pathsJson: string) => {
      const arr = JSON.parse(pathsJson);
      return {
        handle: 42,
        columns: 16,
        rows: 16,
        depth: arr.length,
        bitsAllocated: 8,
        pixelRepresentation: 0,
        pixelSpacingRow: 1,
        pixelSpacingCol: 1,
        sliceSpacing: 2,
        photometricInterpretation: 'MONOCHROME2',
      };
    },
    extractMprSlice: (
      _h: number,
      plane: number,
      index: number,
      outPath: string
    ) => ({
      filePath: outPath,
      byteLength: 256,
      rows: plane === 0 ? 16 : plane === 1 ? 16 : 8,
      columns: plane === 0 ? 16 : plane === 1 ? 8 : 16,
      bitsAllocated: 8,
      pixelRepresentation: 0,
      pixelSpacingRow: 1,
      pixelSpacingCol: plane === 1 ? 2 : 1,
      _index: index, // marker for assertion
    }),
    releaseVolume: () => undefined,
    writeSyntheticVolumeSeries: (
      outDir: string,
      n: number,
      _spacing: number
    ) => {
      const arr: string[] = [];
      for (let i = 0; i < n; i++) {
        arr.push(`${outDir}/vnd-vol-${String(i).padStart(3, '0')}.dcm`);
      }
      return JSON.stringify(arr);
    },
  },
}));

import {
  buildVolumeFromDicoms,
  extractMprSlice,
  releaseVolume,
  writeSyntheticVolumeSeries,
} from '../volume.native';

describe('Phase 5.1 — volume / MPR bridge', () => {
  it('buildVolumeFromDicoms returns the documented VolumeInfo shape', () => {
    const v = buildVolumeFromDicoms(['/tmp/a.dcm', '/tmp/b.dcm', '/tmp/c.dcm']);
    expect(v.handle).toBe(42);
    expect(v.depth).toBe(3);
    expect(v.bitsAllocated).toBe(8);
    expect(v.sliceSpacing).toBe(2);
  });

  it('extractMprSlice maps plane string → int and round-trips MprSliceInfo', () => {
    const a = extractMprSlice(42, 'axial', 4, '/tmp/a.bin');
    expect(a.filePath).toBe('/tmp/a.bin');
    expect(a.rows).toBe(16);
    expect(a.columns).toBe(16);

    const s = extractMprSlice(42, 'sagittal', 8, '/tmp/s.bin');
    expect(s.rows).toBe(16);
    expect(s.columns).toBe(8);
    expect(s.pixelSpacingCol).toBe(2); // sliceSpacing on sagittal column axis

    const c = extractMprSlice(42, 'coronal', 7, '/tmp/c.bin');
    expect(c.rows).toBe(8);
    expect(c.columns).toBe(16);
  });

  it('releaseVolume is a no-op (no exception on unknown handle)', () => {
    expect(() => releaseVolume(999)).not.toThrow();
  });

  it('writeSyntheticVolumeSeries returns N paths in series order', () => {
    const paths = writeSyntheticVolumeSeries('/tmp', 4, 1.5);
    expect(paths).toHaveLength(4);
    expect(paths[0]).toBe('/tmp/vnd-vol-000.dcm');
    expect(paths[3]).toBe('/tmp/vnd-vol-003.dcm');
  });
});
