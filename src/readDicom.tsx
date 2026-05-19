import type { DicomFile, PixelDataInfo } from './types';

export function readDicom(_path: string): DicomFile {
  throw new Error(
    "'@vibepasson/vibe-native-dicom' is only supported on native platforms."
  );
}

export function writeSyntheticDicom(
  _transferSyntaxUID: string = '',
  _numberOfFrames: number = 1
): string {
  throw new Error(
    "'@vibepasson/vibe-native-dicom' is only supported on native platforms."
  );
}

export function isSupportedTransferSyntax(_transferSyntaxUID: string): boolean {
  throw new Error(
    "'@vibepasson/vibe-native-dicom' is only supported on native platforms."
  );
}

export function extractPixelDataToFile(
  _dicomPath: string,
  _outPath: string
): PixelDataInfo {
  throw new Error(
    "'@vibepasson/vibe-native-dicom' is only supported on native platforms."
  );
}
