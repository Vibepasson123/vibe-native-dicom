// Web fallback: the package has no web target today. Throwing is consistent
// with the existing multiply.tsx pattern and surfaces a clear error if a
// consumer accidentally bundles this for web.

export function getGdcmVersion(): string {
  throw new Error(
    "'@vibepasson/vibe-native-dicom' is only supported on native platforms."
  );
}
