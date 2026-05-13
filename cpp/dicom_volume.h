// Phase 5.1 — Volume building + orthogonal MPR slicing.
//
// A "volume" here is a contiguous 3D pixel buffer assembled from a stack
// of co-aligned 2D DICOM slices. Once built, axial / sagittal / coronal
// slices can be extracted as regular 2D pixel buffers and fed through
// the existing Phase 3.2 Skia viewer.
//
// Volumes are managed by an opaque integer handle — we don't expose the
// underlying buffer through the JS bridge, only paths to extracted
// slices. This keeps the JS heap bounded for clinical CTs (a 512×512×500
// CT is 256 MB at 16-bit) and re-uses the file-path pixel ingress path
// that's already proven on the rendering side.

#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace vnd {

enum class MprPlane : int {
  Axial = 0,     // X-Y plane, scrolls through Z (the original slice axis)
  Sagittal = 1,  // Y-Z plane, scrolls through X (left ↔ right)
  Coronal = 2,   // X-Z plane, scrolls through Y (front ↔ back)
};

/**
 * Public-facing volume metadata. Returned by getVolumeInfo() so JS can
 * dimension viewer UIs without holding the buffer.
 */
struct VolumeInfo {
  /** Stable handle returned by buildVolumeFromDicoms. */
  long long handle;
  /** Image columns (X) — same for every input slice. */
  int columns;
  /** Image rows (Y) — same for every input slice. */
  int rows;
  /** Number of slices (Z) — count of input DICOMs. */
  int depth;
  /** 8 or 16. Mixed-bit-depth series is rejected at build time. */
  int bitsAllocated;
  /** 0 unsigned, 1 signed. */
  int pixelRepresentation;
  /** Same per-axis spacing in mm: [rowSpacing, colSpacing, sliceSpacing]. */
  double pixelSpacingRow;
  double pixelSpacingCol;
  double sliceSpacing;
  /** Photometric interpretation propagated from the first slice. */
  std::string photometricInterpretation;
};

/**
 * Phase 5.2 — build options. All fields are optional with sensible
 * defaults; pass a default-constructed BuildVolumeOptions for the
 * Phase 5.1 behaviour.
 */
struct BuildVolumeOptions {
  /**
   * When the input series has non-uniform z-spacing (max-deviation >
   * 5% of mean Δz), should we resample to a uniform grid?
   *   false (Phase 5.1 default) — throw std::runtime_error.
   *   true — trilinear-along-Z resample to a uniform grid at the
   *   median Δz; the slice count is rounded to fit the original z
   *   extent. X/Y are left unchanged.
   */
  bool resampleNonUniformZ = false;
};

/**
 * Build a volume from `dicomPaths`. Slices are sorted by
 * ImagePositionPatient.z (DICOM PS3.3 C.7.6.2.1.2) so the volume is
 * built in anatomical order regardless of file naming. Validates:
 *   - all slices have the same Rows/Columns/BitsAllocated/SamplesPerPixel
 *   - z spacing is approximately uniform (≤5% deviation), OR
 *     opts.resampleNonUniformZ is true (Phase 5.2: trilinear-along-Z
 *     resample to a uniform grid at the median Δz)
 *
 * Compressed transfer syntaxes (JPEG, JPEG-LS, JPEG 2000, RLE, ...) are
 * supported transparently — gdcm::ImageReader auto-decompresses each
 * slice via the Phase 2.2 decoder pipeline. The volume buffer always
 * holds raw uncompressed pixels.
 *
 * Returned VolumeInfo carries the registry handle. Callers free with
 * releaseVolume(handle) — failing to do so leaks the buffer until the
 * process exits.
 */
VolumeInfo buildVolumeFromDicoms(const std::vector<std::string>& dicomPaths,
                                 const BuildVolumeOptions& opts = {});

/**
 * Drop the volume + buffer for `handle`. Safe to call with an invalid
 * handle (no-op).
 */
void releaseVolume(long long handle);

/**
 * Extract slice `index` along `plane` from volume `handle`. Writes raw
 * pixels (same byte layout as extractPixelDataToFile) to `outPath`.
 *
 * Slice dimensions:
 *   Axial:    columns × rows
 *   Sagittal: depth × rows  (Y-Z plane: vertical Y, horizontal Z)
 *   Coronal:  columns × depth
 *
 * `index` is bounded by the corresponding axis length (depth for axial,
 * columns for sagittal, rows for coronal). Out-of-range throws.
 */
struct MprSliceInfo {
  std::string filePath;
  long long byteLength;
  int rows;
  int columns;
  int bitsAllocated;
  int pixelRepresentation;
  /** Output pixel spacing for THIS slice — different per plane.
   *  [rowSpacingMm, colSpacingMm]. Used by the viewer for accurate mm
   *  rendering and for measurements made on reformats. */
  double pixelSpacingRow;
  double pixelSpacingCol;
  /** Phase 6.2: 1 = grayscale (default), 4 = RGBA8 (volume render
   *  output — alpha-composited colour, viewer skips W/L). */
  int samplesPerPixel = 1;
};

MprSliceInfo extractSlice(long long handle, MprPlane plane, int index,
                          const std::string& outPath);

