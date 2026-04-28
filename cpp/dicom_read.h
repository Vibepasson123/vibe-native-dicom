// Shared C++ helpers for reading and writing DICOM files via GDCM.
// Compiled into both the iOS pod (via podspec source_files extension) and
// the Android JNI .so (via android/src/main/cpp/CMakeLists.txt).
//
// All public symbols are namespaced under `vnd::` (vibe-native-dicom) so
// they don't collide with GDCM's own namespaces if a consumer ever links
// us into a larger app that also depends on GDCM directly.

#pragma once

#include <map>
#include <string>
#include <vector>

namespace vnd {

// Forward declaration — DicomElement is a recursive type because SQ
// (Sequence) elements contain a list of items, each item being itself a
// dataset (i.e. a map of DicomElements).
struct DicomElement;

// A flat dataset keyed by uppercase "GGGG,EEEE" hex string. SQ items are
// represented inline via DicomElement::items rather than via reserved
// keys, so consumers can iterate `dataset` without filtering.
using DicomDataset = std::map<std::string, DicomElement>;

struct DicomElement {
  // 2-char DICOM Value Representation (e.g. "PN", "UI", "DS", "SQ").
  std::string vr;

  // The element's value, formatted as a string (DICOM's native form for
  // most VRs). Multi-valued elements (DS, IS, etc.) use the standard
  // backslash separator. Empty elements are present but with empty `value`.
  // Always empty when vr == "SQ" — sequence content lives in `items`.
  std::string value;

  // True when the element exists in the dataset but has no value
  // (DICOM "Type 2"). Distinguishes "missing tag" (entry absent from the
  // map entirely) from "tag present, value empty".
  bool isEmpty;

  // Sequence items, in order. Populated only when vr == "SQ"; empty for
  // all other VRs. An SQ may legitimately contain zero items (Type 2
  // empty sequences).
  std::vector<DicomDataset> items;
};

// Image attributes pulled out of the dataset for ergonomics. Mirrors the
// TS DicomImage type.
struct DicomImage {
  int rows;
  int columns;
  int bitsAllocated;
  int bitsStored;
  int highBit;
  int pixelRepresentation;  // 0=unsigned, 1=signed
  int samplesPerPixel;
  std::string photometricInterpretation;
  int numberOfFrames;

  // Uncompressed pixel data (post-decode), encoded as base64. Empty when
  // the dataset has no PixelData (e.g. Structured Reports) or when the
  // transfer syntax is unsupported by the current Phase. For lossy
  // transfer syntaxes (JPEG Baseline / Extended / JPEG-LS Near-Lossless /
  // JPEG 2000 lossy) the bytes here are the GDCM-decoded result and will
  // not byte-match the input image; for lossless syntaxes (Implicit/
  // Explicit VR LE, JPEG Lossless P14, JPEG-LS Lossless, JPEG 2000
  // Lossless, RLE Lossless) the bytes round-trip exactly.
  std::string pixelDataBase64;

  // True when the dataset has a PixelData (7FE0,0010) element AND we were
  // able to extract uncompressed pixels into `pixelDataBase64`.
  bool hasPixelData;
};

struct DicomFile {
  std::string transferSyntaxUID;
  std::string sopClassUID;
  std::string sopInstanceUID;

  DicomDataset dataset;
  DicomImage image;
};

// Reads `path` via gdcm::Reader and fills `out`. Throws std::runtime_error
// on:
//   - file unreadable / not present
//   - file is not a valid DICOM (no preamble + DICM magic)
// For unsupported transfer syntaxes the function returns successfully with
// the metadata populated but `image.hasPixelData = false` and
// `pixelDataBase64` empty — the caller MUST check `hasPixelData` before
// rendering. This is a deliberate safety contract: never substitute
// undefined bytes when we can't decode the actual pixel stream
// (hazard H-021).
//
// Supported transfer syntaxes for pixel-data extraction (Phase 2.2):
//   - Implicit VR Little Endian            (1.2.840.10008.1.2)
//   - Explicit VR Little Endian            (1.2.840.10008.1.2.1)
//   - JPEG Baseline (Process 1)            (1.2.840.10008.1.2.4.50)
//   - JPEG Extended (Process 2 & 4)        (1.2.840.10008.1.2.4.51)
//   - JPEG Lossless, Non-Hierarchical (P14)(1.2.840.10008.1.2.4.57)
//   - JPEG Lossless, SV1   (Process 14, SV1)(1.2.840.10008.1.2.4.70)
//   - JPEG-LS Lossless                     (1.2.840.10008.1.2.4.80)
//   - JPEG-LS Lossy (Near-Lossless)        (1.2.840.10008.1.2.4.81)
//   - JPEG 2000 Lossless                   (1.2.840.10008.1.2.4.90)
//   - JPEG 2000                            (1.2.840.10008.1.2.4.91)
//   - RLE Lossless                         (1.2.840.10008.1.2.5)
// Unsupported (returns metadata + hasPixelData=false): MPEG family, big-
// endian (rare/deprecated), Deflated, HTJ2K, JPIP-Referenced.
void readDicomFile(const std::string& path, DicomFile& out);

// Returns true when the given DICOM transfer-syntax UID is on the Phase 2.2
// decode whitelist (see readDicomFile docstring for the list). Exposed so
// callers / tests can probe support without needing to read a file.
bool isSupportedTransferSyntax(const std::string& transferSyntaxUID);

// Writes a minimal valid DICOM (16x16 monochrome 8-bit MR Image Storage)
// to `path` in the given transfer syntax. `transferSyntaxUID` must be one
// of the values returned true by isSupportedTransferSyntax(); otherwise
// throws std::runtime_error. An empty `transferSyntaxUID` defaults to
// Implicit VR Little Endian (the historical Phase 2.1 behaviour).
//
// The pixel data is a deterministic 256-byte gradient (idx % 256) so
// consumers can verify byte-for-byte round-trip integrity for lossless
// syntaxes.
void writeSyntheticDicomFile(const std::string& path,
                             const std::string& transferSyntaxUID = "");

}  // namespace vnd
