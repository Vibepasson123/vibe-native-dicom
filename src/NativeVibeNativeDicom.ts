import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  // Phase 0 placeholder — kept until first real DICOM API lands so codegen
  // and the example app's smoke wiring don't have to migrate twice.
  multiply(a: number, b: number): number;

  // Phase 1.4 (SR-0004): returns the version string of the linked GDCM
  // library. Same string on iOS and Android (cross-platform parity).
  getGdcmVersion(): string;

  // Phase 2.1 (SR-0012) / Phase 2.2 (SR-0013): synthesize a minimal valid
  // DICOM file in tmpdir and return its path. Used by the example app's
  // read-back smoke test and by integration tests until fixture loading
  // ships. The synthesized file is a 16×16 monochrome 8-bit MR Image
  // Storage with a deterministic gradient pixel buffer.
  //
  // `transferSyntaxUID` selects the encoding. Empty string defaults to
  // Implicit VR Little Endian (Phase 2.1 behaviour). Any value that fails
  // `isSupportedTransferSyntax()` raises a JS exception. See
  // src/transferSyntax.ts for the canonical UID constants.
  writeSyntheticDicom(transferSyntaxUID: string): string;

  // Phase 2.2 (SR-0013): returns true when the package can decode pixel
  // data for the given transfer-syntax UID. Used by callers to filter
  // study lists before attempting to render. Stays in sync with the
  // C++ kSupportedSyntaxes table.
  isSupportedTransferSyntax(transferSyntaxUID: string): boolean;

  // Phase 2.1 (SR-0011) / Phase 2.2 (SR-0013): read a DICOM file from
  // `path`, parse the dataset, and return its metadata + decoded pixel
  // data. Throws if the file is unreadable or not a valid DICOM. For
  // unsupported transfer syntaxes returns metadata with
  // `image.hasPixelData = false` rather than substituting undefined bytes
  // (hazard H-021). See `isSupportedTransferSyntax()` for the whitelist.
  //
  // Return type is `Object` (untyped) because codegen requires the literal
  // name `Object`/`UnsafeObject` to emit a JSIObject/ReadableMap on the
  // bridge. The shape is described by `DicomFile` in src/types.ts; the JS
  // wrapper in src/readDicom.native.tsx casts to that shape.
  readDicom(path: string): Object;
}

export default TurboModuleRegistry.getEnforcing<Spec>('VibeNativeDicom');
