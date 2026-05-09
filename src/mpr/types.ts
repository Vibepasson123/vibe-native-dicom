// Phase 5.1 — public types for orthogonal MPR.
//
// A volume is represented opaquely by `VolumeInfo.handle`. Consumers
// pass the handle back to `extractMprSlice` + `releaseVolume`. The
// underlying pixel buffer never crosses the JS bridge — slices land
// on disk via `extractMprSlice(...).filePath` and feed straight into
// the existing Phase 3.2 Skia viewer.

export type MprPlane = 'axial' | 'sagittal' | 'coronal';

/**
 * Phase 5.2 — options for buildVolumeFromDicoms.
 */
export type BuildVolumeOptions = {
  /**
   * Trilinear-along-Z resample to a uniform grid when the input series
   * has >5% Δz deviation. Default false: non-uniform input throws (Phase
   * 5.1 behaviour).
   */
  resampleNonUniformZ?: boolean;
};

export type VolumeInfo = {
  /** Stable handle returned by `buildVolumeFromDicoms`. Pass to slice
   *  extractors and to `releaseVolume`. */
  handle: number;
  /** X-axis size — same for every input slice. */
  columns: number;
  /** Y-axis size — same for every input slice. */
  rows: number;
  /** Z-axis size — count of input DICOMs. */
  depth: number;
  /** 8 or 16. */
  bitsAllocated: number;
  /** 0 unsigned, 1 signed. */
  pixelRepresentation: number;
  /** PixelSpacing[0] — Y-axis spacing in mm. */
  pixelSpacingRow: number;
  /** PixelSpacing[1] — X-axis spacing in mm. */
  pixelSpacingCol: number;
  /** Mean spacing along Z in mm; non-uniform series throw at build time. */
  sliceSpacing: number;
  /** Photometric interpretation propagated from the first slice. */
  photometricInterpretation: string;
};

export type MprSliceInfo = {
  /** File written by `extractMprSlice` containing raw pixels (same
   *  byte layout as `extractPixelDataToFile`). */
  filePath: string;
  byteLength: number;
  rows: number;
  columns: number;
  bitsAllocated: number;
  pixelRepresentation: number;
  /** Per-slice pixel spacing — DIFFERENT per plane:
   *    axial:    [pixelSpacingRow, pixelSpacingCol]
   *    sagittal: [pixelSpacingRow, sliceSpacing]
   *    coronal:  [sliceSpacing,   pixelSpacingCol]
   *  Important for measurements made on reformats — the renderer
   *  applies these to render mm-accurately. */
  pixelSpacingRow: number;
  pixelSpacingCol: number;
};
