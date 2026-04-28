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

  NSMutableDictionary *dataset = [NSMutableDictionary dictionary];
  for (const auto &kv : parsed.dataset) {
    NSString *key = [NSString stringWithUTF8String:kv.first.c_str()];
    id value = kv.second.isEmpty
                   ? (id)[NSNull null]
                   : (id)[NSString stringWithUTF8String:kv.second.value.c_str()];
    dataset[key] = @{
      @"vr": [NSString stringWithUTF8String:kv.second.vr.c_str()],
      @"value": value,
    };
  }

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
                            error:(NSError **)error {
  try {
    vnd::writeSyntheticDicomFile(std::string([path UTF8String]));
    return YES;
  } catch (const std::exception &e) {
    if (error) *error = makeError(e.what());
    return NO;
  }
}

@end
