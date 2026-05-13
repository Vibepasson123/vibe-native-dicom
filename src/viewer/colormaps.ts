// Phase 7.2 — Colormap LUTs for fusion overlays.
//
// Each colormap is a function `t ∈ [0, 1] → [r, g, b] ∈ [0, 1]^3`.
// We materialise 256-entry RGBA8 byte arrays so the Skia fragment
// shader can sample them via an ImageShader bound to a 256×1 texture
// — that keeps the shader branch-free (one sample per overlay pixel).
//
// 'gray' is a true identity ramp; 'hot' is the matplotlib hot map
// (black → red → yellow → white); 'jet' is the classical
// blue→cyan→yellow→red rainbow. Both 'hot' and 'jet' are widely used
// in PET/SPECT overlays.

export type ColormapName = 'gray' | 'hot' | 'jet';

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Matplotlib hot colormap. Reference points:
 *   t=0    → (0, 0, 0)
 *   t=0.4  → (1, 0, 0)
 *   t=0.75 → (1, 1, 0)
 *   t=1    → (1, 1, 1)
 * Linear ramps in three bands.
 */
export function hot(t: number): [number, number, number] {
  const c = clamp01(t);
  const r = clamp01(c / 0.4);
  const g = clamp01((c - 0.4) / 0.35);
  const b = clamp01((c - 0.75) / 0.25);
  return [r, g, b];
}

/**
 * Jet colormap (matplotlib). Classical blue→cyan→green→yellow→red.
 * Not perceptually uniform — used here because radiology PET overlays
 * historically use it; provide hot as the default in clinical UI.
 */
export function jet(t: number): [number, number, number] {
  const c = clamp01(t);
  // Standard piecewise definition.
  const r = clamp01(Math.min(4 * c - 1.5, -4 * c + 4.5));
  const g = clamp01(Math.min(4 * c - 0.5, -4 * c + 3.5));
  const b = clamp01(Math.min(4 * c + 0.5, -4 * c + 2.5));
  return [r, g, b];
}

/** Linear grayscale ramp. Useful when the overlay should look like
 *  another grayscale image (e.g. for arithmetic blends). */
export function gray(t: number): [number, number, number] {
  const c = clamp01(t);
  return [c, c, c];
}

const FUNCS: Record<ColormapName, (t: number) => [number, number, number]> = {
  hot,
  jet,
  gray,
};

/**
 * Build a 256-entry RGBA8 LUT for the named colormap. Alpha is fully
 * opaque — the per-fragment overlay opacity is controlled by the
 * shader's `overlayOpacity` uniform, not the LUT's alpha channel.
 */
export function buildColormapLut(name: ColormapName): Uint8Array {
  const fn = FUNCS[name];
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = fn(i / 255);
    out[i * 4 + 0] = Math.round(r * 255);
    out[i * 4 + 1] = Math.round(g * 255);
    out[i * 4 + 2] = Math.round(b * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}
