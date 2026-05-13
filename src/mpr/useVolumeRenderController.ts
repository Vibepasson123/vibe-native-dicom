// Phase 6.5 — useVolumeRenderController.
//
// Owns the volume-render UX state (preset, rotation, optional Z-clip,
// optional slab-thickness override) and re-runs `extractVolumeRender`
// whenever any input changes. Returns the resulting `MprSliceInfo`
// plus the setters — consumers wire one hook instead of plumbing four
// or five `useState` calls + an effect.
//
// This is the ergonomic counterpart to Phase 6.2–6.4. The lower-level
// `extractVolumeRender` is still public; the hook is opt-in.

import { useEffect, useMemo, useRef, useState } from 'react';

import { buildObliqueSpec } from './useObliqueController';
import type { ClipPlane, MprSliceInfo, VolumeInfo } from './types';
import { extractVolumeRender } from './volume';
import {
  presetToVolumeRenderOptions,
  VOLUME_RENDER_PRESETS,
  type VolumeRenderPresetName,
} from './volumeRenderPresets';

/**
 * Configuration knob for the per-render output file path. Each render
 * goes to a distinct path so the viewer can read it without the kernel
 * caching an earlier render. The default mirrors the example app's
 * `/tmp/vnd-vr-…` pattern.
 */
export type VolumeRenderOutPathBuilder = (
  volume: VolumeInfo,
  presetId: string,
  rotX: number,
  rotY: number,
  rotZ: number,
  clipZMm: number | null
) => string;

const defaultOutPathBuilder: VolumeRenderOutPathBuilder = (
  volume,
  presetId,
  rotX,
  rotY,
  rotZ,
  clipZMm
) =>
  `/tmp/vnd-vr-${volume.handle}-${presetId}-${rotX.toFixed(3)}-` +
  `${rotY.toFixed(3)}-${rotZ.toFixed(3)}-` +
  `${clipZMm == null ? 'noclip' : `c${clipZMm}`}.bin`;

export type UseVolumeRenderControllerOptions = {
  /** Initial preset. Defaults to 'gray-8bit-3d'. */
  initialPreset?: VolumeRenderPresetName;
  /** Custom output-path scheme. Useful for sandboxed file systems. */
  outPathBuilder?: VolumeRenderOutPathBuilder;
};

export type UseVolumeRenderControllerResult = {
  preset: VolumeRenderPresetName;
  setPreset: (p: VolumeRenderPresetName) => void;
  rotX: number;
  rotY: number;
  rotZ: number;
  setRotX: (r: number) => void;
  setRotY: (r: number) => void;
  setRotZ: (r: number) => void;
  /** Reset rotation to axial (0, 0, 0). Preset + clip are preserved. */
  resetRotation: () => void;
  /** Toggle a Z-axis half-space clip plane (z ≥ clipZMm survives). */
  clipEnabled: boolean;
  setClipEnabled: (b: boolean) => void;
  clipZMm: number;
  setClipZMm: (mm: number) => void;
  /** Latest render result. null while the first frame is in flight. */
  slice: MprSliceInfo | null;
  /** Most recent error from extractVolumeRender. null on success. */
  error: Error | null;
};

/**
 * Drive a Phase 6.2–6.4 volume render from a volume handle. Re-runs
 * the native extractor on every state change.
 *
 * The hook does NOT debounce. extractVolumeRender is currently fast
 * enough for the synthetic 16³ volume that gesture-rate updates work;
 * for larger clinical volumes the caller can debounce by guarding the
 * setters externally.
 */
export function useVolumeRenderController(
  volume: VolumeInfo | null,
  options: UseVolumeRenderControllerOptions = {}
): UseVolumeRenderControllerResult {
  const { initialPreset = 'gray-8bit-3d', outPathBuilder } = options;

  const [preset, setPreset] = useState<VolumeRenderPresetName>(initialPreset);
  const [rotX, setRotX] = useState(0);
  const [rotY, setRotY] = useState(0);
  const [rotZ, setRotZ] = useState(0);
  const [clipEnabled, setClipEnabled] = useState(false);
  const [clipZMm, setClipZMm] = useState(0);

  const [slice, setSlice] = useState<MprSliceInfo | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Stable ref to the path builder so consumers passing an inline
  // function don't re-trigger the effect every render.
  const pathBuilderRef = useRef(outPathBuilder ?? defaultOutPathBuilder);
  useEffect(() => {
    pathBuilderRef.current = outPathBuilder ?? defaultOutPathBuilder;
  }, [outPathBuilder]);

  const resetRotation = useMemo(
    () => () => {
      setRotX(0);
      setRotY(0);
      setRotZ(0);
    },
    []
  );

  useEffect(() => {
    if (!volume) return;
    try {
      const spec = buildObliqueSpec(volume, rotX, rotY, rotZ);
      const presetDef = VOLUME_RENDER_PRESETS[preset];
      const opts = presetToVolumeRenderOptions(presetDef);
      const clipPlanes: ClipPlane[] | undefined = clipEnabled
        ? [
            {
              pointMm: [0, 0, clipZMm],
              normalMm: [0, 0, 1],
            },
          ]
        : undefined;
      const outPath = pathBuilderRef.current(
        volume,
        presetDef.id,
        rotX,
        rotY,
        rotZ,
        clipEnabled ? clipZMm : null
      );
      const result = extractVolumeRender(
        volume.handle,
        spec,
        { ...opts, clipPlanes },
        outPath
      );
      setSlice(result);
      setError(null);
    } catch (e) {
      setError(e as Error);
    }
  }, [volume, preset, rotX, rotY, rotZ, clipEnabled, clipZMm]);

  return {
    preset,
    setPreset,
    rotX,
    rotY,
    rotZ,
    setRotX,
    setRotY,
    setRotZ,
    resetRotation,
    clipEnabled,
    setClipEnabled,
    clipZMm,
    setClipZMm,
    slice,
    error,
  };
}
