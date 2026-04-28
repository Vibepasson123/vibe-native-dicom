import type { DicomFile } from './types';

export function readDicom(_path: string): DicomFile {
  throw new Error(
    "'@viveksah/vibe-native-dicom' is only supported on native platforms."
  );
}

export function writeSyntheticDicom(): string {
  throw new Error(
    "'@viveksah/vibe-native-dicom' is only supported on native platforms."
  );
}
