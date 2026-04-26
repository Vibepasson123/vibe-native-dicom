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
