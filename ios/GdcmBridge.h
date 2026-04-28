// Pure Obj-C interface to GDCM functionality.
//
// Swift cannot include C++ headers directly. This header exposes a
// minimal Obj-C surface that Swift can call via `@objc`; the matching
// .mm file does the actual #import of <gdcm/...> headers and calls
// into the C++ API.
//
// Refs SR-0004 (getGdcmVersion JS API), SR-0006 (load-time symbol
//      resolution), SR-0011 (readDicom).

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface GdcmBridge : NSObject

// Returns the version string of the linked GDCM library (e.g. @"3.2.5").
// Always returns a non-nil string; if the linker omitted GDCM the call
// would fail to compile / link, not return nil.
+ (NSString *)version;

// Reads a DICOM file from `path`. On success returns an NSDictionary
// matching the DicomFile shape declared in src/types.ts. On failure,
// returns nil and populates `error` with the GDCM-side error message.
+ (nullable NSDictionary *)readDicomAtPath:(NSString *)path
                                     error:(NSError **)error;

// Writes a minimal valid DICOM file (16x16 monochrome MR, Implicit VR LE)
// to `path`. Returns YES on success; on failure returns NO and populates
// `error`.
+ (BOOL)writeSyntheticDicomAtPath:(NSString *)path
                            error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
