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

struct DicomElement {
  // 2-char DICOM Value Representation (e.g. "PN", "UI", "DS").
  std::string vr;

  // The element's value, formatted as a string (DICOM's native form for
  // most VRs). Multi-valued elements (DS, IS, etc.) use the standard
  // backslash separator. Empty elements are present but with empty `value`.
  std::string value;

  // True when the element exists in the dataset but has no value
  // (DICOM "Type 2"). Distinguishes "missing tag" (entry absent from the
  // map entirely) from "tag present, value empty".
  bool isEmpty;
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

  // Uncompressed pixel data, encoded as base64. Empty when the dataset has
  // no PixelData (e.g. Structured Reports) or when the transfer syntax is
  // compressed (Phase 2.2 will decode these).
  std::string pixelDataBase64;

  // True when the dataset has a PixelData (7FE0,0010) element AND we were
  // able to extract uncompressed pixels into `pixelDataBase64`.
  bool hasPixelData;
};

struct DicomFile {
  std::string transferSyntaxUID;
  std::string sopClassUID;
  std::string sopInstanceUID;

  // Dataset keyed by uppercase "GGGG,EEEE" hex string.
  std::map<std::string, DicomElement> dataset;

  DicomImage image;
};

// Reads `path` via gdcm::Reader and fills `out`. Throws std::runtime_error
// on:
//   - file unreadable / not present
//   - file is not a valid DICOM (no preamble + DICM magic)
//   - transfer syntax is one we don't yet support (Phase 2.1: Implicit VR
//     Little Endian + Explicit VR Little Endian only).
// All other DICOM parse errors are surfaced as runtime_errors with a
// human-readable message.
void readDicomFile(const std::string& path, DicomFile& out);

// Writes a minimal valid DICOM file (16x16 monochrome MR, Implicit VR LE,
// SOP Class "MR Image Storage") to `path`. Used by the example app's
// round-trip smoke test before SR-0012 ships fixture loading. Throws
// std::runtime_error on write failure.
void writeSyntheticDicomFile(const std::string& path);

}  // namespace vnd
