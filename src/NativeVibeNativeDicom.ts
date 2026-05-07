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
  writeSyntheticDicom(
    transferSyntaxUID: string,
    numberOfFrames: number
  ): string;

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

  // Phase 2.5 (SR-0017): extract uncompressed pixel data to a file on
  // disk and return its path + geometry. Bytes never traverse the JSI
  // bridge — for a 50 MB CT this is ~3000× faster than the base64 path
  // exposed via readDicom().image.pixelDataBase64. Caller picks `outPath`
  // (typically a tmpdir under cacheDir / NSTemporaryDirectory). On
  // unsupported transfer syntaxes the call succeeds but returned
  // hasPixelData is false and no file is written — the H-021 contract
  // applies here too.
  extractPixelDataToFile(dicomPath: string, outPath: string): Object;

  // Phase 3.1: read a binary file at `path` and return its bytes as a
  // Latin-1-encoded string (one JS char per byte). The viewer uses this
  // to slurp pixel buffers without depending on react-native-fs. Pass
  // maxBytes=0 for unlimited; values >0 cap memory usage and throw if
  // the file is larger.
  readBinaryFile(path: string, maxBytes: number): string;

  // Phase 4.2 (SR-0023): write a Basic Text Structured Report (DICOM SOP
  // Class 1.2.840.10008.5.1.4.1.1.88.11) containing the supplied
  // measurement lines. The SR references the source image via
  // (0040,A375) Current Requested Procedure Evidence Sequence, so a
  // PACS can correlate the report to the slice the user measured on.
  // Returns the path written. Lines is passed as a JSON-encoded
  // string-array — codegen rejects array-of-string at the spec level.
  exportBasicTextSr(
    outPath: string,
    measurementLinesJson: string,
    sourceStudyInstanceUID: string,
    sourceSeriesInstanceUID: string,
    sourceSopInstanceUID: string,
    sourceSopClassUID: string
  ): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('VibeNativeDicom');
