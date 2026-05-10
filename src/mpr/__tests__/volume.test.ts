import { describe, it, expect, jest } from '@jest/globals';

// Mock the TurboModule the same way the existing index test does, so
// the .native variant resolves cleanly under node.
jest.mock('../../NativeVibeNativeDicom', () => ({
  __esModule: true,
  default: {
    buildVolumeFromDicoms: (
      pathsJson: string,
      resampleNonUniformZ: boolean
    ) => {
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
        // round-trip the resample flag so the test can assert it survives.
        _resampleArg: resampleNonUniformZ,
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
    extractObliqueSlice: (
      _handle: number,
      specJson: string,
      outPath: string
    ) => {
      const spec = JSON.parse(specJson);
      return {
        filePath: outPath,
        byteLength: spec.rows * spec.columns,
        rows: spec.rows,
        columns: spec.columns,
        bitsAllocated: 8,
        pixelRepresentation: 0,
        pixelSpacingRow: spec.pixelSpacingMm,
        pixelSpacingCol: spec.pixelSpacingMm,
      };
    },
    extractProjectionSlab: (
      _handle: number,
      specJson: string,
      slabThicknessMm: number,
      stepMm: number,
      mode: number,
      outPath: string
    ) => {
      const spec = JSON.parse(specJson);
      return {
        filePath: outPath,
        byteLength: spec.rows * spec.columns,
        rows: spec.rows,
        columns: spec.columns,
        bitsAllocated: 8,
        pixelRepresentation: 0,
        pixelSpacingRow: spec.pixelSpacingMm,
        pixelSpacingCol: spec.pixelSpacingMm,
        // Round-trip the args for the test to assert.
        _slabThicknessMm: slabThicknessMm,
        _stepMm: stepMm,
        _mode: mode,
      };
    },
    writeSyntheticVolumeSeries: (
      outDir: string,
      n: number,
      _spacing: number,
      _transferSyntaxUID: string,
      _gappedZ: boolean
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
  extractObliqueSlice,
  extractProjectionSlab,
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

  it('buildVolumeFromDicoms forwards Phase 5.2 resampleNonUniformZ option', () => {
    const v0 = buildVolumeFromDicoms(['/tmp/a.dcm']);
    const v1 = buildVolumeFromDicoms(['/tmp/a.dcm'], {
      resampleNonUniformZ: true,
    });
    expect((v0 as unknown as { _resampleArg: boolean })._resampleArg).toBe(
      false
    );
    expect((v1 as unknown as { _resampleArg: boolean })._resampleArg).toBe(
      true
    );
  });

  it('extractObliqueSlice serialises ObliqueSpec to JSON for the bridge', () => {
    const slice = extractObliqueSlice(
      42,
      {
        centerMm: [10, 20, 30],
        uMm: [1, 0, 0],
        vMm: [0, 1, 0],
        columns: 64,
        rows: 64,
        pixelSpacingMm: 0.5,
      },
      '/tmp/oblique.bin'
    );
    expect(slice.filePath).toBe('/tmp/oblique.bin');
    expect(slice.rows).toBe(64);
    expect(slice.columns).toBe(64);
    expect(slice.pixelSpacingRow).toBe(0.5);
    expect(slice.pixelSpacingCol).toBe(0.5);
  });

  it('extractProjectionSlab maps mode string → int and forwards slab/step args', () => {
    const spec = {
      centerMm: [0, 0, 0] as [number, number, number],
      uMm: [1, 0, 0] as [number, number, number],
      vMm: [0, 1, 0] as [number, number, number],
      columns: 32,
      rows: 32,
      pixelSpacingMm: 0.5,
    };
    const mip = extractProjectionSlab(
      42,
      spec,
      { slabThicknessMm: 10, stepMm: 0.5, mode: 'mip' },
      '/tmp/mip.bin'
    );
    expect((mip as unknown as { _mode: number })._mode).toBe(0);
    expect(
      (mip as unknown as { _slabThicknessMm: number })._slabThicknessMm
    ).toBe(10);
    expect((mip as unknown as { _stepMm: number })._stepMm).toBe(0.5);

    const minip = extractProjectionSlab(
      42,
      spec,
      { slabThicknessMm: 10, mode: 'minip' },
      '/tmp/minip.bin'
    );
    expect((minip as unknown as { _mode: number })._mode).toBe(1);
    expect((minip as unknown as { _stepMm: number })._stepMm).toBe(0); // default

    const avg = extractProjectionSlab(
      42,
      spec,
      { slabThicknessMm: 10, mode: 'average' },
      '/tmp/avg.bin'
    );
    expect((avg as unknown as { _mode: number })._mode).toBe(2);
  });

  it('writeSyntheticVolumeSeries accepts Phase 5.2 options', () => {
    const paths = writeSyntheticVolumeSeries('/tmp', 4, 1.5, {
      transferSyntaxUID: '1.2.840.10008.1.2.4.70',
      gappedZ: true,
    });
    expect(paths).toHaveLength(4);
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
