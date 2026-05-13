// Phase 6.5 — Volume-render presets.
//
// Bundles a transfer function (Phase 6.2) + slab thickness + Phong
// lighting (Phase 6.4) + an optional default Z-clip (Phase 6.3) into a
// single named profile. Consumers pick a preset by name instead of
// hand-tuning every knob; the example app's manual sliders collapse
// down to one dropdown.
//
// Each preset is tuned for a *modality* (CT bone, CT angio, MR brain)
// plus the synthetic 8-bit gradient that the example app uses as a
// sanity-check default. The TF values live in stored-pixel units —
// callers feeding HU-domain volumes use the CT presets directly;
// 8-bit-only callers use GRAY_8BIT_3D or rescale via
// rescaleTransferFunction.

import { CT_ANGIO, CT_BONE, GRAY_8BIT, MR_BRAIN } from './transferFunctions';
import type {
  LightingOptions,
  TransferFunction,
  VolumeRenderOptions,
} from './types';

/**
 * A self-contained recipe for `extractVolumeRender`. Everything the
 * caller needs except the volume handle, the oblique spec (camera
 * orientation), and the output file path.
 *
 * `clipPlanes` is intentionally absent from presets — clipping is
 * always a per-session UX choice. The example app + controller hook
 * layer that on top via separate state.
 */
export type VolumeRenderPreset = {
  /** Human-readable label for UI. */
  label: string;
  /** Used for filenames + telemetry. Stable. */
  id: string;
  /** Transfer function passed straight through to `extractVolumeRender`. */
  transferFunction: TransferFunction;
  /** Default slab thickness in mm. Caller may override. */
  slabThicknessMm: number;
  /** Optional Phong lighting. Omit / disabled = raw TF. */
  lighting: LightingOptions;
};

const LIGHT_DIR_DEFAULT: [number, number, number] = [1, 1, 1];

/**
 * "CT bone 3D" — high-opacity bone surfaces over an aggressively dark
 * background. Default slab thickness 60 mm; medium-strength Phong
 * shading so cortical bone shows surface relief.
 */
export const CT_BONE_3D: VolumeRenderPreset = {
  label: 'CT bone (3D)',
  id: 'ct-bone-3d',
  transferFunction: CT_BONE,
  slabThicknessMm: 60,
  lighting: {
    enabled: true,
    ambient: 0.15,
    diffuse: 0.75,
    specular: 0.35,
    shininess: 32,
    gradientThreshold: 50,
    lightDirMm: LIGHT_DIR_DEFAULT,
  },
};

/**
 * "CT angio 3D" — vessel-emphasising preset, thinner slab so the
 * lumen doesn't get washed out by ambient soft tissue. Hard shading
 * gives contrast-filled vessels a metallic look.
 */
export const CT_ANGIO_3D: VolumeRenderPreset = {
  label: 'CT angio (3D)',
  id: 'ct-angio-3d',
  transferFunction: CT_ANGIO,
  slabThicknessMm: 30,
  lighting: {
    enabled: true,
    ambient: 0.1,
    diffuse: 0.85,
    specular: 0.55,
    shininess: 64,
    gradientThreshold: 30,
    lightDirMm: LIGHT_DIR_DEFAULT,
  },
};

/**
 * "MR brain 3D" — soft shading over a wide TF range. Brain volume
 * renders look unnatural under aggressive specular highlights, so
 * specular is low and ambient is high.
 */
export const MR_BRAIN_3D: VolumeRenderPreset = {
  label: 'MR brain (3D)',
  id: 'mr-brain-3d',
  transferFunction: MR_BRAIN,
  slabThicknessMm: 40,
  lighting: {
    enabled: true,
    ambient: 0.35,
    diffuse: 0.55,
    specular: 0.1,
    shininess: 12,
    gradientThreshold: 20,
    lightDirMm: LIGHT_DIR_DEFAULT,
  },
};

/**
 * "Gray 8-bit 3D" — generic preset for the synthetic 8-bit gradient
 * used by the example app. Light shading just so the cube doesn't
 * look like a flat MIP. Useful as a known-good fallback when a real
 * preset would over-shade an unfamiliar dataset.
 */
export const GRAY_8BIT_3D: VolumeRenderPreset = {
  label: 'Gray 8-bit (3D)',
  id: 'gray-8bit-3d',
  transferFunction: GRAY_8BIT,
  slabThicknessMm: 16,
  lighting: {
    enabled: true,
    ambient: 0.25,
    diffuse: 0.6,
    specular: 0.2,
    shininess: 16,
    gradientThreshold: 4,
    lightDirMm: LIGHT_DIR_DEFAULT,
  },
};

export const VOLUME_RENDER_PRESETS = {
  'ct-bone-3d': CT_BONE_3D,
  'ct-angio-3d': CT_ANGIO_3D,
  'mr-brain-3d': MR_BRAIN_3D,
  'gray-8bit-3d': GRAY_8BIT_3D,
} as const;

export type VolumeRenderPresetName = keyof typeof VOLUME_RENDER_PRESETS;

/**
 * Materialise a preset into a `VolumeRenderOptions` ready for the
 * native bridge. Pure function — useful in tests and for callers that
 * want the recipe but not the controller's state machine.
 */
export function presetToVolumeRenderOptions(
  preset: VolumeRenderPreset
): VolumeRenderOptions {
  return {
    slabThicknessMm: preset.slabThicknessMm,
    transferFunction: preset.transferFunction,
    lighting: preset.lighting,
  };
}
