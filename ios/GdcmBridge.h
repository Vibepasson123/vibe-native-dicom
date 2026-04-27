// Pure Obj-C interface to GDCM functionality.
//
// Swift cannot include C++ headers directly. This header exposes a
// minimal Obj-C surface that Swift can call via `@objc`; the matching
// .mm file does the actual #import of <gdcm/...> headers and calls
// into the C++ API.
//
// Refs SR-0004 (getGdcmVersion JS API), SR-0006 (load-time symbol resolution).

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface GdcmBridge : NSObject

// Returns the version string of the linked GDCM library (e.g. @"3.2.5").
// Always returns a non-nil string; if the linker omitted GDCM the call
// would fail to compile / link, not return nil.
+ (NSString *)version;

@end

NS_ASSUME_NONNULL_END
