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

namespace {

// Trilinear-along-Z resampler.
//
// Inputs are N slices at z positions z[0..N-1] (already sorted) with
// uniform pixel buffers of size sliceBytes. Output is a uniform grid
// of M = round((zMax - zMin) / targetSpacing) + 1 slices.
//
// For each output slice at z* = zMin + k*targetSpacing:
//   find the input bracket [z[i], z[i+1]] containing z*,
//   t = (z* - z[i]) / (z[i+1] - z[i]),
//   output = (1-t) * src[i] + t * src[i+1] (per-pixel linear blend).
//
// Pixels are blended in their stored representation:
//   - 8-bit unsigned/signed: byte-wise blend (signed wraps but the
//     window/level shader treats stored values uniformly).
//   - 16-bit (any signedness): little-endian, signed math when
//     pixelRepresentation=1; rounded to nearest stored value.
struct ResampleOut {
  std::vector<unsigned char> buffer;
  int outputDepth;
  double sliceSpacing;
};
ResampleOut resampleZTrilinear(
    const std::vector<std::vector<unsigned char>>& inputSlices,
    const std::vector<double>& z,
    int rows,
    int columns,
    int bitsAllocated,
    int pixelRepresentation,
    double targetSpacing) {
  const int bpp = (bitsAllocated + 7) / 8;
  const size_t sliceBytes = static_cast<size_t>(rows) * columns * bpp;
  const double zMin = z.front();
  const double zMax = z.back();
  const double extent = zMax - zMin;
  // M = floor(extent / targetSpacing) + 1; clamped to at least the
  // input count so degenerate inputs don't shrink absurdly.
  int M = static_cast<int>(std::floor(extent / targetSpacing)) + 1;
  if (M < 2) M = static_cast<int>(inputSlices.size());

  ResampleOut out;
  out.outputDepth = M;
  out.sliceSpacing = targetSpacing;
  out.buffer.assign(sliceBytes * static_cast<size_t>(M), 0);

  const bool signed16 = (bitsAllocated == 16) && (pixelRepresentation == 1);

  for (int k = 0; k < M; ++k) {
    const double zStar = zMin + k * targetSpacing;
    // Find bracket [i, i+1] with z[i] <= zStar <= z[i+1]. With sorted
    // z and zStar in [zMin, zMax] this is a simple linear scan; for
    // large series binary-search (std::lower_bound) would be faster
    // but the extra complexity isn't worth it before we hit 1000+
    // slices.
    size_t i = 0;
    while (i + 1 < z.size() && z[i + 1] < zStar) ++i;
    if (i + 1 >= z.size()) i = z.size() - 2;
    const double zi = z[i];
    const double zi1 = z[i + 1];
    const double dz = zi1 - zi;
    const double t = (dz > 1e-12) ? (zStar - zi) / dz : 0.0;
    const double inv = 1.0 - t;
    const unsigned char* src0 = inputSlices[i].data();
    const unsigned char* src1 = inputSlices[i + 1].data();
    unsigned char* dst = out.buffer.data() + k * sliceBytes;
    if (bpp == 1) {
      for (size_t p = 0; p < sliceBytes; ++p) {
        const double v = inv * src0[p] + t * src1[p];
        dst[p] = static_cast<unsigned char>(
            std::min(255.0, std::max(0.0, std::round(v))));
      }
    } else {
      // 16-bit, little-endian.
      const size_t numPx = sliceBytes / 2;
      for (size_t p = 0; p < numPx; ++p) {
        int v0 = static_cast<unsigned char>(src0[p * 2]) |
                 (static_cast<unsigned char>(src0[p * 2 + 1]) << 8);
        int v1 = static_cast<unsigned char>(src1[p * 2]) |
                 (static_cast<unsigned char>(src1[p * 2 + 1]) << 8);
        if (signed16) {
          if (v0 > 32767) v0 -= 65536;
          if (v1 > 32767) v1 -= 65536;
        }
        const double v = inv * v0 + t * v1;
        int vi = static_cast<int>(std::round(v));
        if (signed16) {
          if (vi < -32768) vi = -32768;
          else if (vi > 32767) vi = 32767;
          if (vi < 0) vi += 65536;
        } else {
          if (vi < 0) vi = 0;
          else if (vi > 65535) vi = 65535;
        }
        dst[p * 2] = static_cast<unsigned char>(vi & 0xFF);
        dst[p * 2 + 1] = static_cast<unsigned char>((vi >> 8) & 0xFF);
      }
    }
  }
  return out;
}

double medianAbsDelta(const std::vector<double>& zSorted) {
  std::vector<double> deltas;
  deltas.reserve(zSorted.size() - 1);
  for (size_t i = 1; i < zSorted.size(); ++i) {
    deltas.push_back(std::abs(zSorted[i] - zSorted[i - 1]));
  }
  std::sort(deltas.begin(), deltas.end());
  const size_t n = deltas.size();
  if (n == 0) return 1.0;
  if (n % 2 == 1) return deltas[n / 2];
  return 0.5 * (deltas[n / 2 - 1] + deltas[n / 2]);
}

}  // namespace

