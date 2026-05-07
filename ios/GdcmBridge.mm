#import "GdcmBridge.h"

#import <gdcmVersion.h>

#include <stdexcept>
#include <string>

#include "dicom_read.h"
#include "dicom_volume.h"

static NSString *const kGdcmBridgeErrorDomain = @"VibeNativeDicom.GdcmBridge";

static NSError *makeError(const std::string &msg) {
  return [NSError errorWithDomain:kGdcmBridgeErrorDomain
                             code:1
                         userInfo:@{NSLocalizedDescriptionKey:
                                       [NSString stringWithUTF8String:msg.c_str()]}];
}

// Forward declaration for mutual recursion with elementToDictionary.
static NSDictionary *datasetToDictionary(const vnd::DicomDataset &ds);

// Convert a single C++ DicomElement to an NSDictionary matching the TS
// DicomElement shape. SQ elements emit `items: [DicomDataset, ...]`;
// non-SQ elements emit `value: string | null`.
static NSDictionary *elementToDictionary(const vnd::DicomElement &elem) {
  NSString *vr = [NSString stringWithUTF8String:elem.vr.c_str()];
  if (elem.vr == "SQ") {
    NSMutableArray *items =
        [NSMutableArray arrayWithCapacity:elem.items.size()];
    for (const auto &itemDs : elem.items) {
      [items addObject:datasetToDictionary(itemDs)];
    }
    return @{@"vr": vr, @"value": [NSNull null], @"items": items};
  }
  id value = elem.isEmpty
                 ? (id)[NSNull null]
                 : (id)[NSString stringWithUTF8String:elem.value.c_str()];
  return @{@"vr": vr, @"value": value};
}

static NSDictionary *datasetToDictionary(const vnd::DicomDataset &ds) {
  NSMutableDictionary *out = [NSMutableDictionary dictionary];
  for (const auto &kv : ds) {
    NSString *key = [NSString stringWithUTF8String:kv.first.c_str()];
    out[key] = elementToDictionary(kv.second);
  }
  return out;
}

@implementation GdcmBridge

+ (NSString *)version {
  const char *v = gdcm::Version::GetVersion();
  return [NSString stringWithUTF8String:v];
}

+ (nullable NSDictionary *)readDicomAtPath:(NSString *)path
                                     error:(NSError **)error {
  vnd::DicomFile parsed;
  try {
    vnd::readDicomFile(std::string([path UTF8String]), parsed);
  } catch (const std::exception &e) {
    if (error) *error = makeError(e.what());
    return nil;
  }

  NSDictionary *dataset = datasetToDictionary(parsed.dataset);

  NSDictionary *image = @{
    @"rows": @(parsed.image.rows),
    @"columns": @(parsed.image.columns),
    @"bitsAllocated": @(parsed.image.bitsAllocated),
    @"bitsStored": @(parsed.image.bitsStored),
    @"highBit": @(parsed.image.highBit),
    @"pixelRepresentation": @(parsed.image.pixelRepresentation),
    @"samplesPerPixel": @(parsed.image.samplesPerPixel),
    @"photometricInterpretation":
        [NSString stringWithUTF8String:parsed.image.photometricInterpretation.c_str()],
    @"numberOfFrames": @(parsed.image.numberOfFrames),
    @"hasPixelData": @(parsed.image.hasPixelData),
    @"pixelDataBase64": parsed.image.hasPixelData
        ? (id)[NSString stringWithUTF8String:parsed.image.pixelDataBase64.c_str()]
        : (id)[NSNull null],
  };

  return @{
    @"transferSyntaxUID":
        [NSString stringWithUTF8String:parsed.transferSyntaxUID.c_str()],
    @"sopClassUID":
        [NSString stringWithUTF8String:parsed.sopClassUID.c_str()],
    @"sopInstanceUID":
        [NSString stringWithUTF8String:parsed.sopInstanceUID.c_str()],
    @"dataset": dataset,
    @"image": image,
  };
}

+ (BOOL)writeSyntheticDicomAtPath:(NSString *)path
                transferSyntaxUID:(NSString *)transferSyntaxUID
                   numberOfFrames:(NSInteger)numberOfFrames
                            error:(NSError **)error {
  try {
    vnd::writeSyntheticDicomFile(
        std::string([path UTF8String]),
        std::string([transferSyntaxUID UTF8String]),
        static_cast<int>(numberOfFrames));
    return YES;
  } catch (const std::exception &e) {
    if (error) *error = makeError(e.what());
    return NO;
  }
}

