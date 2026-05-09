// Phase 5.3 — useObliqueController.
//
// Exposes Euler-angle rotation (rotX, rotY, rotZ in radians) starting
// from the axial plane and produces an ObliqueSpec the consumer feeds
// to extractObliqueSlice. Center is fixed at the volume's geometric
// centre; output dimensions = volume diagonal so the whole volume
// always fits regardless of orientation.
//
// Why Euler angles + a fixed centre instead of free 3D point + free
// basis vectors: the clinical UX is "tilt the slicing plane". Three
// sliders are far easier than picking a 3D point and two orthogonal
// vectors.

import { useCallback, useMemo, useState } from 'react';
import type { ObliqueSpec, VolumeInfo } from './types';

export type ObliqueController = {
  rotX: number;
  rotY: number;
  rotZ: number;
  setRotX: (radians: number) => void;
  setRotY: (radians: number) => void;
  setRotZ: (radians: number) => void;
  reset: () => void;
  /** Current spec — pass straight to extractObliqueSlice. */
  spec: ObliqueSpec | null;
};

/**
 * Build an ObliqueSpec from Euler rotations and the volume info.
 * Exposed for tests + consumers that want to derive specs without the
 * hook lifecycle. Pure function, deterministic.
 */
export function buildObliqueSpec(
  volume: VolumeInfo,
  rotX: number,
  rotY: number,
  rotZ: number
): ObliqueSpec {
  // Rotation matrices (intrinsic XYZ). Apply Rx, then Ry, then Rz to
  // the canonical axial basis u=(1,0,0), v=(0,1,0).
  const cx = Math.cos(rotX);
  const sx = Math.sin(rotX);
  const cy = Math.cos(rotY);
  const sy = Math.sin(rotY);
  const cz = Math.cos(rotZ);
  const sz = Math.sin(rotZ);

  // Combined rotation matrix R = Rz · Ry · Rx. We only need the first
  // two columns (since u' = R·(1,0,0) and v' = R·(0,1,0)); the third
  // column is the implicit plane normal we never explicitly use.
  const r00 = cz * cy;
  const r01 = cz * sy * sx - sz * cx;
  const r10 = sz * cy;
  const r11 = sz * sy * sx + cz * cx;
  const r20 = -sy;
  const r21 = cy * sx;

  // Canonical basis rotated: u = R · (1,0,0), v = R · (0,1,0).
  const u: [number, number, number] = [r00, r10, r20];
  const v: [number, number, number] = [r01, r11, r21];

  // Volume centre in mm.
  const center: [number, number, number] = [
    ((volume.columns - 1) * volume.pixelSpacingCol) / 2,
    ((volume.rows - 1) * volume.pixelSpacingRow) / 2,
    ((volume.depth - 1) * volume.sliceSpacing) / 2,
  ];

  // Output sizing: diagonal of the volume (in mm) at the smallest axis
  // pixel size, so the whole volume always fits regardless of plane
  // orientation. The output is square — easier UX, only ~30% wasted
  // pixels for a typical CT.
  const extentX = (volume.columns - 1) * volume.pixelSpacingCol;
  const extentY = (volume.rows - 1) * volume.pixelSpacingRow;
  const extentZ = (volume.depth - 1) * volume.sliceSpacing;
  const diagMm = Math.sqrt(
    extentX * extentX + extentY * extentY + extentZ * extentZ
  );
  const pixelSpacingMm = Math.min(
    volume.pixelSpacingRow,
    volume.pixelSpacingCol,
    volume.sliceSpacing
  );
  const sideLen = Math.max(2, Math.ceil(diagMm / pixelSpacingMm));

  return {
    centerMm: center,
    uMm: u,
    vMm: v,
    columns: sideLen,
    rows: sideLen,
    pixelSpacingMm,
  };
}

export function useObliqueController(
  volume: VolumeInfo | null
): ObliqueController {
  const [rotX, setRotX] = useState(0);
  const [rotY, setRotY] = useState(0);
  const [rotZ, setRotZ] = useState(0);

  const reset = useCallback(() => {
    setRotX(0);
    setRotY(0);
    setRotZ(0);
  }, []);

  const spec = useMemo<ObliqueSpec | null>(() => {
    if (!volume) return null;
    return buildObliqueSpec(volume, rotX, rotY, rotZ);
  }, [volume, rotX, rotY, rotZ]);

  return { rotX, rotY, rotZ, setRotX, setRotY, setRotZ, reset, spec };
}
