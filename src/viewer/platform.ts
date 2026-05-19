// Web fallback. Native version lives in platform.native.ts.

export function readBinaryFile(_path: string, _maxBytes: number): string {
  throw new Error(
    "'@vibepasson/vibe-native-dicom' viewer is only supported on native platforms."
  );
}
