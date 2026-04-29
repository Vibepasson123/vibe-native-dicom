#import "VibeNativeDicom.h"

#if __has_include("VibeNativeDicom-Swift.h")
#import "VibeNativeDicom-Swift.h"
#else
#import <VibeNativeDicom/VibeNativeDicom-Swift.h>
#endif

@implementation VibeNativeDicom

- (NSNumber *)multiply:(double)a b:(double)b {
  return [VibeNativeDicomImpl multiply:a b:b];
}

- (NSString *)getGdcmVersion {
  return [VibeNativeDicomImpl getGdcmVersion];
}

- (NSString *)writeSyntheticDicom:(NSString *)transferSyntaxUID {
  NSError *error = nil;
  NSString *path = [VibeNativeDicomImpl writeSyntheticDicom:transferSyntaxUID
                                                      error:&error];
  if (path == nil) {
    @throw [NSException exceptionWithName:@"VibeNativeDicomError"
                                   reason:error.localizedDescription ?: @"writeSyntheticDicom failed"
                                 userInfo:nil];
  }
  return path;
}

- (NSNumber *)isSupportedTransferSyntax:(NSString *)transferSyntaxUID {
  return [VibeNativeDicomImpl isSupportedTransferSyntax:transferSyntaxUID];
}

- (id)readDicom:(NSString *)path {
  NSError *error = nil;
  NSDictionary *result = [VibeNativeDicomImpl readDicom:path error:&error];
  if (result == nil) {
    @throw [NSException exceptionWithName:@"VibeNativeDicomError"
                                   reason:error.localizedDescription ?: @"readDicom failed"
                                 userInfo:nil];
  }
  return result;
}

- (id)extractPixelDataToFile:(NSString *)dicomPath outPath:(NSString *)outPath {
  NSError *error = nil;
  NSDictionary *result =
      [VibeNativeDicomImpl extractPixelDataToFile:dicomPath
                                          outPath:outPath
                                            error:&error];
  if (result == nil) {
    @throw [NSException exceptionWithName:@"VibeNativeDicomError"
                                   reason:error.localizedDescription ?: @"extractPixelDataToFile failed"
                                 userInfo:nil];
  }
  return result;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeVibeNativeDicomSpecJSI>(params);
}

+ (NSString *)moduleName
{
  return @"VibeNativeDicom";
}

@end
