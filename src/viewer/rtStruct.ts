// Phase 7.4 — RTSTRUCT contour overlay primitives.
//
// DICOM RTSTRUCT stores contours as 2D polylines per structure per
// slice. We model this as a small, viewer-agnostic data structure;
// consumers can produce contours from any source (RTSTRUCT decoder,
// AI inference, hand-drawn ROI) and feed them into the overlay
// component.
//
// All coordinates are in image pixel space. The viewer maps them to
// screen space using the same fit="contain" logic the base viewer
// uses for the image texture, so contours stay aligned with the
// rendered pixels regardless of display size.

/** A single closed (or open) polyline in image pixel coordinates. */
export type Contour = Array<{ x: number; y: number }>;

/**
 * One named structure (e.g. "GTV", "spinal cord"). `contours` is the
 * list of polylines that make up this structure on the *current
 * slice*; multi-slice volumes feed a different `contours` array per
 * slice from outside.
 *
 * `r/g/b` are in [0, 1]. `closed=true` (default) auto-closes each
 * polyline; pass `false` for open polylines (rare in RTSTRUCT but
 * useful for one-shot measurements).
 */
export type Structure = {
  id: number;
  label: string;
  r: number;
  g: number;
  b: number;
  /** Per-structure alpha override; falls back to viewer-global slider. */
  opacity?: number;
  /** Stroke width in screen pixels (post-zoom). Defaults to 1.5. */
  strokeWidth?: number;
  /** Auto-close each contour into a polygon. Defaults to true. */
  closed?: boolean;
  contours: Contour[];
};

/**
 * Build a circular contour at (cx, cy) in pixel coords with N segments.
 * Exposed for tests + the example app fixture; consumers replace this
 * with real RTSTRUCT decoding.
 */
export function makeSyntheticCircleContour(
  cx: number,
  cy: number,
  radius: number,
  segments: number = 64
): Contour {
  if (segments < 3) {
    throw new Error('makeSyntheticCircleContour: segments must be ≥ 3');
  }
  const out: Contour = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    out.push({ x: cx + Math.cos(t) * radius, y: cy + Math.sin(t) * radius });
  }
  return out;
}

/**
 * Map a pixel-space point to screen-space, matching the Skia `fit`
 * mode the base viewer uses. Skia's "contain" fit preserves aspect
 * ratio and centres the image inside the canvas — we replicate that
 * here so contours align with the rendered pixels.
 *
 * Pure function; tested directly.
 */
export function pixelToScreen(
  px: number,
  py: number,
  imageCols: number,
  imageRows: number,
  canvasW: number,
  canvasH: number
): { x: number; y: number } {
  const imageAspect = imageCols / imageRows;
  const canvasAspect = canvasW / canvasH;
  let drawW: number;
  let drawH: number;
  let offsetX: number;
  let offsetY: number;
  if (imageAspect > canvasAspect) {
    // Image is wider than canvas — fit by width.
    drawW = canvasW;
    drawH = canvasW / imageAspect;
    offsetX = 0;
    offsetY = (canvasH - drawH) / 2;
  } else {
    // Image is taller — fit by height.
    drawH = canvasH;
    drawW = canvasH * imageAspect;
    offsetX = (canvasW - drawW) / 2;
    offsetY = 0;
  }
  return {
    x: offsetX + (px / imageCols) * drawW,
    y: offsetY + (py / imageRows) * drawH,
  };
}
