// Phase 6.2 — Transfer function presets.
//
// Three presets, each tuned for a different clinical use case. Values
// are in stored-pixel units — for CT (which uses Hounsfield units after
// rescale) the typical ranges are [-1000 (air), -500 (lung), 0 (water),
// 200 (soft tissue), 700 (cancellous bone), 2000 (compact bone)].
//
// Our synthetic volume is 8-bit (0-255), so the example app re-scales
// presets to that range before passing them through. Real clinical
// volumes feed the HU-domain presets directly.

import type { TransferFunction } from './types';

/**
 * "CT bone" — high opacity above 200 HU, ramps to white at 1500 HU.
 * Used for skeletal review.
 */
export const CT_BONE: TransferFunction = {
  points: [
    { value: -3024, r: 0, g: 0, b: 0, opacity: 0 },
    { value: 142, r: 0, g: 0, b: 0, opacity: 0 },
    { value: 145, r: 0.6, g: 0.45, b: 0.3, opacity: 0.05 },
    { value: 192, r: 0.7, g: 0.55, b: 0.4, opacity: 0.15 },
    { value: 217, r: 0.8, g: 0.7, b: 0.55, opacity: 0.4 },
    { value: 384, r: 0.9, g: 0.85, b: 0.7, opacity: 0.7 },
    { value: 1500, r: 1, g: 0.97, b: 0.85, opacity: 0.95 },
  ],
};

/**
 * "CT angio" — emphasizes contrast-filled vessels (~150-450 HU).
 * Soft tissue rendered with low opacity so vessels stand out.
 */
export const CT_ANGIO: TransferFunction = {
  points: [
    { value: -3024, r: 0, g: 0, b: 0, opacity: 0 },
    { value: -100, r: 0.05, g: 0.05, b: 0.05, opacity: 0 },
    { value: 50, r: 0.4, g: 0.2, b: 0.2, opacity: 0.05 },
    { value: 150, r: 0.85, g: 0.2, b: 0.2, opacity: 0.4 },
    { value: 250, r: 1, g: 0.25, b: 0.2, opacity: 0.85 },
    { value: 450, r: 1, g: 0.85, b: 0.65, opacity: 0.95 },
    { value: 1500, r: 0.95, g: 0.95, b: 0.9, opacity: 0.95 },
  ],
};

/**
 * "MR brain" — generic T1-weighted MR display. Low opacity over a
 * wide value range so deep structures emerge.
 */
export const MR_BRAIN: TransferFunction = {
  points: [
    { value: 0, r: 0, g: 0, b: 0, opacity: 0 },
    { value: 80, r: 0.2, g: 0.18, b: 0.18, opacity: 0.04 },
    { value: 200, r: 0.5, g: 0.45, b: 0.4, opacity: 0.2 },
    { value: 450, r: 0.85, g: 0.8, b: 0.7, opacity: 0.5 },
    { value: 800, r: 1, g: 1, b: 0.9, opacity: 0.9 },
  ],
};

/**
 * Generic 8-bit grayscale ramp. Opacity rises linearly with intensity
 * — the obvious "volume render the synthetic gradient" preset.
 * Useful default + sanity check for the example app.
 */
export const GRAY_8BIT: TransferFunction = {
  points: [
    { value: 0, r: 0, g: 0, b: 0, opacity: 0 },
    { value: 64, r: 0.25, g: 0.25, b: 0.25, opacity: 0.08 },
    { value: 128, r: 0.5, g: 0.5, b: 0.5, opacity: 0.3 },
    { value: 192, r: 0.75, g: 0.75, b: 0.75, opacity: 0.6 },
    { value: 255, r: 1, g: 1, b: 1, opacity: 0.95 },
  ],
};

/**
 * Re-scale a transfer function from one input domain to another.
 * Useful for adapting HU-domain presets to 8-bit synthetic volumes
 * (and vice-versa). Linear remap of every point's `value`.
 */
export function rescaleTransferFunction(
  tf: TransferFunction,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number
): TransferFunction {
  const fromSpan = fromMax - fromMin;
  const toSpan = toMax - toMin;
  if (fromSpan === 0) return tf;
  return {
    points: tf.points.map((p) => ({
      ...p,
      value: toMin + ((p.value - fromMin) / fromSpan) * toSpan,
    })),
  };
}

export const TF_PRESETS = {
  'ct-bone': CT_BONE,
  'ct-angio': CT_ANGIO,
  'mr-brain': MR_BRAIN,
  'gray-8bit': GRAY_8BIT,
} as const;

export type TfPresetName = keyof typeof TF_PRESETS;
