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

- (NSString *)writeSyntheticDicom:(NSString *)transferSyntaxUID
                   numberOfFrames:(double)numberOfFrames {
  NSError *error = nil;
  NSString *path = [VibeNativeDicomImpl writeSyntheticDicom:transferSyntaxUID
                                              numberOfFrames:@(numberOfFrames)
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

- (NSString *)readBinaryFile:(NSString *)path maxBytes:(double)maxBytes {
  NSError *error = nil;
  NSString *result = [VibeNativeDicomImpl readBinaryFile:path
                                                maxBytes:@(maxBytes)
                                                   error:&error];
  if (result == nil) {
    @throw [NSException exceptionWithName:@"VibeNativeDicomError"
                                   reason:error.localizedDescription ?: @"readBinaryFile failed"
                                 userInfo:nil];
  }
  return result;
}

- (id)buildVolumeFromDicoms:(NSString *)dicomPathsJson
        resampleNonUniformZ:(BOOL)resampleNonUniformZ {
  NSError *error = nil;
  NSDictionary *result = [VibeNativeDicomImpl
      buildVolumeFromDicoms:dicomPathsJson
        resampleNonUniformZ:@(resampleNonUniformZ)
                      error:&error];
  if (result == nil) {
    @throw [NSException
        exceptionWithName:@"VibeNativeDicomError"
                   reason:error.localizedDescription ?: @"buildVolumeFromDicoms failed"
                 userInfo:nil];
  }
  return result;
}

- (id)extractMprSlice:(double)handle
                plane:(double)plane
                index:(double)index
              outPath:(NSString *)outPath {
  NSError *error = nil;
  NSDictionary *result =
      [VibeNativeDicomImpl extractMprSlice:@(handle)
                                     plane:@(plane)
                                     index:@(index)
                                   outPath:outPath
                                     error:&error];
  if (result == nil) {
    @throw [NSException
        exceptionWithName:@"VibeNativeDicomError"
                   reason:error.localizedDescription ?: @"extractMprSlice failed"
                 userInfo:nil];
  }
  return result;
}

- (void)releaseVolume:(double)handle {
  [VibeNativeDicomImpl releaseVolume:@(handle)];
}

- (id)extractObliqueSlice:(double)handle
                 specJson:(NSString *)specJson
                  outPath:(NSString *)outPath {
  NSError *error = nil;
  NSDictionary *result = [VibeNativeDicomImpl
      extractObliqueSlice:@(handle)
                  specJson:specJson
                   outPath:outPath
                     error:&error];
  if (result == nil) {
    @throw [NSException
        exceptionWithName:@"VibeNativeDicomError"
                   reason:error.localizedDescription ?: @"extractObliqueSlice failed"
                 userInfo:nil];
  }
  return result;
}

- (id)extractVolumeRender:(double)handle
                 specJson:(NSString *)specJson
          slabThicknessMm:(double)slabThicknessMm
                   stepMm:(double)stepMm
                   tfJson:(NSString *)tfJson
           clipPlanesJson:(NSString *)clipPlanesJson
             lightingJson:(NSString *)lightingJson
                  outPath:(NSString *)outPath {
  NSError *error = nil;
  NSDictionary *result = [VibeNativeDicomImpl
      extractVolumeRender:@(handle)
                 specJson:specJson
          slabThicknessMm:@(slabThicknessMm)
                   stepMm:@(stepMm)
                   tfJson:tfJson
           clipPlanesJson:clipPlanesJson
             lightingJson:lightingJson
                  outPath:outPath
                    error:&error];
  if (result == nil) {
    @throw [NSException
        exceptionWithName:@"VibeNativeDicomError"
                   reason:error.localizedDescription ?: @"extractVolumeRender failed"
                 userInfo:nil];
  }
  return result;
}

- (id)extractProjectionSlab:(double)handle
                   specJson:(NSString *)specJson
            slabThicknessMm:(double)slabThicknessMm
                     stepMm:(double)stepMm
                       mode:(double)mode
                    outPath:(NSString *)outPath {
  NSError *error = nil;
  NSDictionary *result = [VibeNativeDicomImpl
      extractProjectionSlab:@(handle)
                   specJson:specJson
            slabThicknessMm:@(slabThicknessMm)
                     stepMm:@(stepMm)
                       mode:@(mode)
                    outPath:outPath
                      error:&error];
  if (result == nil) {
    @throw [NSException
        exceptionWithName:@"VibeNativeDicomError"
                   reason:error.localizedDescription ?: @"extractProjectionSlab failed"
                 userInfo:nil];
  }
  return result;
}

- (NSString *)writeSyntheticVolumeSeries:(NSString *)outDir
                          numberOfSlices:(double)n
                          sliceSpacingMm:(double)spacing
                       transferSyntaxUID:(NSString *)tsUid
                                 gappedZ:(BOOL)gappedZ {
  NSError *error = nil;
  NSString *result =
      [VibeNativeDicomImpl writeSyntheticVolumeSeries:outDir
                                       numberOfSlices:@(n)
                                       sliceSpacingMm:@(spacing)
                                    transferSyntaxUID:tsUid
                                              gappedZ:@(gappedZ)
                                                error:&error];
  if (result == nil) {
    @throw [NSException
        exceptionWithName:@"VibeNativeDicomError"
                   reason:error.localizedDescription ?: @"writeSyntheticVolumeSeries failed"
                 userInfo:nil];
  }
  return result;
}

- (NSString *)exportBasicTextSr:(NSString *)outPath
          measurementLinesJson:(NSString *)linesJson
        sourceStudyInstanceUID:(NSString *)studyUID
       sourceSeriesInstanceUID:(NSString *)seriesUID
          sourceSopInstanceUID:(NSString *)sopUID
             sourceSopClassUID:(NSString *)sopClassUID {
  NSError *error = nil;
  NSString *result =
      [VibeNativeDicomImpl exportBasicTextSr:outPath
                                   linesJson:linesJson
                       sourceStudyInstanceUID:studyUID
                      sourceSeriesInstanceUID:seriesUID
                         sourceSopInstanceUID:sopUID
                            sourceSopClassUID:sopClassUID
                                       error:&error];
  if (result == nil) {
    @throw [NSException
        exceptionWithName:@"VibeNativeDicomError"
                   reason:error.localizedDescription ?: @"exportBasicTextSr failed"
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
