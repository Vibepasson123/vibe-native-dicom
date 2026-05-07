import VibeNativeDicom from '../NativeVibeNativeDicom';
import type { Measurement, PixelSpacingMm } from './types';
import { measurementsToSrLines } from './srLines';
import type { SrSourceRefs } from './exportSr';

export { measurementsToSrLines };
export type { SrSourceRefs };

export function exportBasicTextSr(
  measurements: Measurement[],
  spacing: PixelSpacingMm | null,
  outPath: string,
  refs: SrSourceRefs
): string {
  const lines = measurementsToSrLines(measurements, spacing);
  return VibeNativeDicom.exportBasicTextSr(
    outPath,
    JSON.stringify(lines),
    refs.studyInstanceUID,
    refs.seriesInstanceUID,
    refs.sopInstanceUID,
    refs.sopClassUID
  );
}
