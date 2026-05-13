// Phase 7.3 — DICOM SEG overlay primitives.
//
// We accept a "label-map" — one byte per pixel, where 0 is background
// and each non-zero value is a segment ID. The viewer samples the
// label-map per fragment, looks up the segment's colour in a 256×1
// palette texture, and alpha-blends the result over the base image.
//
// This keeps the viewer agnostic of how the label-map was produced.
// A future sub-phase will add a DICOM SEG SOP decoder that emits a
// label-map directly from the native bridge; the viewer surface
// stays unchanged.

/**
 * One row in the segmentation palette. `id` is the byte value in the
 * label-map; `r/g/b` are in [0, 1]; `opacity` modulates this segment's
 * contribution and stacks with the viewer's global overlayOpacity.
 *
 * The `label` is presentation-only — useful for legends/tooltips.
 */
export type Segment = {
  id: number;
  label: string;
  r: number;
  g: number;
  b: number;
  /** [0, 1]. Per-segment alpha; default 1 (use viewer-global slider). */
  opacity?: number;
};

/**
 * Build a 256-entry RGBA8 palette texture from a segment list. Every
 * non-listed ID renders as fully transparent (alpha=0) — the shader's
 * blend math zeroes its contribution. Segment 0 is forced transparent
 * regardless of the list (background must stay invisible).
 */
export function buildSegmentPalette(segments: Segment[]): Uint8Array {
  const out = new Uint8Array(256 * 4);
  // Index 0 (background) stays at the zero-init values.
  for (const seg of segments) {
    if (seg.id <= 0 || seg.id > 255) continue;
    const i = seg.id * 4;
    out[i + 0] = Math.round(Math.max(0, Math.min(1, seg.r)) * 255);
    out[i + 1] = Math.round(Math.max(0, Math.min(1, seg.g)) * 255);
    out[i + 2] = Math.round(Math.max(0, Math.min(1, seg.b)) * 255);
    out[i + 3] = Math.round(Math.max(0, Math.min(1, seg.opacity ?? 1)) * 255);
  }
  return out;
}

/**
 * Generate a synthetic 8-bit label-map with a single segment of `id`
 * covering an axis-aligned disc. Exposed for the example app's
 * validation panel + as a sanity-check fixture in tests.
 *
 * Returns a `Uint8Array` of length `rows*columns`. Pixels inside the
 * disc are set to `id`; outside is 0 (background).
 */
export function makeSyntheticDiscLabelMap(
  rows: number,
  columns: number,
  id: number,
  radiusFraction: number = 0.3
): Uint8Array {
  const out = new Uint8Array(rows * columns);
  const cx = (columns - 1) / 2;
  const cy = (rows - 1) / 2;
  const r = radiusFraction * Math.min(rows, columns);
  const r2 = r * r;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        out[y * columns + x] = id;
      }
    }
  }
  return out;
}
