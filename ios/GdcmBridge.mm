#import "GdcmBridge.h"

#import <gdcmVersion.h>

@implementation GdcmBridge

+ (NSString *)version {
  const char *v = gdcm::Version::GetVersion();
  return [NSString stringWithUTF8String:v];
}

@end
