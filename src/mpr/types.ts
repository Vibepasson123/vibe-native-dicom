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

/**
 * Phase 5.3 — oblique slice plane spec.
 *
 * The plane is defined by a center point in volume mm-coords + two
 * orthonormal in-plane basis vectors. The volume's lower-left-near
 * corner is at (0,0,0); the far corner at
 * ((columns-1)*pixelSpacingCol, (rows-1)*pixelSpacingRow,
 *  (depth-1)*sliceSpacing).
 *
 * `u` is the output column axis (X in the output), `v` is the output
 * row axis (Y). They MUST be unit-length and mutually orthogonal —
 * non-orthonormal bases produce a sheared output without warning.
 *
 * Output dimensions and `pixelSpacingMm` are caller-chosen. A common
 * pattern: pixelSpacingMm = min of the volume's three axis spacings;
 * columns = rows = ceil(volume diagonal / pixelSpacingMm) so the
 * whole volume fits regardless of plane orientation.
 */
export type ObliqueSpec = {
  /** Center of the output slice in volume mm-coords. */
  centerMm: [number, number, number];
  /** Output column axis (unit vector in volume mm-coords). */
  uMm: [number, number, number];
  /** Output row axis (unit vector in volume mm-coords). */
  vMm: [number, number, number];
  columns: number;
  rows: number;
  /** Output pixel size in mm (uniform). */
  pixelSpacingMm: number;
};

/**
 * Phase 6.1 — slab projection mode.
 *   'mip'     — Maximum Intensity Projection (vessels, bone)
 *   'minip'   — Minimum Intensity Projection (airways, lungs)
 *   'average' — Mean along ray (X-ray-like reconstruction)
 */
export type ProjectionMode = 'mip' | 'minip' | 'average';

/**
 * Phase 6.1 — slab projection options. The plane is defined by the
 * supplied ObliqueSpec; the slab spans `slabThicknessMm` along the
 * plane normal, centred on the plane.
 */
export type ProjectionOptions = {
  /** mm along the plane normal. Pass 0 for single-sample-per-ray (= oblique slice). */
  slabThicknessMm: number;
  /** Sample spacing along the ray in mm. Pass 0 for the volume's smallest axis spacing. */
  stepMm?: number;
  mode: ProjectionMode;
};

/**
 * Phase 6.2 — transfer-function control point. R/G/B/opacity are in
 * [0, 1]. `value` is in the input domain (same units as window/level).
 */
export type TransferFunctionPoint = {
  value: number;
  r: number;
  g: number;
  b: number;
  opacity: number;
};

export type TransferFunction = {
  /** Sorted by `value` ascending. Must contain ≥ 2 points. */
  points: TransferFunctionPoint[];
};

export type VolumeRenderOptions = {
  slabThicknessMm: number;
  stepMm?: number;
  transferFunction: TransferFunction;
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
  /** Phase 6.2 — 1 for grayscale (default), 4 for RGBA8 (volume
   *  render output). Viewer routes to the colour path when 4. */
  samplesPerPixel?: number;
};
