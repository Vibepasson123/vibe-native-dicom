// Shared types for the DICOM read API. Stable across the public surface and
// the native bridge; native code emits objects that match these shapes.

// A single DICOM data element. `vr` is the 2-char Value Representation
// (e.g. 'PN', 'DA', 'UI', 'DS'), `value` is the parsed value or null when
// the element is present but empty (DICOM "Type 2" empty values).
export type DicomElement = {
  vr: string;
  value: string | number | number[] | null;
};

// Dataset keyed by uppercase "GGGG,EEEE" hex string (e.g. "0010,0010").
// We deliberately do NOT keyword-name tags here — the standard tag list
// has thousands of entries and consumers may need private tags. Helpers
// like `getPatientName(ds)` ship in Phase 2.2.
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
