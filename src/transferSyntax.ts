// Canonical DICOM transfer-syntax UIDs supported by the package.
//
// Stays in lock-step with `kSupportedSyntaxes` in cpp/dicom_read.cpp.
// When adding a new decoder/encoder, update both this table and the C++
// table in the same commit, alongside the matching SR-XXXX row in the
// traceability matrix.

export const TransferSyntaxUID = {
  /** Implicit VR Little Endian (default). */
  ImplicitVRLittleEndian: '1.2.840.10008.1.2',
  /** Explicit VR Little Endian. */
  ExplicitVRLittleEndian: '1.2.840.10008.1.2.1',
  /** JPEG Baseline (Process 1) — lossy 8-bit. */
  JPEGBaselineProcess1: '1.2.840.10008.1.2.4.50',
  /** JPEG Extended (Processes 2 & 4) — lossy 12-bit. */
  JPEGExtendedProcess2_4: '1.2.840.10008.1.2.4.51',
  /** JPEG Lossless, Non-Hierarchical (Process 14). */
  JPEGLosslessProcess14: '1.2.840.10008.1.2.4.57',
  /** JPEG Lossless, SV1 (Process 14, Selection Value 1) — DICOM-canonical. */
  JPEGLosslessProcess14_SV1: '1.2.840.10008.1.2.4.70',
  /** JPEG-LS Lossless. */
  JPEGLSLossless: '1.2.840.10008.1.2.4.80',
  /** JPEG-LS Lossy (Near-Lossless). */
  JPEGLSNearLossless: '1.2.840.10008.1.2.4.81',
  /** JPEG 2000 Image Compression (Lossless Only). */
  JPEG2000Lossless: '1.2.840.10008.1.2.4.90',
  /** JPEG 2000 Image Compression (Lossy or Lossless). */
  JPEG2000: '1.2.840.10008.1.2.4.91',
  /** RLE Lossless. */
  RLELossless: '1.2.840.10008.1.2.5',
} as const;

export type TransferSyntaxUIDValue =
  (typeof TransferSyntaxUID)[keyof typeof TransferSyntaxUID];

/** Lossless transfer syntaxes — pixel data round-trips byte-for-byte. */
export const LOSSLESS_TRANSFER_SYNTAXES: readonly TransferSyntaxUIDValue[] = [
  TransferSyntaxUID.ImplicitVRLittleEndian,
  TransferSyntaxUID.ExplicitVRLittleEndian,
  TransferSyntaxUID.JPEGLosslessProcess14,
  TransferSyntaxUID.JPEGLosslessProcess14_SV1,
  TransferSyntaxUID.JPEGLSLossless,
  TransferSyntaxUID.JPEG2000Lossless,
  TransferSyntaxUID.RLELossless,
];

/** Lossy transfer syntaxes — pixel data is reconstructed and may diverge. */
export const LOSSY_TRANSFER_SYNTAXES: readonly TransferSyntaxUIDValue[] = [
  TransferSyntaxUID.JPEGBaselineProcess1,
  TransferSyntaxUID.JPEGExtendedProcess2_4,
  TransferSyntaxUID.JPEGLSNearLossless,
  TransferSyntaxUID.JPEG2000,
];
