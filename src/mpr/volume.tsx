// Phase 5.1 — Volume / MPR public surface (web fallback).

import type { MprPlane, MprSliceInfo, VolumeInfo } from './types';

export function buildVolumeFromDicoms(_dicomPaths: string[]): VolumeInfo {
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

export function writeSyntheticVolumeSeries(
  _outDir: string,
  _numberOfSlices: number,
  _sliceSpacingMm: number
): string[] {
  throw new Error(
    "'@viveksah/vibe-native-dicom' is only supported on native platforms."
  );
}
