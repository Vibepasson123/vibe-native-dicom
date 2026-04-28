import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  // Phase 0 placeholder — kept until first real DICOM API lands so codegen
  // and the example app's smoke wiring don't have to migrate twice.
  multiply(a: number, b: number): number;

  // Phase 1.4 (SR-0004): returns the version string of the linked GDCM
  // library. Same string on iOS and Android (cross-platform parity).
  getGdcmVersion(): string;

  // Phase 2.1 (SR-0011): synthesize a minimal valid DICOM file in tmpdir
  // and return its path. Used by the example app's read-back smoke test
  // and by integration tests until SR-0012 ships fixture loading.
  // The synthesized file is a 16x16 monochrome MR image, Implicit VR LE,
  // SOP Class "MR Image Storage". Useful for round-tripping read/write.
  writeSyntheticDicom(): string;

  // Phase 2.1 (SR-0011): read a DICOM file from `path`, parse the
  // dataset, and return its metadata + uncompressed pixel data.
  // Throws if the file is unreadable, not a DICOM, or uses a transfer
  // syntax not yet supported (Phase 2.1 supports Implicit/Explicit VR LE
  // only; compressed transfer syntaxes ship in Phase 2.2).
  //
  // Return type is `Object` (untyped) because codegen requires the literal
  // name `Object`/`UnsafeObject` to emit a JSIObject/ReadableMap on the
  // bridge. The shape is described by `DicomFile` in src/types.ts; the JS
  // wrapper in src/readDicom.native.tsx casts to that shape.
  readDicom(path: string): Object;
}

export default TurboModuleRegistry.getEnforcing<Spec>('VibeNativeDicom');
