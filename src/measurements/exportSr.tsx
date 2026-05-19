import type { Measurement, PixelSpacingMm } from './types';

export type SrSourceRefs = {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  sopInstanceUID: string;
  /** SOP Class of the source image (e.g. MR Image Storage). */
  sopClassUID: string;
};

/**
 * Web fallback. Native implementations call into the TurboModule via
 * exportSr.native.tsx.
 */
export function exportBasicTextSr(
  _measurements: Measurement[],
  _spacing: PixelSpacingMm | null,
  _outPath: string,
  _refs: SrSourceRefs
): string {
  throw new Error(
    "'@vibepasson/vibe-native-dicom' is only supported on native platforms."
  );
}

export { measurementsToSrLines } from './srLines';
