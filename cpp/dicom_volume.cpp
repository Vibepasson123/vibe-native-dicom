#include "dicom_volume.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <map>
#include <mutex>
#include <stdexcept>

#include "gdcmAttribute.h"
#include "gdcmDataSet.h"
#include "gdcmFile.h"
#include "gdcmImage.h"
#include "gdcmImageReader.h"
#include "gdcmReader.h"
#include "gdcmTag.h"
#include "gdcmTransferSyntax.h"

namespace vnd {

namespace {

// Internal storage for a built volume. The pixel buffer is one
// contiguous block laid out [z][y][x] — z stride = rows*columns*bpp,
// y stride = columns*bpp, x stride = bpp. This is the same layout the
// Phase 2.5 extractPixelDataToFile path expects, so axial slices can
// be a memcpy and sagittal/coronal slices walk the cube with strided
// reads.
struct InternalVolume {
  int rows = 0;
  int columns = 0;
  int depth = 0;
  int bitsAllocated = 0;
  int pixelRepresentation = 0;
  int samplesPerPixel = 1;
  int bytesPerPixel = 1;
  double pixelSpacingRow = 1.0;
  double pixelSpacingCol = 1.0;
  double sliceSpacing = 1.0;
  std::string photometricInterpretation;
  std::vector<unsigned char> buffer;
};

// Process-wide handle registry. Volumes keyed by an int handle that's
// safe to send through the JS bridge. Mutex protects concurrent
// build/release calls — clinical viewers can have multiple volumes
// loaded at once for comparison.
std::mutex& registryMutex() {
  static std::mutex m;
  return m;
}
std::map<long long, InternalVolume>& registry() {
  static std::map<long long, InternalVolume> r;
  return r;
}
std::atomic<long long>& nextHandle() {
  static std::atomic<long long> n{1};
  return n;
}

// Parse "x\\y\\z" Image Position (Patient) (0020,0032). Returns {0,0,0}
// when missing — we sort by z so a missing tag means a single-slice
// "volume" still works.
struct Position3 {
  double x = 0;
  double y = 0;
  double z = 0;
};
Position3 readImagePosition(const gdcm::DataSet& ds) {
  Position3 p;
  if (!ds.FindDataElement(gdcm::Tag(0x0020, 0x0032))) return p;
  const gdcm::DataElement& de = ds.GetDataElement(gdcm::Tag(0x0020, 0x0032));
  const gdcm::ByteValue* bv = de.GetByteValue();
  if (!bv || !bv->GetPointer()) return p;
  std::string s(bv->GetPointer(), bv->GetLength());
  while (!s.empty() && (s.back() == ' ' || s.back() == '\0')) s.pop_back();
  // Split on '\\'.
  size_t i0 = 0;
  size_t i1 = s.find('\\');
  size_t i2 = (i1 == std::string::npos) ? std::string::npos : s.find('\\', i1 + 1);
  if (i1 != std::string::npos) {
    try {
      p.x = std::stod(s.substr(i0, i1 - i0));
    } catch (...) { /* keep 0 */ }
    if (i2 != std::string::npos) {
      try {
        p.y = std::stod(s.substr(i1 + 1, i2 - i1 - 1));
      } catch (...) {}
      try {
        p.z = std::stod(s.substr(i2 + 1));
      } catch (...) {}
    }
  }
  return p;
}

double readDoubleAttr(const gdcm::DataSet& ds, uint16_t g, uint16_t e,
                     double fallback) {
  if (!ds.FindDataElement(gdcm::Tag(g, e))) return fallback;
  const gdcm::DataElement& de = ds.GetDataElement(gdcm::Tag(g, e));
  const gdcm::ByteValue* bv = de.GetByteValue();
  if (!bv || !bv->GetPointer()) return fallback;
  std::string s(bv->GetPointer(), bv->GetLength());
  // For multi-valued DS (e.g. 0028,0030 PixelSpacing) we want the FIRST
  // value here. Specialised pair reader handles the second.
  size_t bs = s.find('\\');
  if (bs != std::string::npos) s = s.substr(0, bs);
  while (!s.empty() && (s.back() == ' ' || s.back() == '\0')) s.pop_back();
  try {
    return std::stod(s);
  } catch (...) {
    return fallback;
  }
}

// Reads PixelSpacing (0028,0030) — returns [rowSpacing, colSpacing].
std::pair<double, double> readPixelSpacing(const gdcm::DataSet& ds) {
  if (!ds.FindDataElement(gdcm::Tag(0x0028, 0x0030))) return {1.0, 1.0};
  const gdcm::DataElement& de = ds.GetDataElement(gdcm::Tag(0x0028, 0x0030));
  const gdcm::ByteValue* bv = de.GetByteValue();
  if (!bv || !bv->GetPointer()) return {1.0, 1.0};
  std::string s(bv->GetPointer(), bv->GetLength());
  while (!s.empty() && (s.back() == ' ' || s.back() == '\0')) s.pop_back();
  size_t bs = s.find('\\');
  if (bs == std::string::npos) {
    try { return {std::stod(s), std::stod(s)}; } catch (...) { return {1, 1}; }
  }
  double row = 1.0, col = 1.0;
  try { row = std::stod(s.substr(0, bs)); } catch (...) {}
  try { col = std::stod(s.substr(bs + 1)); } catch (...) {}
  return {row, col};
}

int readIntAttrDirect(const gdcm::DataSet& ds, uint16_t g, uint16_t e,
                     int fallback) {
  if (!ds.FindDataElement(gdcm::Tag(g, e))) return fallback;
  gdcm::Attribute<0, 0> dummy;  // unused — use Attribute template per call
  // Actually we just read the bytes here — the templated Attribute would
  // need the tag at compile time. Easier to read the ByteValue directly.
  const gdcm::DataElement& de = ds.GetDataElement(gdcm::Tag(g, e));
  const gdcm::ByteValue* bv = de.GetByteValue();
  if (!bv || !bv->GetPointer()) return fallback;
  std::string s(bv->GetPointer(), bv->GetLength());
  while (!s.empty() && (s.back() == ' ' || s.back() == '\0')) s.pop_back();
  // For US/SS the bytes are little-endian binary; for IS they're ASCII.
  // GDCM returns the raw bytes — we infer by VR length: 2-byte → US/SS.
  if (s.size() == 2) {
    unsigned lo = static_cast<unsigned char>(s[0]);
    unsigned hi = static_cast<unsigned char>(s[1]);
    return static_cast<int>((hi << 8) | lo);
  }
  try { return std::stoi(s); } catch (...) { return fallback; }
}

}  // namespace

VolumeInfo buildVolumeFromDicoms(const std::vector<std::string>& dicomPaths) {
  if (dicomPaths.empty()) {
    throw std::runtime_error("buildVolumeFromDicoms: empty path list");
  }

  struct SliceLoad {
    std::string path;
    Position3 position;
    int rows = 0;
    int columns = 0;
    int bitsAllocated = 0;
    int pixelRepresentation = 0;
    int samplesPerPixel = 1;
    double pixelSpacingRow = 1.0;
    double pixelSpacingCol = 1.0;
    std::string photometricInterpretation;
    std::vector<unsigned char> pixels;
  };

  std::vector<SliceLoad> slices;
  slices.reserve(dicomPaths.size());

  for (const auto& path : dicomPaths) {
    gdcm::ImageReader ir;
    ir.SetFileName(path.c_str());
    if (!ir.Read()) {
      throw std::runtime_error(
          std::string("buildVolume: not a readable DICOM image: ") + path);
    }
    const gdcm::Image& img = ir.GetImage();
    const gdcm::DataSet& ds = ir.GetFile().GetDataSet();

    SliceLoad s;
    s.path = path;
    s.position = readImagePosition(ds);
    s.rows = readIntAttrDirect(ds, 0x0028, 0x0010, 0);
    s.columns = readIntAttrDirect(ds, 0x0028, 0x0011, 0);
    s.bitsAllocated = readIntAttrDirect(ds, 0x0028, 0x0100, 0);
    s.pixelRepresentation = readIntAttrDirect(ds, 0x0028, 0x0103, 0);
    s.samplesPerPixel = readIntAttrDirect(ds, 0x0028, 0x0002, 1);
    auto sp = readPixelSpacing(ds);
    s.pixelSpacingRow = sp.first;
    s.pixelSpacingCol = sp.second;
    if (ds.FindDataElement(gdcm::Tag(0x0028, 0x0004))) {
      const gdcm::DataElement& de =
          ds.GetDataElement(gdcm::Tag(0x0028, 0x0004));
      const gdcm::ByteValue* bv = de.GetByteValue();
      if (bv && bv->GetPointer()) {
        std::string pi(bv->GetPointer(), bv->GetLength());
        while (!pi.empty() && (pi.back() == ' ' || pi.back() == '\0'))
          pi.pop_back();
        s.photometricInterpretation = pi;
      }
    }

    const unsigned long bufLen = img.GetBufferLength();
    if (bufLen == 0) {
      throw std::runtime_error(
          std::string("buildVolume: zero-length pixel data in ") + path);
    }
    s.pixels.resize(bufLen);
    if (!img.GetBuffer(reinterpret_cast<char*>(s.pixels.data()))) {
      throw std::runtime_error(
          std::string("buildVolume: failed to extract pixel data from ") + path);
    }
    slices.push_back(std::move(s));
  }

  // Validate uniform geometry.
  const SliceLoad& s0 = slices.front();
  for (size_t i = 1; i < slices.size(); ++i) {
    const SliceLoad& si = slices[i];
    if (si.rows != s0.rows || si.columns != s0.columns ||
        si.bitsAllocated != s0.bitsAllocated ||
        si.samplesPerPixel != s0.samplesPerPixel ||
        si.pixelRepresentation != s0.pixelRepresentation) {
      throw std::runtime_error(
          std::string("buildVolume: heterogeneous slice geometry at ") +
          si.path);
    }
  }

  // Sort by z. PS3.3 C.7.6.2.1.2 says ImagePositionPatient.z increases
  // monotonically through the series — we follow that ordering. Slices
  // without a position keep their input order (relative to others
  // missing position).
  std::stable_sort(slices.begin(), slices.end(),
                   [](const SliceLoad& a, const SliceLoad& b) {
                     return a.position.z < b.position.z;
                   });

  // Slice spacing = mean Δz, with a uniformity check.
  double sliceSpacing = 1.0;
  if (slices.size() > 1) {
    double sum = 0;
    for (size_t i = 1; i < slices.size(); ++i) {
      sum += std::abs(slices[i].position.z - slices[i - 1].position.z);
    }
    sliceSpacing = sum / static_cast<double>(slices.size() - 1);
    if (sliceSpacing < 1e-9) {
      // All slices at the same z — fall back to 1mm so divisions don't
      // blow up downstream. Common for synthetic test data.
      sliceSpacing = 1.0;
    } else {
      // Variance check: reject series with wildly non-uniform spacing —
      // those need oblique reformatting (Phase 5.2).
      double maxDeviation = 0;
      for (size_t i = 1; i < slices.size(); ++i) {
        const double d =
            std::abs(slices[i].position.z - slices[i - 1].position.z);
        maxDeviation = std::max(maxDeviation, std::abs(d - sliceSpacing));
      }
      if (maxDeviation > sliceSpacing * 0.05) {
        throw std::runtime_error(
            "buildVolume: non-uniform slice spacing (>5% deviation); use "
            "oblique reformat path (Phase 5.2)");
      }
    }
  }

  // Allocate the contiguous buffer.
  InternalVolume v;
  v.rows = s0.rows;
  v.columns = s0.columns;
  v.depth = static_cast<int>(slices.size());
  v.bitsAllocated = s0.bitsAllocated;
  v.pixelRepresentation = s0.pixelRepresentation;
  v.samplesPerPixel = s0.samplesPerPixel;
  v.bytesPerPixel = (s0.bitsAllocated + 7) / 8;
  v.pixelSpacingRow = s0.pixelSpacingRow;
  v.pixelSpacingCol = s0.pixelSpacingCol;
  v.sliceSpacing = sliceSpacing;
  v.photometricInterpretation = s0.photometricInterpretation;

  const size_t sliceBytes =
      static_cast<size_t>(v.rows) * v.columns * v.bytesPerPixel;
  v.buffer.resize(sliceBytes * v.depth);

  for (size_t i = 0; i < slices.size(); ++i) {
    const auto& src = slices[i].pixels;
    if (src.size() != sliceBytes) {
      throw std::runtime_error(
          "buildVolume: slice pixel buffer size mismatch with declared "
          "dimensions");
    }
    std::memcpy(v.buffer.data() + i * sliceBytes, src.data(), sliceBytes);
  }

  // Register and return.
  const long long handle = nextHandle().fetch_add(1);
  {
    std::lock_guard<std::mutex> lock(registryMutex());
    registry().emplace(handle, std::move(v));
  }

  VolumeInfo info;
  info.handle = handle;
  {
    std::lock_guard<std::mutex> lock(registryMutex());
    const auto& reg = registry().at(handle);
    info.columns = reg.columns;
    info.rows = reg.rows;
    info.depth = reg.depth;
    info.bitsAllocated = reg.bitsAllocated;
    info.pixelRepresentation = reg.pixelRepresentation;
    info.pixelSpacingRow = reg.pixelSpacingRow;
    info.pixelSpacingCol = reg.pixelSpacingCol;
    info.sliceSpacing = reg.sliceSpacing;
    info.photometricInterpretation = reg.photometricInterpretation;
  }
  return info;
}

void releaseVolume(long long handle) {
  std::lock_guard<std::mutex> lock(registryMutex());
  registry().erase(handle);
}

MprSliceInfo extractSlice(long long handle, MprPlane plane, int index,
                          const std::string& outPath) {
  std::lock_guard<std::mutex> lock(registryMutex());
  auto it = registry().find(handle);
  if (it == registry().end()) {
    throw std::runtime_error("extractSlice: invalid volume handle");
  }
  const InternalVolume& v = it->second;
  const int bpp = v.bytesPerPixel;

  auto writeOut = [&](const std::vector<unsigned char>& slice, int rowsOut,
                      int colsOut, double rowSpacing, double colSpacing) {
    std::FILE* fp = std::fopen(outPath.c_str(), "wb");
    if (!fp) {
      throw std::runtime_error(
          std::string("extractSlice: cannot open ") + outPath);
    }
    const size_t written =
        std::fwrite(slice.data(), 1, slice.size(), fp);
    std::fclose(fp);
    if (written != slice.size()) {
      throw std::runtime_error(
          std::string("extractSlice: short write to ") + outPath);
    }
    MprSliceInfo info;
    info.filePath = outPath;
    info.byteLength = static_cast<long long>(slice.size());
    info.rows = rowsOut;
    info.columns = colsOut;
    info.bitsAllocated = v.bitsAllocated;
    info.pixelRepresentation = v.pixelRepresentation;
    info.pixelSpacingRow = rowSpacing;
    info.pixelSpacingCol = colSpacing;
    return info;
  };

  switch (plane) {
    case MprPlane::Axial: {
      if (index < 0 || index >= v.depth) {
        throw std::runtime_error("extractSlice: axial index out of range");
      }
      const size_t sliceBytes =
          static_cast<size_t>(v.rows) * v.columns * bpp;
      std::vector<unsigned char> out(sliceBytes);
      std::memcpy(out.data(), v.buffer.data() + index * sliceBytes,
                  sliceBytes);
      return writeOut(out, v.rows, v.columns, v.pixelSpacingRow,
                     v.pixelSpacingCol);
    }
    case MprPlane::Sagittal: {
      // Y-Z plane at fixed X. Output rows = input rows (Y axis, kept as
      // vertical), output columns = depth (Z, becomes horizontal).
      if (index < 0 || index >= v.columns) {
        throw std::runtime_error("extractSlice: sagittal index out of range");
      }
      const int rowsOut = v.rows;
      const int colsOut = v.depth;
      std::vector<unsigned char> out(
          static_cast<size_t>(rowsOut) * colsOut * bpp);
      const size_t srcRowStride =
          static_cast<size_t>(v.columns) * bpp;
      const size_t srcSliceStride = srcRowStride * v.rows;
      for (int z = 0; z < v.depth; ++z) {
        for (int y = 0; y < v.rows; ++y) {
          const unsigned char* src =
              v.buffer.data() + z * srcSliceStride + y * srcRowStride +
              index * bpp;
          unsigned char* dst =
              out.data() + (y * static_cast<size_t>(colsOut) + z) * bpp;
          std::memcpy(dst, src, bpp);
        }
      }
      return writeOut(out, rowsOut, colsOut, v.pixelSpacingRow,
                     v.sliceSpacing);
    }
    case MprPlane::Coronal: {
      // X-Z plane at fixed Y. Output rows = depth (Z), output columns =
      // columns (X).
      if (index < 0 || index >= v.rows) {
        throw std::runtime_error("extractSlice: coronal index out of range");
      }
      const int rowsOut = v.depth;
      const int colsOut = v.columns;
      std::vector<unsigned char> out(
          static_cast<size_t>(rowsOut) * colsOut * bpp);
      const size_t srcRowStride =
          static_cast<size_t>(v.columns) * bpp;
      const size_t srcSliceStride = srcRowStride * v.rows;
      for (int z = 0; z < v.depth; ++z) {
        const unsigned char* src =
            v.buffer.data() + z * srcSliceStride + index * srcRowStride;
        unsigned char* dst =
            out.data() + z * static_cast<size_t>(colsOut) * bpp;
        std::memcpy(dst, src, srcRowStride);
      }
      return writeOut(out, rowsOut, colsOut, v.sliceSpacing,
                     v.pixelSpacingCol);
    }
  }
  throw std::runtime_error("extractSlice: unknown plane");
}

}  // namespace vnd
