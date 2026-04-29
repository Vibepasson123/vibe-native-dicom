// Shared types for the DICOM read API. Stable across the public surface and
// the native bridge; native code emits objects that match these shapes.

// A single DICOM data element. `vr` is the 2-char Value Representation
// (e.g. 'PN', 'DA', 'UI', 'DS', 'SQ'), `value` is the parsed value or null
// when the element is present but empty (DICOM "Type 2" empty values).
//
// Sequence (SQ) elements set `value` to null and populate `items` with the
// nested datasets in DICOM order. An SQ may legitimately have zero items
// (Type 2 empty sequence); helpers should treat `items: []` as "present
// but empty" and `items: undefined` as "not a sequence".
export type DicomElement = {
  vr: string;
  value: string | number | number[] | null;
  items?: DicomDataset[];
};

// Dataset keyed by uppercase "GGGG,EEEE" hex string (e.g. "0010,0010").
// We deliberately do NOT keyword-name tags here — the standard tag list
// has thousands of entries and consumers may need private tags. The
// ergonomic helpers in src/helpers.ts cover the most common viewer tags.
export type DicomDataset = { [tagHex: string]: DicomElement };

// Image attributes pulled out of the dataset for ergonomics — all viewer
// code wants these together. Phase 2.1 ships uncompressed pixel data only;
// `hasPixelData` is false (and `pixelDataBase64` is null) when:
//   - the dataset has no PixelData (7FE0,0010), e.g. SR documents
//   - the transfer syntax is compressed (Phase 2.2 will decode these)
export type DicomImage = {
  rows: number;
  columns: number;
  bitsAllocated: number;
  bitsStored: number;
  highBit: number;
  pixelRepresentation: 0 | 1; // 0=unsigned, 1=signed
  samplesPerPixel: number;
  photometricInterpretation: string;
  numberOfFrames: number;
  hasPixelData: boolean;
  pixelDataBase64: string | null;
};

export type DicomFile = {
  transferSyntaxUID: string;
  sopClassUID: string;
  sopInstanceUID: string;
  dataset: DicomDataset;
  // null when the dataset has no PixelData group (SR, presentation states).
  image: DicomImage | null;
};

// Phase 2.5 — pixel-data extraction result.
//
// Returned by `extractPixelDataToFile()`. Bytes are written to `filePath`
// on the device's filesystem; consumers read them with whatever file API
// they already use (react-native-fs, expo-file-system, the native
// renderer's mmap path, etc.). This avoids the 33% bridge bloat + 75% CPU
// hit of the base64 path on `readDicom().image.pixelDataBase64`.
//
// `hasPixelData=false` cases (no PixelData element, unsupported transfer
// syntax) leave `filePath` empty — the file is NOT created. Always check
// the flag before reading.
export type PixelDataInfo = {
  filePath: string;
  byteLength: number;
  rows: number;
  columns: number;
  bitsAllocated: number;
  samplesPerPixel: number;
  photometricInterpretation: string;
  numberOfFrames: number;
  hasPixelData: boolean;
};
