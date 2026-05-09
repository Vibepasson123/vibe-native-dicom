import VibeNativeDicom from '../NativeVibeNativeDicom';
import type {
  BuildVolumeOptions,
  MprPlane,
  MprSliceInfo,
  VolumeInfo,
} from './types';

const PLANE_TO_INT: Record<MprPlane, number> = {
  axial: 0,
  sagittal: 1,
  coronal: 2,
};

export function buildVolumeFromDicoms(
  dicomPaths: string[],
  opts: BuildVolumeOptions = {}
): VolumeInfo {
  return VibeNativeDicom.buildVolumeFromDicoms(
    JSON.stringify(dicomPaths),
    opts.resampleNonUniformZ ?? false
  ) as VolumeInfo;
}

export function extractMprSlice(
  handle: number,
  plane: MprPlane,
  index: number,
  outPath: string
): MprSliceInfo {
  return VibeNativeDicom.extractMprSlice(
    handle,
    PLANE_TO_INT[plane],
    Math.floor(index),
    outPath
  ) as MprSliceInfo;
}

export function releaseVolume(handle: number): void {
  VibeNativeDicom.releaseVolume(handle);
}

export type SyntheticVolumeSeriesOptions = {
  transferSyntaxUID?: string;
  gappedZ?: boolean;
};

export function writeSyntheticVolumeSeries(
  outDir: string,
  numberOfSlices: number,
  sliceSpacingMm: number,
  opts: SyntheticVolumeSeriesOptions = {}
): string[] {
  const json = VibeNativeDicom.writeSyntheticVolumeSeries(
    outDir,
    Math.floor(numberOfSlices),
    sliceSpacingMm,
    opts.transferSyntaxUID ?? '',
    opts.gappedZ ?? false
  );
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error('writeSyntheticVolumeSeries: native returned non-array');
  }
  return parsed as string[];
}