+ (BOOL)isSupportedTransferSyntax:(NSString *)transferSyntaxUID {
  return vnd::isSupportedTransferSyntax(
             std::string([transferSyntaxUID UTF8String]))
             ? YES
             : NO;
}

+ (nullable NSString *)writeBasicTextSrAtPath:(NSString *)outPath
                                     linesJson:(NSString *)linesJson
                            sourceStudyInstanceUID:(NSString *)studyUID
                           sourceSeriesInstanceUID:(NSString *)seriesUID
                              sourceSopInstanceUID:(NSString *)sopUID
                                 sourceSopClassUID:(NSString *)sopClassUID
                                             error:(NSError **)error {
  // Parse the lines JSON. NSJSONSerialization handles the heavy lifting.
  NSData *jsonData =
      [linesJson dataUsingEncoding:NSUTF8StringEncoding];
  NSError *jsonErr = nil;
  id parsed = [NSJSONSerialization JSONObjectWithData:jsonData
                                              options:0
                                                error:&jsonErr];
  if (jsonErr || ![parsed isKindOfClass:[NSArray class]]) {
    if (error)
      *error = makeError(
          std::string("writeBasicTextSr: linesJson must be a JSON array"));
    return nil;
  }
  std::vector<std::string> lines;
  for (id entry in (NSArray *)parsed) {
    if ([entry isKindOfClass:[NSString class]]) {
      lines.emplace_back([(NSString *)entry UTF8String]);
    }
  }

  vnd::SrExportRefs refs;
  refs.sourceStudyInstanceUID = std::string([studyUID UTF8String]);
  refs.sourceSeriesInstanceUID = std::string([seriesUID UTF8String]);
  refs.sourceSopInstanceUID = std::string([sopUID UTF8String]);
  refs.sourceSopClassUID = std::string([sopClassUID UTF8String]);
  try {
    vnd::writeBasicTextSr(std::string([outPath UTF8String]), lines, refs);
  } catch (const std::exception &e) {
    if (error) *error = makeError(e.what());
    return nil;
  }
  return outPath;
}

+ (nullable NSString *)readBinaryFileAtPath:(NSString *)path
                                    maxBytes:(double)maxBytes
                                       error:(NSError **)error {
  std::string bytes;
  try {
    bytes = vnd::readBinaryFileAsLatin1(
        std::string([path UTF8String]), static_cast<long long>(maxBytes));
  } catch (const std::exception &e) {
    if (error) *error = makeError(e.what());
    return nil;
  }
  // Build an NSString in which each unichar is one byte (Latin-1 encoding).
  // The C++ string holds raw bytes; reinterpret as UTF-16 chars by widening
  // each byte to 16 bits.
  const size_t n = bytes.size();
  std::vector<unichar> chars(n);
  for (size_t i = 0; i < n; ++i) {
    chars[i] = static_cast<unichar>(static_cast<unsigned char>(bytes[i]));
  }
  return [NSString stringWithCharacters:chars.data()
                                  length:static_cast<NSUInteger>(n)];
}

+ (nullable NSDictionary *)extractPixelDataAtPath:(NSString *)dicomPath
                                            toPath:(NSString *)outPath
                                             error:(NSError **)error {
  vnd::PixelDataInfo info;
  try {
    vnd::extractPixelDataToFile(std::string([dicomPath UTF8String]),
                                std::string([outPath UTF8String]), info);
  } catch (const std::exception &e) {
    if (error) *error = makeError(e.what());
    return nil;
  }
  return @{
    @"filePath": [NSString stringWithUTF8String:info.filePath.c_str()],
    @"byteLength": @(static_cast<double>(info.byteLength)),
    @"rows": @(info.rows),
    @"columns": @(info.columns),
    @"bitsAllocated": @(info.bitsAllocated),
    @"samplesPerPixel": @(info.samplesPerPixel),
    @"photometricInterpretation":
        [NSString stringWithUTF8String:info.photometricInterpretation.c_str()],
    @"numberOfFrames": @(info.numberOfFrames),
    @"hasPixelData": @(info.hasPixelData),
  };
}