// Phase 5.3 — oblique plane spec.
//
// An oblique plane is defined by a center point (in mm, image-patient
// coords with the volume's lower-left-near corner at 0,0,0) plus two
// orthonormal in-plane basis vectors u (output column axis) and v
// (output row axis). The plane normal is u × v; we don't take it as
// an explicit input because the basis already encodes orientation.
//
// Output dimensions and per-output-pixel spacing are the caller's
// choice. Reasonable defaults:
//   pixelSpacingMm = min(volume.pixelSpacingRow,
//                        volume.pixelSpacingCol,
//                        volume.sliceSpacing)
//   columns / rows  = ceil(volume diagonal / pixelSpacingMm) so the
//   whole volume fits regardless of orientation. Caller picks for the
//   target use case.
//
// The sampling is trilinear in volume voxel space. Out-of-volume
// samples render as 0 (black) — the caller can detect by extracting
// at a known-edge oblique and observing the dark wedges.
struct ObliqueSpec {
  double centerMm[3] = {0, 0, 0};
  double uMm[3] = {1, 0, 0};
  double vMm[3] = {0, 1, 0};
  int columns = 0;
  int rows = 0;
  double pixelSpacingMm = 1.0;
};

// Phase 5.3 — extract an oblique slice. Output dimensions are the
// caller's choice; pixel spacing is uniform over the output. Result
// shape is identical to extractSlice (raw pixel buffer at outPath +
// MprSliceInfo) so the existing Skia viewer pipeline renders it
// directly.
MprSliceInfo extractObliqueSlice(long long handle, const ObliqueSpec& spec,
                                 const std::string& outPath);

// Phase 6.1 — slab projection (Maximum / Minimum / Average Intensity
// Projection).
//
// For each output pixel along the oblique plane defined by `spec`,
// cast a ray of length `slabThicknessMm` along the plane's normal
// (u × v), centred on the plane. Reduce sampled values by:
//   MIP     = max  (vessels, bone — bright structures stand out)
//   MinIP   = min  (airways, lungs — dark structures stand out)
//   Average = mean (X-ray-like radiograph)
//
// Step size along the ray defaults to the smallest axis spacing of the
// volume; use stepMm=0 to opt into that default. The result has the
// same shape as extractObliqueSlice — the viewer pipeline doesn't need
// a special case.
//
// `slabThicknessMm` of 0 falls back to a single-sample-per-ray (i.e.
// behaves like extractObliqueSlice). For full-volume MIP, pass
// slabThicknessMm = volume diagonal in mm.
enum class ProjectionMode : int {
  Mip = 0,     // Maximum Intensity Projection
  MinIp = 1,   // Minimum Intensity Projection
  Average = 2, // Average along ray
};

MprSliceInfo extractProjectionSlab(long long handle, const ObliqueSpec& spec,
                                   double slabThicknessMm, double stepMm,
                                   ProjectionMode mode,
                                   const std::string& outPath);

// Phase 6.2 — volume rendering with a piecewise-linear transfer
// function.
//
// Each transfer-function control point maps a stored pixel value to
// an (R, G, B, opacity) tuple, all in [0, 1]. Samples between control
// points are linearly interpolated. Below the lowest value: zero
// opacity (fully transparent). Above the highest: clamped to the
// last point's colour + opacity.
//
// The output is alpha-composited RGBA8: walk each ray front-to-back,
// blend each sample's contribution into the running output, terminate
// early when opacity saturates.
struct TransferFunctionPoint {
  /** Stored pixel value (in input domain — same units as
   *  windowCenter/windowWidth). */
  double value;
  /** R/G/B/opacity in [0, 1]. */
  double r;
  double g;
  double b;
  double opacity;
};

// Phase 6.3 — clip plane. A clip plane is a half-space: samples on
// the *negative* side of the plane (i.e. (p - pointMm) · normalMm < 0)
// are discarded by the ray loop. Multiple planes intersect (AND) —
// pass several to carve a convex region out of the volume.
//
// `normalMm` does not have to be unit length, but it must be non-zero;
// callers typically pass the plane unit normal. `pointMm` is any point
// on the plane in volume mm-coords.
struct ClipPlane {
  double pointMm[3];
  double normalMm[3];
};

// extractVolumeRender uses the same plane spec as MIP. The slab is
// the integration depth for the ray-cast; thicker slab = more samples
// per ray = more visible internal structure. tfPoints must be sorted
// by `value` and contain at least 2 entries.
//
// Phase 6.3: `clipPlanes` may be empty. When non-empty, each ray sample
// must lie on the positive side of EVERY plane to contribute — samples
// that fail the test are simply skipped (the ray continues, accA stays
// where it was). This composes cleanly with early termination.
//
// Output: RGBA8 (samplesPerPixel=4) at outPath. The viewer branches
// on samplesPerPixel to render colour without window/level.
MprSliceInfo extractVolumeRender(
    long long handle, const ObliqueSpec& spec, double slabThicknessMm,
    double stepMm, const std::vector<TransferFunctionPoint>& tfPoints,
    const std::vector<ClipPlane>& clipPlanes,
    const std::string& outPath);

}  // namespace vnd
