#import "GdcmBridge.h"

#import <gdcmVersion.h>

#include <stdexcept>
#include <string>

#include "dicom_read.h"

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
                            error:(NSError **)error {
  try {
    vnd::writeSyntheticDicomFile(
        std::string([path UTF8String]),
        std::string([transferSyntaxUID UTF8String]));
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

@end