+ (nullable NSDictionary *)buildVolumeFromDicomPathsJson:(NSString *)json
                                                   error:(NSError **)error {
  NSData *jsonData = [json dataUsingEncoding:NSUTF8StringEncoding];
  NSError *jsonErr = nil;
  id parsed = [NSJSONSerialization JSONObjectWithData:jsonData
                                              options:0
                                                error:&jsonErr];
  if (jsonErr || ![parsed isKindOfClass:[NSArray class]]) {
    if (error)
      *error = makeError(
          std::string("buildVolumeFromDicoms: paths must be a JSON array"));
    return nil;
  }
  std::vector<std::string> paths;
  for (id entry in (NSArray *)parsed) {
    if ([entry isKindOfClass:[NSString class]]) {
      paths.emplace_back([(NSString *)entry UTF8String]);
    }
  }
  vnd::VolumeInfo info;
  try {
    info = vnd::buildVolumeFromDicoms(paths);
  } catch (const std::exception &e) {
    if (error) *error = makeError(e.what());
    return nil;
  }
  return @{
    @"handle": @(static_cast<double>(info.handle)),
    @"columns": @(info.columns),
    @"rows": @(info.rows),
    @"depth": @(info.depth),
    @"bitsAllocated": @(info.bitsAllocated),
    @"pixelRepresentation": @(info.pixelRepresentation),
    @"pixelSpacingRow": @(info.pixelSpacingRow),
    @"pixelSpacingCol": @(info.pixelSpacingCol),
    @"sliceSpacing": @(info.sliceSpacing),
    @"photometricInterpretation":
        [NSString stringWithUTF8String:info.photometricInterpretation.c_str()],
  };
}

+ (nullable NSDictionary *)extractMprSliceFromHandle:(double)handle
                                               plane:(NSInteger)plane
                                               index:(NSInteger)index
                                              toPath:(NSString *)outPath
                                               error:(NSError **)error {
  vnd::MprPlane p;
  switch (plane) {
    case 0: p = vnd::MprPlane::Axial; break;
    case 1: p = vnd::MprPlane::Sagittal; break;
    case 2: p = vnd::MprPlane::Coronal; break;
    default:
      if (error) *error = makeError("extractMprSlice: invalid plane");
      return nil;
  }
  vnd::MprSliceInfo info;
  try {
    info = vnd::extractSlice(static_cast<long long>(handle), p,
                             static_cast<int>(index),
                             std::string([outPath UTF8String]));
  } catch (const std::exception &e) {
    if (error) *error = makeError(e.what());
    return nil;
  }
  return @{
    @"filePath": [NSString stringWithUTF8String:info.filePath.c_str()],
    @"byteLength": @(static_cast<double>(info.byteLength)),
    @"rows": @(info.rows),
    @"columns": @(info.columns),
    @"bitsAllocated": @(info.bitsAllocated),
    @"pixelRepresentation": @(info.pixelRepresentation),
    @"pixelSpacingRow": @(info.pixelSpacingRow),
    @"pixelSpacingCol": @(info.pixelSpacingCol),
  };
}

+ (void)releaseVolumeWithHandle:(double)handle {
  vnd::releaseVolume(static_cast<long long>(handle));
}

+ (nullable NSString *)writeSyntheticVolumeSeriesAtDir:(NSString *)outDir
                                        numberOfSlices:(NSInteger)n
                                        sliceSpacingMm:(double)spacing
                                                 error:(NSError **)error {
  std::vector<std::string> paths;
  try {
    paths = vnd::writeSyntheticVolumeSeries(
        std::string([outDir UTF8String]), static_cast<int>(n), spacing);
  } catch (const std::exception &e) {
    if (error) *error = makeError(e.what());
    return nil;
  }
  NSMutableArray *arr =
      [NSMutableArray arrayWithCapacity:paths.size()];
  for (const auto &p : paths) {
    [arr addObject:[NSString stringWithUTF8String:p.c_str()]];
  }
  NSError *jsonErr = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:arr
                                                 options:0
                                                   error:&jsonErr];
  if (jsonErr) {
    if (error) *error = jsonErr;
    return nil;
  }
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}

@end