VolumeInfo buildVolumeFromDicoms(const std::vector<std::string>& dicomPaths,
                                 const BuildVolumeOptions& opts) {
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

  // Slice spacing analysis. Decide whether the input is already on a
  // uniform grid or needs Phase 5.2 resampling.
  double sliceSpacing = 1.0;
  bool needsResample = false;
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
      double maxDeviation = 0;
      for (size_t i = 1; i < slices.size(); ++i) {
        const double d =
            std::abs(slices[i].position.z - slices[i - 1].position.z);
        maxDeviation = std::max(maxDeviation, std::abs(d - sliceSpacing));
      }
      if (maxDeviation > sliceSpacing * 0.05) {
        if (!opts.resampleNonUniformZ) {
          throw std::runtime_error(
              "buildVolume: non-uniform slice spacing (>5% deviation); "
              "set BuildVolumeOptions.resampleNonUniformZ=true to "
              "trilinear-resample to a uniform grid (Phase 5.2)");
        }
        needsResample = true;
      }
    }
  }

  // Allocate the contiguous buffer.
  InternalVolume v;
  v.rows = s0.rows;
  v.columns = s0.columns;
  v.bitsAllocated = s0.bitsAllocated;
  v.pixelRepresentation = s0.pixelRepresentation;
  v.samplesPerPixel = s0.samplesPerPixel;
  v.bytesPerPixel = (s0.bitsAllocated + 7) / 8;
  v.pixelSpacingRow = s0.pixelSpacingRow;
  v.pixelSpacingCol = s0.pixelSpacingCol;
  v.photometricInterpretation = s0.photometricInterpretation;

  const size_t sliceBytes =
      static_cast<size_t>(v.rows) * v.columns * v.bytesPerPixel;

  // Verify per-slice pixel buffer size before any expensive copy/resample.
  for (size_t i = 0; i < slices.size(); ++i) {
    if (slices[i].pixels.size() != sliceBytes) {
      throw std::runtime_error(
          "buildVolume: slice pixel buffer size mismatch with declared "
          "dimensions");
    }
  }

  if (needsResample) {
    // Build the input arrays for the resampler.
    std::vector<std::vector<unsigned char>> inputSlices;
    std::vector<double> zPositions;
    inputSlices.reserve(slices.size());
    zPositions.reserve(slices.size());
    for (auto& s : slices) {
      inputSlices.push_back(std::move(s.pixels));
      zPositions.push_back(s.position.z);
    }
    const double targetSpacing = medianAbsDelta(zPositions);
    auto out =
        resampleZTrilinear(inputSlices, zPositions, v.rows, v.columns,
                           v.bitsAllocated, v.pixelRepresentation,
                           targetSpacing);
    v.buffer = std::move(out.buffer);
    v.depth = out.outputDepth;
    v.sliceSpacing = out.sliceSpacing;
  } else {
    v.depth = static_cast<int>(slices.size());
    v.sliceSpacing = sliceSpacing;
    v.buffer.resize(sliceBytes * v.depth);
    for (size_t i = 0; i < slices.size(); ++i) {
      const auto& src = slices[i].pixels;
      std::memcpy(v.buffer.data() + i * sliceBytes, src.data(), sliceBytes);
    }
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

// ---- Phase 5.3: oblique slicing -------------------------------------------

namespace {

// Trilinear sampler at fractional voxel coords (vx, vy, vz). Returns the
// sampled stored value as a double; caller writes back as 8-bit / 16-bit.
// Out-of-bounds samples return 0 (deliberate — see ObliqueSpec docs).
double trilinearSample(const InternalVolume& v, double vx, double vy,
                       double vz) {
  if (vx < 0 || vy < 0 || vz < 0) return 0;
  if (vx > v.columns - 1 || vy > v.rows - 1 || vz > v.depth - 1) return 0;
  const int x0 = static_cast<int>(std::floor(vx));
  const int y0 = static_cast<int>(std::floor(vy));
  const int z0 = static_cast<int>(std::floor(vz));
  const int x1 = std::min(v.columns - 1, x0 + 1);
  const int y1 = std::min(v.rows - 1, y0 + 1);
  const int z1 = std::min(v.depth - 1, z0 + 1);
  const double tx = vx - x0;
  const double ty = vy - y0;
  const double tz = vz - z0;
  const int bpp = v.bytesPerPixel;
  const size_t rowStride = static_cast<size_t>(v.columns) * bpp;
  const size_t sliceStride = rowStride * v.rows;
  const bool signed16 =
      (v.bitsAllocated == 16) && (v.pixelRepresentation == 1);

  // Read one stored sample.
  auto get = [&](int x, int y, int z) -> double {
    const unsigned char* p =
        v.buffer.data() + z * sliceStride + y * rowStride + x * bpp;
    if (bpp == 1) return p[0];
    int raw = p[0] | (p[1] << 8);
    if (signed16 && raw > 32767) raw -= 65536;
    return raw;
  };

  const double c000 = get(x0, y0, z0);
  const double c100 = get(x1, y0, z0);
  const double c010 = get(x0, y1, z0);
  const double c110 = get(x1, y1, z0);
  const double c001 = get(x0, y0, z1);
  const double c101 = get(x1, y0, z1);
  const double c011 = get(x0, y1, z1);
  const double c111 = get(x1, y1, z1);
  const double c00 = c000 * (1 - tx) + c100 * tx;
  const double c01 = c001 * (1 - tx) + c101 * tx;
  const double c10 = c010 * (1 - tx) + c110 * tx;
  const double c11 = c011 * (1 - tx) + c111 * tx;
  const double c0 = c00 * (1 - ty) + c10 * ty;
  const double c1 = c01 * (1 - ty) + c11 * ty;
  return c0 * (1 - tz) + c1 * tz;
}

}  // namespace

MprSliceInfo extractObliqueSlice(long long handle, const ObliqueSpec& spec,
                                 const std::string& outPath) {
  std::lock_guard<std::mutex> lock(registryMutex());
  auto it = registry().find(handle);
  if (it == registry().end()) {
    throw std::runtime_error("extractObliqueSlice: invalid volume handle");
  }
  const InternalVolume& v = it->second;
  if (spec.columns <= 0 || spec.rows <= 0) {
    throw std::runtime_error(
        "extractObliqueSlice: columns and rows must be > 0");
  }
  if (spec.pixelSpacingMm <= 0) {
    throw std::runtime_error(
        "extractObliqueSlice: pixelSpacingMm must be > 0");
  }
  const int bpp = v.bytesPerPixel;
  const bool signed16 =
      (v.bitsAllocated == 16) && (v.pixelRepresentation == 1);

  // Volume voxel spacing in mm. Origin at voxel (0,0,0), corner at
  // ((columns-1)*colSpacing, (rows-1)*rowSpacing, (depth-1)*sliceSpacing).
  const double sx = v.pixelSpacingCol;
  const double sy = v.pixelSpacingRow;
  const double sz = v.sliceSpacing;

  const size_t outBytes =
      static_cast<size_t>(spec.rows) * spec.columns * bpp;
  std::vector<unsigned char> out(outBytes, 0);

  const double halfW = (spec.columns - 1) / 2.0;
  const double halfH = (spec.rows - 1) / 2.0;

  for (int j = 0; j < spec.rows; ++j) {
    for (int i = 0; i < spec.columns; ++i) {
      const double du = (i - halfW) * spec.pixelSpacingMm;
      const double dv = (j - halfH) * spec.pixelSpacingMm;
      // World point in mm.
      const double wx =
          spec.centerMm[0] + du * spec.uMm[0] + dv * spec.vMm[0];
      const double wy =
          spec.centerMm[1] + du * spec.uMm[1] + dv * spec.vMm[1];
      const double wz =
          spec.centerMm[2] + du * spec.uMm[2] + dv * spec.vMm[2];
      // To voxel coords.
      const double vx = wx / sx;
      const double vy = wy / sy;
      const double vz = wz / sz;
      const double sampled = trilinearSample(v, vx, vy, vz);

      unsigned char* dst = out.data() + (j * spec.columns + i) * bpp;
      if (bpp == 1) {
        const int rounded =
            static_cast<int>(std::round(sampled));
        const int clamped = std::min(255, std::max(0, rounded));
        dst[0] = static_cast<unsigned char>(clamped);
      } else {
        int rounded = static_cast<int>(std::round(sampled));
        if (signed16) {
          if (rounded < -32768) rounded = -32768;
          else if (rounded > 32767) rounded = 32767;
          if (rounded < 0) rounded += 65536;
        } else {
          if (rounded < 0) rounded = 0;
          else if (rounded > 65535) rounded = 65535;
        }
        dst[0] = static_cast<unsigned char>(rounded & 0xFF);
        dst[1] = static_cast<unsigned char>((rounded >> 8) & 0xFF);
      }
    }
  }

  std::FILE* fp = std::fopen(outPath.c_str(), "wb");
  if (!fp) {
    throw std::runtime_error(
        std::string("extractObliqueSlice: cannot open ") + outPath);
  }
  const size_t written = std::fwrite(out.data(), 1, out.size(), fp);
  std::fclose(fp);
  if (written != out.size()) {
    throw std::runtime_error(
        std::string("extractObliqueSlice: short write to ") + outPath);
  }

  MprSliceInfo info;
  info.filePath = outPath;
  info.byteLength = static_cast<long long>(out.size());
  info.rows = spec.rows;
  info.columns = spec.columns;
  info.bitsAllocated = v.bitsAllocated;
  info.pixelRepresentation = v.pixelRepresentation;
  info.pixelSpacingRow = spec.pixelSpacingMm;
  info.pixelSpacingCol = spec.pixelSpacingMm;
  return info;
}

// ---- Phase 6.1: slab projection (MIP/MinIP/Average) -----------------------

MprSliceInfo extractProjectionSlab(long long handle, const ObliqueSpec& spec,
                                   double slabThicknessMm, double stepMm,
                                   ProjectionMode mode,
                                   const std::string& outPath) {
  std::lock_guard<std::mutex> lock(registryMutex());
  auto it = registry().find(handle);
  if (it == registry().end()) {
    throw std::runtime_error(
        "extractProjectionSlab: invalid volume handle");
  }
  const InternalVolume& v = it->second;
  if (spec.columns <= 0 || spec.rows <= 0) {
    throw std::runtime_error(
        "extractProjectionSlab: columns and rows must be > 0");
  }
  if (spec.pixelSpacingMm <= 0) {
    throw std::runtime_error(
        "extractProjectionSlab: pixelSpacingMm must be > 0");
  }
  if (slabThicknessMm < 0) {
    throw std::runtime_error(
        "extractProjectionSlab: slabThicknessMm must be >= 0");
  }
  // Default step = smallest input axis spacing. Sub-voxel sampling
  // would be Nyquist-correct but doubles the cost — voxel-spacing is
  // a good middle ground for clinical CT.
  const double defaultStep =
      std::min({v.pixelSpacingCol, v.pixelSpacingRow, v.sliceSpacing});
  if (stepMm <= 0) stepMm = defaultStep;

  const int bpp = v.bytesPerPixel;
  const bool signed16 =
      (v.bitsAllocated == 16) && (v.pixelRepresentation == 1);
  const double sx = v.pixelSpacingCol;
  const double sy = v.pixelSpacingRow;
  const double sz = v.sliceSpacing;

  // Plane normal = u × v.
  const double nx = spec.uMm[1] * spec.vMm[2] - spec.uMm[2] * spec.vMm[1];
  const double ny = spec.uMm[2] * spec.vMm[0] - spec.uMm[0] * spec.vMm[2];
  const double nz = spec.uMm[0] * spec.vMm[1] - spec.uMm[1] * spec.vMm[0];

  // Number of samples along the ray. ≥1 always so single-plane spec
  // (slabThicknessMm=0) still produces output.
  int numSamples =
      slabThicknessMm <= 0
          ? 1
          : std::max(1, static_cast<int>(std::round(slabThicknessMm / stepMm)) + 1);

  const size_t outBytes =
      static_cast<size_t>(spec.rows) * spec.columns * bpp;
  std::vector<unsigned char> out(outBytes, 0);

  const double halfW = (spec.columns - 1) / 2.0;
  const double halfH = (spec.rows - 1) / 2.0;
  const double halfSlab = slabThicknessMm / 2.0;

  for (int j = 0; j < spec.rows; ++j) {
    for (int i = 0; i < spec.columns; ++i) {
      const double du = (i - halfW) * spec.pixelSpacingMm;
      const double dv = (j - halfH) * spec.pixelSpacingMm;
      const double basePx =
          spec.centerMm[0] + du * spec.uMm[0] + dv * spec.vMm[0];
      const double basePy =
          spec.centerMm[1] + du * spec.uMm[1] + dv * spec.vMm[1];
      const double basePz =
          spec.centerMm[2] + du * spec.uMm[2] + dv * spec.vMm[2];

      // Walk the ray from -halfSlab to +halfSlab along n. Track the
      // running accumulator in the input domain (signed 32-bit is
      // enough headroom for 16-bit samples).
      double acc = 0;
      double maxV = 0;
      double minV = 0;
      bool first = true;
      for (int k = 0; k < numSamples; ++k) {
        // Position along the ray in [-halfSlab, +halfSlab].
        const double t = numSamples == 1
            ? 0.0
            : -halfSlab + (k * 2.0 * halfSlab) / (numSamples - 1);
        const double wx = basePx + t * nx;
        const double wy = basePy + t * ny;
        const double wz = basePz + t * nz;
        const double vx = wx / sx;
        const double vy = wy / sy;
        const double vz = wz / sz;
        const double sample = trilinearSample(v, vx, vy, vz);
        if (first) {
          maxV = sample;
          minV = sample;
          acc = sample;
          first = false;
        } else {
          if (sample > maxV) maxV = sample;
          if (sample < minV) minV = sample;
          acc += sample;
        }
      }
      double reduced;
      switch (mode) {
        case ProjectionMode::Mip:
          reduced = maxV;
          break;
        case ProjectionMode::MinIp:
          reduced = minV;
          break;
        case ProjectionMode::Average:
          reduced = numSamples > 0 ? acc / numSamples : 0;
          break;
      }

      unsigned char* dst = out.data() + (j * spec.columns + i) * bpp;
      if (bpp == 1) {
        const int rounded = static_cast<int>(std::round(reduced));
        const int clamped = std::min(255, std::max(0, rounded));
        dst[0] = static_cast<unsigned char>(clamped);
      } else {
        int rounded = static_cast<int>(std::round(reduced));
        if (signed16) {
          if (rounded < -32768) rounded = -32768;
          else if (rounded > 32767) rounded = 32767;
          if (rounded < 0) rounded += 65536;
        } else {
          if (rounded < 0) rounded = 0;
          else if (rounded > 65535) rounded = 65535;
        }
        dst[0] = static_cast<unsigned char>(rounded & 0xFF);
        dst[1] = static_cast<unsigned char>((rounded >> 8) & 0xFF);
      }
    }
  }

  std::FILE* fp = std::fopen(outPath.c_str(), "wb");
  if (!fp) {
    throw std::runtime_error(
        std::string("extractProjectionSlab: cannot open ") + outPath);
  }
  const size_t written = std::fwrite(out.data(), 1, out.size(), fp);
  std::fclose(fp);
  if (written != out.size()) {
    throw std::runtime_error(
        std::string("extractProjectionSlab: short write to ") + outPath);
  }

  MprSliceInfo info;
  info.filePath = outPath;
  info.byteLength = static_cast<long long>(out.size());
  info.rows = spec.rows;
  info.columns = spec.columns;
  info.bitsAllocated = v.bitsAllocated;
  info.pixelRepresentation = v.pixelRepresentation;
  info.pixelSpacingRow = spec.pixelSpacingMm;
  info.pixelSpacingCol = spec.pixelSpacingMm;
  info.samplesPerPixel = 1;
  return info;
}

// ---- Phase 6.2: volume rendering with transfer function ------------------

namespace {

struct TfRgba {
  double r;
  double g;
  double b;
  double a;
};

// Linear interpolation of a transfer-function table. Caller must pass a
// sorted-by-value `tf` with size >= 2. Below the first point we return
// fully transparent (caller-supplied colour with a=0); above the last
// we clamp.
TfRgba evalTransferFunction(
    const std::vector<TransferFunctionPoint>& tf, double value) {
  if (tf.empty()) return {0, 0, 0, 0};
  if (value <= tf.front().value) {
    // Below the floor: opacity zero. Below-window samples shouldn't
    // contribute to the rendered image at all.
    return {tf.front().r, tf.front().g, tf.front().b, 0.0};
  }
  if (value >= tf.back().value) {
    const auto& p = tf.back();
    return {p.r, p.g, p.b, p.opacity};
  }
  // Binary search the bracket. tf is small (typically <16 points) so
  // linear scan would be fine, but binary is essentially free.
  size_t lo = 0;
  size_t hi = tf.size() - 1;
  while (hi - lo > 1) {
    const size_t mid = (lo + hi) / 2;
    if (tf[mid].value <= value) lo = mid;
    else hi = mid;
  }
  const auto& p0 = tf[lo];
  const auto& p1 = tf[hi];
  const double t = (value - p0.value) / (p1.value - p0.value);
  return {p0.r + t * (p1.r - p0.r), p0.g + t * (p1.g - p0.g),
          p0.b + t * (p1.b - p0.b),
          p0.opacity + t * (p1.opacity - p0.opacity)};
}

}  // namespace

MprSliceInfo extractVolumeRender(
    long long handle, const ObliqueSpec& spec, double slabThicknessMm,
    double stepMm, const std::vector<TransferFunctionPoint>& tfPoints,
    const std::vector<ClipPlane>& clipPlanes,
    const std::string& outPath) {
  std::lock_guard<std::mutex> lock(registryMutex());
  auto it = registry().find(handle);
  if (it == registry().end()) {
    throw std::runtime_error(
        "extractVolumeRender: invalid volume handle");
  }
  if (tfPoints.size() < 2) {
    throw std::runtime_error(
        "extractVolumeRender: transfer function needs at least 2 points");
  }
  // The TF must be sorted by value. Validate rather than assume —
  // misordered points produce silent garbage.
  for (size_t i = 1; i < tfPoints.size(); ++i) {
    if (tfPoints[i].value < tfPoints[i - 1].value) {
      throw std::runtime_error(
          "extractVolumeRender: transfer function points must be sorted "
          "by value");
    }
  }
  const InternalVolume& v = it->second;
  if (spec.columns <= 0 || spec.rows <= 0) {
    throw std::runtime_error(
        "extractVolumeRender: columns and rows must be > 0");
  }
  if (spec.pixelSpacingMm <= 0) {
    throw std::runtime_error(
        "extractVolumeRender: pixelSpacingMm must be > 0");
  }
  if (slabThicknessMm <= 0) {
    throw std::runtime_error(
        "extractVolumeRender: slabThicknessMm must be > 0 — VR needs "
        "real ray length");
  }
  const double defaultStep =
      std::min({v.pixelSpacingCol, v.pixelSpacingRow, v.sliceSpacing});
  if (stepMm <= 0) stepMm = defaultStep;

  // Plane normal = u × v.
  const double nx = spec.uMm[1] * spec.vMm[2] - spec.uMm[2] * spec.vMm[1];
  const double ny = spec.uMm[2] * spec.vMm[0] - spec.uMm[0] * spec.vMm[2];
  const double nz = spec.uMm[0] * spec.vMm[1] - spec.uMm[1] * spec.vMm[0];
  const double sx = v.pixelSpacingCol;
  const double sy = v.pixelSpacingRow;
  const double sz = v.sliceSpacing;

  const int numSamples =
      std::max(2, static_cast<int>(std::round(slabThicknessMm / stepMm)) + 1);

  // RGBA8 output — 4 bytes per pixel.
  const size_t outBytes =
      static_cast<size_t>(spec.rows) * spec.columns * 4;
  std::vector<unsigned char> out(outBytes, 0);

  const double halfW = (spec.columns - 1) / 2.0;
  const double halfH = (spec.rows - 1) / 2.0;
  const double halfSlab = slabThicknessMm / 2.0;

  // Opacity correction for variable step size: the reference TF assumes
  // a step equal to the median voxel spacing. If we step further, each
  // sample should look "more solid"; if shorter, more transparent.
  // alpha_corrected = 1 - (1 - alpha)^(stepMm / refStepMm).
  const double refStep = defaultStep;
  const double opacityExponent = (refStep > 0) ? (stepMm / refStep) : 1.0;

  for (int j = 0; j < spec.rows; ++j) {
    for (int i = 0; i < spec.columns; ++i) {
      const double du = (i - halfW) * spec.pixelSpacingMm;
      const double dv = (j - halfH) * spec.pixelSpacingMm;
      const double basePx =
          spec.centerMm[0] + du * spec.uMm[0] + dv * spec.vMm[0];
      const double basePy =
          spec.centerMm[1] + du * spec.uMm[1] + dv * spec.vMm[1];
      const double basePz =
          spec.centerMm[2] + du * spec.uMm[2] + dv * spec.vMm[2];

      // Front-to-back compositing.
      double accR = 0;
      double accG = 0;
      double accB = 0;
      double accA = 0;
      for (int k = 0; k < numSamples; ++k) {
        const double t =
            -halfSlab + (k * 2.0 * halfSlab) / (numSamples - 1);
        const double wx = basePx + t * nx;
        const double wy = basePy + t * ny;
        const double wz = basePz + t * nz;
        // Phase 6.3: clip-plane gate. Skip this sample if it falls on
        // the negative side of any plane (intersection / AND semantics).
        bool clipped = false;
        for (const ClipPlane& cp : clipPlanes) {
          const double dx = wx - cp.pointMm[0];
          const double dy = wy - cp.pointMm[1];
          const double dz = wz - cp.pointMm[2];
          if (dx * cp.normalMm[0] + dy * cp.normalMm[1] +
                  dz * cp.normalMm[2] <
              0.0) {
            clipped = true;
            break;
          }
        }
        if (clipped) continue;
        const double sample = trilinearSample(v, wx / sx, wy / sy, wz / sz);
        TfRgba c = evalTransferFunction(tfPoints, sample);
        // Step-corrected alpha.
        if (opacityExponent != 1.0 && c.a > 0 && c.a < 1) {
          c.a = 1.0 - std::pow(1.0 - c.a, opacityExponent);
        }
        // Front-to-back blend: out += (1 - acc_a) * (a * colour).
        const double w = (1.0 - accA) * c.a;
        accR += w * c.r;
        accG += w * c.g;
        accB += w * c.b;
        accA += w;
        if (accA > 0.99) break;  // early termination
      }
      // Pre-multiplied alpha → convert to straight RGBA8 (Skia
      // ImageInfo we use is alphaType=Opaque on the 1-channel path,
      // for RGBA output we composite on black so the alpha can be 1).
      // Here we produce pre-multiplied output where the background is
      // black; the viewer treats it as opaque.
      unsigned char* dst = out.data() + (j * spec.columns + i) * 4;
      dst[0] = static_cast<unsigned char>(
          std::min(255, std::max(0, static_cast<int>(std::round(accR * 255)))));
      dst[1] = static_cast<unsigned char>(
          std::min(255, std::max(0, static_cast<int>(std::round(accG * 255)))));
      dst[2] = static_cast<unsigned char>(
          std::min(255, std::max(0, static_cast<int>(std::round(accB * 255)))));
      dst[3] = 255;  // opaque (background visible only where rays didn't accumulate)
    }
  }

  std::FILE* fp = std::fopen(outPath.c_str(), "wb");
  if (!fp) {
    throw std::runtime_error(
        std::string("extractVolumeRender: cannot open ") + outPath);
  }
  const size_t written = std::fwrite(out.data(), 1, out.size(), fp);
  std::fclose(fp);
  if (written != out.size()) {
    throw std::runtime_error(
        std::string("extractVolumeRender: short write to ") + outPath);
  }

  MprSliceInfo info;
  info.filePath = outPath;
  info.byteLength = static_cast<long long>(out.size());
  info.rows = spec.rows;
  info.columns = spec.columns;
  // RGBA8 outputs always 8 bits per channel — bitsAllocated=8 lets the
  // viewer's existing 8-bit path handle the texture upload.
  info.bitsAllocated = 8;
  info.pixelRepresentation = 0;
  info.pixelSpacingRow = spec.pixelSpacingMm;
  info.pixelSpacingCol = spec.pixelSpacingMm;
  info.samplesPerPixel = 4;
  return info;
}

}  // namespace vnd
