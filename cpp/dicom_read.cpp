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
#include "gdcmImageReader.h"
#include "gdcmImageWriter.h"
#include "gdcmReader.h"
#include "gdcmTag.h"
#include "gdcmTransferSyntax.h"
#include "gdcmUIDGenerator.h"

namespace vnd {
namespace {

// Phase 2.1 supports the two ubiquitous uncompressed transfer syntaxes.
// Anything else is rejected with a clear error so callers don't get
// silently-wrong pixel data.
bool isPhase21SupportedSyntax(const gdcm::TransferSyntax& ts) {
  const gdcm::TransferSyntax::TSType t = ts;
  return t == gdcm::TransferSyntax::ImplicitVRLittleEndian ||
         t == gdcm::TransferSyntax::ExplicitVRLittleEndian;
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

  // Walk every top-level data element. SQ (sequence) elements are emitted
  // as empty values for now; nested traversal lands in Phase 2.3 along
  // with the ergonomic helpers.
  for (auto it = ds.Begin(); it != ds.End(); ++it) {
    const gdcm::DataElement& de = *it;
    const gdcm::Tag& tag = de.GetTag();
    if (tag.IsGroupLength()) continue;  // (gggg,0000) — internal
    DicomElement elem;
    elem.vr = std::string(gdcm::VR::GetVRString(de.GetVR()));
    elem.value = elementValueAsString(de, elem.vr);
    elem.isEmpty = elem.value.empty() && de.GetVL() == 0;
    out.dataset[formatTagKey(tag)] = std::move(elem);
  }

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

  // Phase 2.1: only Implicit/Explicit VR LE. Anything else, return the
  // metadata but leave hasPixelData=false. Callers can still use the
  // image attributes for layout; pixel decode is Phase 2.2.
  if (!isPhase21SupportedSyntax(ts)) {
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

void writeSyntheticDicomFile(const std::string& path) {
  // 16x16 monochrome 8-bit MR image, all pixels = 128. Implicit VR LE
  // (the default-when-unspecified DICOM transfer syntax). Minimal meta
  // group — just enough to validate.
  const int kRows = 16;
  const int kCols = 16;
  const int kBytes = kRows * kCols;
  std::vector<unsigned char> pixels(kBytes, 128);

  gdcm::Image img;
  img.SetNumberOfDimensions(2);
  img.SetDimension(0, kCols);
  img.SetDimension(1, kRows);
  img.SetPhotometricInterpretation(
      gdcm::PhotometricInterpretation::MONOCHROME2);
  img.GetPixelFormat().SetSamplesPerPixel(1);
  img.SetPixelFormat(gdcm::PixelFormat::UINT8);
  img.SetTransferSyntax(gdcm::TransferSyntax::ImplicitVRLittleEndian);

  gdcm::DataElement pixelData(gdcm::Tag(0x7FE0, 0x0010));
  pixelData.SetByteValue(reinterpret_cast<const char*>(pixels.data()),
                         static_cast<uint32_t>(pixels.size()));
  img.SetDataElement(pixelData);

  gdcm::ImageWriter writer;
  writer.SetFileName(path.c_str());
  writer.SetImage(img);

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

  if (!writer.Write()) {
    throw std::runtime_error(
        std::string("writeSyntheticDicom: failed to write to ") + path);
  }
}

}  // namespace vnd
