import VibeNativeDicom from '../NativeVibeNativeDicom';

export function readBinaryFile(path: string, maxBytes: number): string {
  return VibeNativeDicom.readBinaryFile(path, maxBytes);
}
