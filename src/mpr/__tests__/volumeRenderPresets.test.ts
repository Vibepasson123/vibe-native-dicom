import { describe, it, expect } from '@jest/globals';

import {
  VOLUME_RENDER_PRESETS,
  presetToVolumeRenderOptions,
  type VolumeRenderPresetName,
} from '../volumeRenderPresets';

describe('Phase 6.5 — volume-render presets', () => {
  const allNames: VolumeRenderPresetName[] = [
    'ct-bone-3d',
    'ct-angio-3d',
    'mr-brain-3d',
    'gray-8bit-3d',
  ];

  it('exposes every documented preset under the expected key', () => {
    for (const name of allNames) {
      const preset = VOLUME_RENDER_PRESETS[name];
      expect(preset).toBeDefined();
      expect(preset.id).toBe(name);
      // Sanity check: TF has ≥ 2 points (the native validator's floor).
      expect(preset.transferFunction.points.length).toBeGreaterThanOrEqual(2);
      // Slab thickness > 0 (the native validator rejects 0 for VR).
      expect(preset.slabThicknessMm).toBeGreaterThan(0);
      // Lighting is always populated (presets ship a shading recipe).
      expect(preset.lighting.enabled).toBe(true);
      expect(preset.lighting.lightDirMm).toHaveLength(3);
    }
  });

  it('preset IDs are unique across the catalogue', () => {
    const ids = allNames.map((n) => VOLUME_RENDER_PRESETS[n].id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('presetToVolumeRenderOptions strips fields not consumed by the bridge', () => {
    const opts = presetToVolumeRenderOptions(
      VOLUME_RENDER_PRESETS['ct-bone-3d']
    );
    expect(opts.slabThicknessMm).toBe(
      VOLUME_RENDER_PRESETS['ct-bone-3d'].slabThicknessMm
    );
    expect(opts.transferFunction).toBe(
      VOLUME_RENDER_PRESETS['ct-bone-3d'].transferFunction
    );
    expect(opts.lighting).toBe(VOLUME_RENDER_PRESETS['ct-bone-3d'].lighting);
    // `label` and `id` are intentionally absent from the bridge payload —
    // they're presentation metadata only.
    expect((opts as unknown as { label?: unknown }).label).toBeUndefined();
    expect((opts as unknown as { id?: unknown }).id).toBeUndefined();
  });

  it('CT angio uses a thinner slab than CT bone (the visual reason it exists)', () => {
    // Angio's whole point is to keep contrast vessels from getting buried
    // in soft tissue averaging. Test the design intent, not the literal
    // mm number (which we may tune).
    expect(VOLUME_RENDER_PRESETS['ct-angio-3d'].slabThicknessMm).toBeLessThan(
      VOLUME_RENDER_PRESETS['ct-bone-3d'].slabThicknessMm
    );
  });

  it('MR brain uses softer shading than CT angio (less specular)', () => {
    expect(VOLUME_RENDER_PRESETS['mr-brain-3d'].lighting.specular).toBeLessThan(
      VOLUME_RENDER_PRESETS['ct-angio-3d'].lighting.specular
    );
  });
});
