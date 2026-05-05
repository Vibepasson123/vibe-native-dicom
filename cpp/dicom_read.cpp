#include "dicom_read.h"

#include <cstdio>
#include <cstring>
#include <sstream>
#include <stdexcept>
#include <vector>

#include "gdcmAttribute.h"
#include "gdcmDataElement.h"
#include "gdcmDataSet.h"
#include "gdcmFile.h"
#include "gdcmImage.h"
#include "gdcmImageChangeTransferSyntax.h"
#include "gdcmImageReader.h"
#include "gdcmImageWriter.h"
#include "gdcmItem.h"
#include "gdcmReader.h"
#include "gdcmSequenceOfItems.h"
#include "gdcmSmartPointer.h"
#include "gdcmTag.h"
#include "gdcmTransferSyntax.h"
#include "gdcmUIDGenerator.h"

namespace vnd {
namespace {

// Single source of truth for the Phase 2.2 transfer-syntax whitelist. Each
// entry is { canonical UID string, GDCM TSType }. New decoders are added
// here in lock-step with native-build / fixture / test work — never
// silently expand on the read side without the matching test fixture.
struct SupportedTS {
  const char* uid;
  gdcm::TransferSyntax::TSType type;
};

const SupportedTS kSupportedSyntaxes[] = {
    {"1.2.840.10008.1.2",
     gdcm::TransferSyntax::ImplicitVRLittleEndian},
    {"1.2.840.10008.1.2.1",
     gdcm::TransferSyntax::ExplicitVRLittleEndian},
    {"1.2.840.10008.1.2.4.50",
     gdcm::TransferSyntax::JPEGBaselineProcess1},
    {"1.2.840.10008.1.2.4.51",
     gdcm::TransferSyntax::JPEGExtendedProcess2_4},
    {"1.2.840.10008.1.2.4.57",
     gdcm::TransferSyntax::JPEGLosslessProcess14},
    {"1.2.840.10008.1.2.4.70",
     gdcm::TransferSyntax::JPEGLosslessProcess14_1},
    {"1.2.840.10008.1.2.4.80", gdcm::TransferSyntax::JPEGLSLossless},
    {"1.2.840.10008.1.2.4.81", gdcm::TransferSyntax::JPEGLSNearLossless},
    {"1.2.840.10008.1.2.4.90", gdcm::TransferSyntax::JPEG2000Lossless},
    {"1.2.840.10008.1.2.4.91", gdcm::TransferSyntax::JPEG2000},
    {"1.2.840.10008.1.2.5", gdcm::TransferSyntax::RLELossless},
};

bool isSupportedSyntax(const gdcm::TransferSyntax& ts) {
  const gdcm::TransferSyntax::TSType t = ts;
  for (const auto& entry : kSupportedSyntaxes) {
    if (entry.type == t) return true;
  }
  return false;
}

bool tsTypeFromUID(const std::string& uid,
                   gdcm::TransferSyntax::TSType& outType) {
  for (const auto& entry : kSupportedSyntaxes) {
    if (uid == entry.uid) {
      outType = entry.type;
      return true;
    }
  }
  return false;
}

std::string formatTagKey(const gdcm::Tag& tag) {
  char buf[10];
  std::snprintf(buf, sizeof(buf), "%04X,%04X",
                static_cast<unsigned>(tag.GetGroup()),
                static_cast<unsigned>(tag.GetElement()));
  return std::string(buf);
}

// Convert a DataElement's value bytes to a string. DICOM stores most VRs as
// printable ASCII inside the element body; binary VRs (OB, OW, UN, OF) we
// surface as empty here — callers fetch pixel data via the image struct.
std::string elementValueAsString(const gdcm::DataElement& de,
                                 const std::string& vr) {
  // Skip large binary VRs and the PixelData tag entirely.
  if (vr == "OB" || vr == "OW" || vr == "OF" || vr == "OD" || vr == "UN" ||
      vr == "SQ") {
    return "";
  }
  const gdcm::ByteValue* bv = de.GetByteValue();
  if (!bv) return "";
  const char* p = bv->GetPointer();
  if (!p) return "";
  const size_t len = bv->GetLength();
  if (len == 0) return "";
  std::string s(p, len);
  // DICOM right-pads strings with space (or null for UI). Trim trailing.
  while (!s.empty() && (s.back() == ' ' || s.back() == '\0')) s.pop_back();
  return s;
}

// Standard RFC 4648 base64. Small implementation — no need to pull in a
// 3rd-party dep just for this.
std::string base64Encode(const unsigned char* data, size_t len) {
  static const char kAlphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  out.reserve(((len + 2) / 3) * 4);
  size_t i = 0;
  while (i + 3 <= len) {
    unsigned v = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    out.push_back(kAlphabet[(v >> 18) & 0x3F]);
    out.push_back(kAlphabet[(v >> 12) & 0x3F]);
    out.push_back(kAlphabet[(v >> 6) & 0x3F]);
    out.push_back(kAlphabet[v & 0x3F]);
    i += 3;
  }
  if (i < len) {
    unsigned v = data[i] << 16;
    if (i + 1 < len) v |= data[i + 1] << 8;
    out.push_back(kAlphabet[(v >> 18) & 0x3F]);
    out.push_back(kAlphabet[(v >> 12) & 0x3F]);
    out.push_back(i + 1 < len ? kAlphabet[(v >> 6) & 0x3F] : '=');
    out.push_back('=');
  }
  return out;
}

template <uint16_t G, uint16_t E>
int readIntAttr(const gdcm::DataSet& ds, int defaultValue) {
  gdcm::Attribute<G, E> attr;
  if (!ds.FindDataElement(gdcm::Tag(G, E))) return defaultValue;
  attr.SetFromDataSet(ds);
  return static_cast<int>(attr.GetValue());
}

template <uint16_t G, uint16_t E>
std::string readStringAttr(const gdcm::DataSet& ds) {
  if (!ds.FindDataElement(gdcm::Tag(G, E))) return "";
  const gdcm::DataElement& de = ds.GetDataElement(gdcm::Tag(G, E));
  const gdcm::ByteValue* bv = de.GetByteValue();
  if (!bv || !bv->GetPointer()) return "";
  std::string s(bv->GetPointer(), bv->GetLength());
  while (!s.empty() && (s.back() == ' ' || s.back() == '\0')) s.pop_back();
  return s;
}

// Walks `ds` and fills `out` with one DicomElement per top-level data
// element. SQ (Sequence) elements recurse via DicomElement::items — each
// sequence item is itself a DicomDataset. Pixel data (7FE0,0010) is
// excluded here; it's surfaced via the DicomImage struct.
//
// Recursion is bounded by GDCM's own parser (gdcm::Reader rejects files
// with absurd nesting), so we don't need an explicit depth cap.
void walkDataSet(const gdcm::DataSet& ds, DicomDataset& out) {
  for (auto it = ds.Begin(); it != ds.End(); ++it) {
    const gdcm::DataElement& de = *it;
    const gdcm::Tag& tag = de.GetTag();
    if (tag.IsGroupLength()) continue;  // (gggg,0000) — internal
    if (tag == gdcm::Tag(0x7FE0, 0x0010)) continue;  // pixel data lives in DicomImage

    DicomElement elem;
    elem.vr = std::string(gdcm::VR::GetVRString(de.GetVR()));

    if (elem.vr == "SQ") {
      // SQ value is the items vector, not the inline string. An SQ may be
      // empty (Type 2 zero-item sequence) which is legitimate.
      gdcm::SmartPointer<gdcm::SequenceOfItems> seq = de.GetValueAsSQ();
      if (seq && seq->GetNumberOfItems() > 0) {
        elem.items.reserve(seq->GetNumberOfItems());
        for (gdcm::SequenceOfItems::SizeType i = 1;
             i <= seq->GetNumberOfItems(); ++i) {
          // GDCM uses 1-based indexing for items (DICOM convention).
          const gdcm::Item& item = seq->GetItem(i);
          DicomDataset itemDs;
          walkDataSet(item.GetNestedDataSet(), itemDs);
          elem.items.push_back(std::move(itemDs));
        }
      }
      elem.value = "";
      elem.isEmpty = elem.items.empty();
    } else {
      elem.value = elementValueAsString(de, elem.vr);
      elem.isEmpty = elem.value.empty() && de.GetVL() == 0;
    }

    out[formatTagKey(tag)] = std::move(elem);
  }
}

}  // namespace

void readDicomFile(const std::string& path, DicomFile& out) {
  gdcm::Reader reader;
  reader.SetFileName(path.c_str());
  if (!reader.Read()) {
    throw std::runtime_error(
        std::string("readDicom: not a readable DICOM file: ") + path);
  }

  const gdcm::File& file = reader.GetFile();
  const gdcm::DataSet& ds = file.GetDataSet();
  const gdcm::FileMetaInformation& meta = file.GetHeader();
  const gdcm::TransferSyntax ts = meta.GetDataSetTransferSyntax();

  out.transferSyntaxUID = ts.GetString() ? ts.GetString() : "";
  out.sopClassUID = readStringAttr<0x0008, 0x0016>(ds);
  out.sopInstanceUID = readStringAttr<0x0008, 0x0018>(ds);

  walkDataSet(ds, out.dataset);

  // Image attributes — present even if we can't decode pixels yet.
  out.image.rows = readIntAttr<0x0028, 0x0010>(ds, 0);
  out.image.columns = readIntAttr<0x0028, 0x0011>(ds, 0);
  out.image.bitsAllocated = readIntAttr<0x0028, 0x0100>(ds, 0);
  out.image.bitsStored = readIntAttr<0x0028, 0x0101>(ds, 0);
  out.image.highBit = readIntAttr<0x0028, 0x0102>(ds, 0);
  out.image.pixelRepresentation = readIntAttr<0x0028, 0x0103>(ds, 0);
  out.image.samplesPerPixel = readIntAttr<0x0028, 0x0002>(ds, 1);
  out.image.photometricInterpretation =
      readStringAttr<0x0028, 0x0004>(ds);
  out.image.numberOfFrames = readIntAttr<0x0028, 0x0008>(ds, 1);
  if (out.image.numberOfFrames < 1) out.image.numberOfFrames = 1;
  out.image.hasPixelData = false;
  out.image.pixelDataBase64 = "";

  const bool hasPixelDataTag =
      ds.FindDataElement(gdcm::Tag(0x7FE0, 0x0010));
  if (!hasPixelDataTag) {
    return;  // legitimate — SR documents, presentation states, etc.
  }

  // Phase 2.2: whitelist now includes uncompressed + JPEG family +
  // JPEG-LS + JPEG 2000 + RLE. Anything else (MPEG, big-endian,
  // HTJ2K, JPIP-Referenced, Deflated) returns the metadata but leaves
  // hasPixelData=false. Callers can still use the image attributes
  // for layout; the contract is "never substitute undefined bytes for
  // an unsupported syntax" (hazard H-021).
  if (!isSupportedSyntax(ts)) {
    return;
  }

  // Re-open with ImageReader to get the assembled pixel buffer. (Cheaper
  // than walking the encapsulated PixelData by hand, and GDCM handles the
  // padding/byte-order details for us.)
  gdcm::ImageReader ir;
  ir.SetFileName(path.c_str());
  if (!ir.Read()) {
    // The file parsed as a generic DICOM but isn't an image — fine, just
    // report no pixel data.
    return;
  }
  const gdcm::Image& img = ir.GetImage();
  const unsigned long bufLen = img.GetBufferLength();
  if (bufLen == 0) return;
  std::vector<char> buf(bufLen);
  if (!img.GetBuffer(buf.data())) {
    throw std::runtime_error(
        "readDicom: GDCM accepted the file but failed to extract pixel "
        "data; file may be malformed");
  }
  out.image.pixelDataBase64 = base64Encode(
      reinterpret_cast<const unsigned char*>(buf.data()), bufLen);
  out.image.hasPixelData = true;
}

bool isSupportedTransferSyntax(const std::string& transferSyntaxUID) {
  gdcm::TransferSyntax::TSType ignored;
  return tsTypeFromUID(transferSyntaxUID, ignored);
}

void writeSyntheticDicomFile(const std::string& path,
                             const std::string& transferSyntaxUID,
                             int numberOfFrames) {
  // Resolve target transfer syntax. Empty string keeps the historical
  // Phase 2.1 default (Implicit VR LE).
  gdcm::TransferSyntax::TSType targetType =
      gdcm::TransferSyntax::ImplicitVRLittleEndian;
  if (!transferSyntaxUID.empty()) {
    if (!tsTypeFromUID(transferSyntaxUID, targetType)) {
      throw std::runtime_error(
          std::string("writeSyntheticDicom: unsupported transfer syntax UID: ")
          + transferSyntaxUID);
    }
  }

  if (numberOfFrames < 1) numberOfFrames = 1;

  // Phase 3.4: multi-frame is uncompressed-only. Adding the encapsulated
  // pixel-data fragments table for compressed multi-frame is more than
  // this phase needs; consumers can slice their own DICOMs.
  if (numberOfFrames > 1 &&
      targetType != gdcm::TransferSyntax::ImplicitVRLittleEndian &&
      targetType != gdcm::TransferSyntax::ExplicitVRLittleEndian) {
    throw std::runtime_error(
        "writeSyntheticDicom: numberOfFrames > 1 is only supported for "
        "Implicit/Explicit VR Little Endian transfer syntaxes");
  }

  // 16×16 monochrome 8-bit MR image. Pixels are a deterministic gradient
  // (idx % 256) so consumers can verify byte-for-byte round-trip integrity
  // for lossless syntaxes. For lossy syntaxes the image is coarse enough
  // (256 px) that JPEG Baseline still has plenty to work with. For multi-
  // frame each frame f shifts the gradient by f*8 bytes so cine playback
  // shows visible motion.
  const int kRows = 16;
  const int kCols = 16;
  const int kPerFrame = kRows * kCols;
  const int kBytes = kPerFrame * numberOfFrames;
  std::vector<unsigned char> pixels(static_cast<size_t>(kBytes));
  for (int f = 0; f < numberOfFrames; ++f) {
    const int offset = (f * 8);  // 8-pixel per-frame shift
    for (int i = 0; i < kPerFrame; ++i) {
      pixels[f * kPerFrame + i] =
          static_cast<unsigned char>((i + offset) & 0xFF);
    }
  }

  gdcm::Image img;
  if (numberOfFrames > 1) {
    // 3D image: dim 2 carries the frame count.
    img.SetNumberOfDimensions(3);
    img.SetDimension(0, kCols);
    img.SetDimension(1, kRows);
    img.SetDimension(2, numberOfFrames);
  } else {
    img.SetNumberOfDimensions(2);
    img.SetDimension(0, kCols);
    img.SetDimension(1, kRows);
  }
  img.SetPhotometricInterpretation(
      gdcm::PhotometricInterpretation::MONOCHROME2);
  img.GetPixelFormat().SetSamplesPerPixel(1);
  img.SetPixelFormat(gdcm::PixelFormat::UINT8);
  // Build the *source* image as Implicit VR LE. If the target is
  // compressed we'll convert via ImageChangeTransferSyntax below.
  img.SetTransferSyntax(gdcm::TransferSyntax::ImplicitVRLittleEndian);

  gdcm::DataElement pixelData(gdcm::Tag(0x7FE0, 0x0010));
  pixelData.SetByteValue(reinterpret_cast<const char*>(pixels.data()),
                         static_cast<uint32_t>(pixels.size()));
  img.SetDataElement(pixelData);

  // If the caller asked for a compressed syntax, run the source image
  // through GDCM's encoder pipeline. We use the bundled libjpeg-turbo /
  // CharLS / OpenJPEG via gdcmjpeg* / gdcmcharls / gdcmopenjp2 — the
  // ImageChangeTransferSyntax filter handles codec dispatch internally.
  const bool needsRecompress =
      targetType != gdcm::TransferSyntax::ImplicitVRLittleEndian &&
      targetType != gdcm::TransferSyntax::ExplicitVRLittleEndian;

  gdcm::Image outImg;
  if (needsRecompress) {
    gdcm::ImageChangeTransferSyntax change;
    change.SetTransferSyntax(gdcm::TransferSyntax(targetType));
    change.SetInput(img);
    if (!change.Change()) {
      throw std::runtime_error(
          std::string("writeSyntheticDicom: GDCM failed to encode to ")
          + transferSyntaxUID);
    }
    outImg = change.GetOutput();
  } else {
    outImg = img;
    outImg.SetTransferSyntax(gdcm::TransferSyntax(targetType));
  }

  gdcm::ImageWriter writer;
  writer.SetFileName(path.c_str());
  writer.SetImage(outImg);

  // Required Type 1 attributes for MR Image Storage. Without these GDCM
  // refuses to write.
  gdcm::DataSet& ds = writer.GetFile().GetDataSet();
  gdcm::UIDGenerator uid;

  auto setUI = [&](uint16_t g, uint16_t e, const char* value) {
    gdcm::DataElement de(gdcm::Tag(g, e));
    de.SetVR(gdcm::VR::UI);
    de.SetByteValue(value, static_cast<uint32_t>(std::strlen(value)));
    ds.Replace(de);
  };
  auto setText = [&](uint16_t g, uint16_t e, gdcm::VR vr, const char* value) {
    gdcm::DataElement de(gdcm::Tag(g, e));
    de.SetVR(vr);
    de.SetByteValue(value, static_cast<uint32_t>(std::strlen(value)));
    ds.Replace(de);
  };

  // SOP Class: MR Image Storage (1.2.840.10008.5.1.4.1.1.4)
  setUI(0x0008, 0x0016, "1.2.840.10008.5.1.4.1.1.4");
  setUI(0x0008, 0x0018, uid.Generate());
  setUI(0x0020, 0x000D, uid.Generate());
  setUI(0x0020, 0x000E, uid.Generate());
  setText(0x0008, 0x0060, gdcm::VR::CS, "MR");
  setText(0x0010, 0x0010, gdcm::VR::PN,
          "VibeNativeDicom^Synthetic");
  setText(0x0010, 0x0020, gdcm::VR::LO, "VND-SYN-001");
  setText(0x0008, 0x0020, gdcm::VR::DA, "20260101");
  setText(0x0008, 0x0030, gdcm::VR::TM, "120000");
  setText(0x0008, 0x0050, gdcm::VR::SH, "VND0001");
  setText(0x0010, 0x0030, gdcm::VR::DA, "20000101");
  setText(0x0010, 0x0040, gdcm::VR::CS, "O");
  setText(0x0020, 0x0010, gdcm::VR::SH, "1");
  setText(0x0020, 0x0011, gdcm::VR::IS, "1");
  setText(0x0020, 0x0013, gdcm::VR::IS, "1");
  // Phase 3.4: NumberOfFrames is required when > 1 (Type 1 for the
  // Multi-frame functional groups; Type 1C otherwise but always safe).
  if (numberOfFrames > 1) {
    char nfBuf[16];
    std::snprintf(nfBuf, sizeof(nfBuf), "%d", numberOfFrames);
    setText(0x0028, 0x0008, gdcm::VR::IS, nfBuf);
  }
  // Viewer-relevant attributes — the Phase 2.3 ergonomic helpers
  // (getPixelSpacing, getWindowCenter, getRescaleSlope, …) read these.
  // Values picked so the round-trip test can assert exact byte equality
  // for lossless syntaxes.
  setText(0x0008, 0x1030, gdcm::VR::LO, "VND Synthetic Study");
  setText(0x0008, 0x103E, gdcm::VR::LO, "VND Synthetic Series");
  setText(0x0028, 0x0030, gdcm::VR::DS, "0.5\\0.5");      // PixelSpacing
  setText(0x0028, 0x1050, gdcm::VR::DS, "128");           // WindowCenter
  setText(0x0028, 0x1051, gdcm::VR::DS, "256");           // WindowWidth
  setText(0x0028, 0x1052, gdcm::VR::DS, "0");             // RescaleIntercept
  setText(0x0028, 0x1053, gdcm::VR::DS, "1");             // RescaleSlope

  // Procedure Code Sequence (0008,1032) — a Type 3 SQ on MR Image
  // Storage. Embedding one gives Phase 2.3 round-trip coverage of SQ
  // walking. One item with the standard code-tuple shape.
  {
    gdcm::SmartPointer<gdcm::SequenceOfItems> seq = new gdcm::SequenceOfItems();
    seq->SetLengthToUndefined();
    gdcm::Item item;
    item.SetVLToUndefined();
    gdcm::DataSet& itemDs = item.GetNestedDataSet();
    auto setItemText = [&](uint16_t g, uint16_t e, gdcm::VR vr,
                           const char* value) {
      gdcm::DataElement de(gdcm::Tag(g, e));
      de.SetVR(vr);
      de.SetByteValue(value, static_cast<uint32_t>(std::strlen(value)));
      itemDs.Replace(de);
    };
    setItemText(0x0008, 0x0100, gdcm::VR::SH, "VND-001");      // CodeValue
    setItemText(0x0008, 0x0102, gdcm::VR::SH, "VND");          // CodingSchemeDesignator
    setItemText(0x0008, 0x0104, gdcm::VR::LO, "Synthetic procedure");  // CodeMeaning
    seq->AddItem(item);

    gdcm::DataElement seqDe(gdcm::Tag(0x0008, 0x1032));
    seqDe.SetVR(gdcm::VR::SQ);
    seqDe.SetValue(*seq);
    seqDe.SetVLToUndefined();
    ds.Replace(seqDe);
  }

  if (!writer.Write()) {
    throw std::runtime_error(
        std::string("writeSyntheticDicom: failed to write to ") + path);
  }
}

void extractPixelDataToFile(const std::string& dicomPath,
                            const std::string& outPath,
                            PixelDataInfo& out) {
  out.filePath.clear();
  out.byteLength = 0;
  out.rows = 0;
  out.columns = 0;
  out.bitsAllocated = 0;
  out.samplesPerPixel = 0;
  out.photometricInterpretation.clear();
  out.numberOfFrames = 1;
  out.hasPixelData = false;

  // First pass: parse the file like readDicomFile does, just to gate on
  // transfer-syntax support and grab the image attributes. Cheap — the
  // metadata pass doesn't decode pixels.
  gdcm::Reader reader;
  reader.SetFileName(dicomPath.c_str());
  if (!reader.Read()) {
    throw std::runtime_error(
        std::string("extractPixelData: not a readable DICOM file: ")
        + dicomPath);
  }
  const gdcm::File& file = reader.GetFile();
  const gdcm::DataSet& ds = file.GetDataSet();
  const gdcm::TransferSyntax ts =
      file.GetHeader().GetDataSetTransferSyntax();

  out.rows = readIntAttr<0x0028, 0x0010>(ds, 0);
  out.columns = readIntAttr<0x0028, 0x0011>(ds, 0);
  out.bitsAllocated = readIntAttr<0x0028, 0x0100>(ds, 0);
  out.samplesPerPixel = readIntAttr<0x0028, 0x0002>(ds, 1);
  out.photometricInterpretation = readStringAttr<0x0028, 0x0004>(ds);
  out.numberOfFrames = readIntAttr<0x0028, 0x0008>(ds, 1);
  if (out.numberOfFrames < 1) out.numberOfFrames = 1;

  if (!ds.FindDataElement(gdcm::Tag(0x7FE0, 0x0010))) {
    return;  // no pixel data — legitimate (SR documents, etc.)
  }
  if (!isSupportedSyntax(ts)) {
    return;  // hazard H-021 — never substitute bytes for unsupported syntax
  }

  // Second pass: GDCM ImageReader does the decode + buffer assembly.
  gdcm::ImageReader ir;
  ir.SetFileName(dicomPath.c_str());
  if (!ir.Read()) {
    return;  // metadata-only DICOM; not an image
  }
  const gdcm::Image& img = ir.GetImage();
  const unsigned long bufLen = img.GetBufferLength();
  if (bufLen == 0) return;

  std::vector<char> buf(bufLen);
  if (!img.GetBuffer(buf.data())) {
    throw std::runtime_error(
        "extractPixelData: GDCM accepted the file but failed to extract "
        "pixel data; file may be malformed");
  }

  // Stream bytes directly to disk — never materialised in JS heap.
  std::FILE* fp = std::fopen(outPath.c_str(), "wb");
  if (!fp) {
    throw std::runtime_error(
        std::string("extractPixelData: cannot open ") + outPath
        + " for writing");
  }
  const size_t written = std::fwrite(buf.data(), 1, bufLen, fp);
  std::fclose(fp);
  if (written != bufLen) {
    throw std::runtime_error(
        std::string("extractPixelData: short write to ") + outPath);
  }

  out.filePath = outPath;
  out.byteLength = static_cast<long long>(bufLen);
  out.hasPixelData = true;
}

std::string readBinaryFileAsLatin1(const std::string& path,
                                   long long maxBytes) {
  std::FILE* fp = std::fopen(path.c_str(), "rb");
  if (!fp) {
    throw std::runtime_error(
        std::string("readBinaryFile: cannot open ") + path);
  }
  if (std::fseek(fp, 0, SEEK_END) != 0) {
    std::fclose(fp);
    throw std::runtime_error(std::string("readBinaryFile: seek failed: ") + path);
  }
  long size = std::ftell(fp);
  if (size < 0) {
    std::fclose(fp);
    throw std::runtime_error(
        std::string("readBinaryFile: ftell failed: ") + path);
  }
  if (maxBytes > 0 && static_cast<long long>(size) > maxBytes) {
    std::fclose(fp);
    throw std::runtime_error(
        std::string("readBinaryFile: file exceeds maxBytes: ") + path);
  }
  std::rewind(fp);
  std::string out;
  out.resize(static_cast<size_t>(size));
  size_t read = std::fread(&out[0], 1, static_cast<size_t>(size), fp);
  std::fclose(fp);
  if (read != static_cast<size_t>(size)) {
    throw std::runtime_error(
        std::string("readBinaryFile: short read: ") + path);
  }
  return out;
}

}  // namespace vnd
