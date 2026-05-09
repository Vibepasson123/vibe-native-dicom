// Phase 5.1 — Volume / MPR public surface (web fallback).

import type {
  BuildVolumeOptions,
  MprPlane,
  MprSliceInfo,
  ObliqueSpec,
  VolumeInfo,
} from './types';

export function buildVolumeFromDicoms(
  _dicomPaths: string[],
  _opts?: BuildVolumeOptions
): VolumeInfo {
  throw new Error(
    "'@viveksah/vibe-native-dicom' is only supported on native platforms."
  );
}

export function extractMprSlice(
  _handle: number,
  _plane: MprPlane,
  _index: number,
  _outPath: string
): MprSliceInfo {
  throw new Error(
    "'@viveksah/vibe-native-dicom' is only supported on native platforms."
  );
}

export function releaseVolume(_handle: number): void {
  throw new Error(
    "'@viveksah/vibe-native-dicom' is only supported on native platforms."
  );
}

export function extractObliqueSlice(
  _handle: number,
  _spec: ObliqueSpec,
  _outPath: string
): MprSliceInfo {
  throw new Error(
    "'@viveksah/vibe-native-dicom' is only supported on native platforms."
  );
}

export type SyntheticVolumeSeriesOptions = {
  /** Empty defaults to Implicit VR LE. */
  transferSyntaxUID?: string;
  /** Alternates Δz between spacing and 2×spacing. Default false. */
  gappedZ?: boolean;
};

export function writeSyntheticVolumeSeries(
  _outDir: string,
  _numberOfSlices: number,
  _sliceSpacingMm: number,
  _opts?: SyntheticVolumeSeriesOptions
): string[] {
  throw new Error(
    "'@viveksah/vibe-native-dicom' is only supported on native platforms."
  );
}
