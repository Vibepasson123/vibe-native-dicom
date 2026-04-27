import VibeNativeDicom from './NativeVibeNativeDicom';

// Returns the version of the GDCM library linked into the package on this
// device (e.g. "3.2.5"). The string is identical on iOS and Android for the
// same package version (SR-0004, parity contract per architecture §5).
export function getGdcmVersion(): string {
  return VibeNativeDicom.getGdcmVersion();
}
