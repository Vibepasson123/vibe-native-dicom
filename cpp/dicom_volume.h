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
};

MprSliceInfo extractSlice(long long handle, MprPlane plane, int index,
                          const std::string& outPath);

}  // namespace vnd
