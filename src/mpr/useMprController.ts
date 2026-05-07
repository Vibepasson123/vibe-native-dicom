// Phase 5.1 — useMprController.
//
// Tracks the current slice index per plane and exposes seek / step
// helpers. Pairs with three <DicomImageViewSkia> instances (one per
// plane) — pass the current index to extractMprSlice and feed the
// returned filePath to the viewer.
//
// Design choices:
//   - One controller per volume. Multiple volumes → multiple hooks.
//   - State is per-plane; plane switch is a UI concern (toggle which
//     viewer is visible), not a controller concern.
//   - Defaults to the centre of each axis — more useful starting point
//     than 0/0/0 (often outside-the-body padding for clinical CTs).

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MprPlane, VolumeInfo } from './types';

export type MprIndices = Record<MprPlane, number>;

export type UseMprControllerResult = {
  indices: MprIndices;
  setIndex: (plane: MprPlane, index: number) => void;
  step: (plane: MprPlane, delta: number) => void;
  /** Per-axis maximums (= depth-1, columns-1, rows-1). */
  maxIndex: MprIndices;
};

export function useMprController(
  volume: VolumeInfo | null
): UseMprControllerResult {
  const maxIndex: MprIndices = useMemo(
    () =>
      volume
        ? {
            axial: Math.max(0, volume.depth - 1),
            sagittal: Math.max(0, volume.columns - 1),
            coronal: Math.max(0, volume.rows - 1),
          }
        : { axial: 0, sagittal: 0, coronal: 0 },
    [volume]
  );

  const [indices, setIndices] = useState<MprIndices>(() => ({
    axial: Math.floor(maxIndex.axial / 2),
    sagittal: Math.floor(maxIndex.sagittal / 2),
    coronal: Math.floor(maxIndex.coronal / 2),
  }));

  // When the volume changes, reset to centre.
  useEffect(() => {
    setIndices({
      axial: Math.floor(maxIndex.axial / 2),
      sagittal: Math.floor(maxIndex.sagittal / 2),
      coronal: Math.floor(maxIndex.coronal / 2),
    });
  }, [maxIndex.axial, maxIndex.sagittal, maxIndex.coronal]);

  const setIndex = useCallback(
    (plane: MprPlane, index: number) => {
      const max = maxIndex[plane];
      const clamped = Math.max(0, Math.min(max, Math.floor(index)));
      setIndices((prev) => ({ ...prev, [plane]: clamped }));
    },
    [maxIndex]
  );

  const step = useCallback(
    (plane: MprPlane, delta: number) =>
      setIndices((prev) => {
        const max = maxIndex[plane];
        const next = Math.max(
          0,
          Math.min(max, Math.floor(prev[plane] + delta))
        );
        return { ...prev, [plane]: next };
      }),
    [maxIndex]
  );

  return { indices, setIndex, step, maxIndex };
}
