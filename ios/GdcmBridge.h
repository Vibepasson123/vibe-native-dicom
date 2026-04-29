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

// Writes a minimal valid synthetic DICOM (16x16 monochrome MR) to `path`
// in the given transfer syntax. Empty string defaults to Implicit VR LE
// (Phase 2.1 behaviour). Returns YES on success; on failure (unsupported
// syntax, encode failure, write failure) returns NO and populates `error`.
+ (BOOL)writeSyntheticDicomAtPath:(NSString *)path
                transferSyntaxUID:(NSString *)transferSyntaxUID
                            error:(NSError **)error;

// Returns YES when the package can decode pixel data for the given
// DICOM transfer-syntax UID. Stays in sync with the C++ kSupportedSyntaxes
// table.
+ (BOOL)isSupportedTransferSyntax:(NSString *)transferSyntaxUID;

// Phase 2.5 — extract uncompressed pixel data to `outPath` (caller-owned)
// and return geometry + path metadata as an NSDictionary. On unsupported
// transfer syntaxes returns a dict with hasPixelData=NO and no file is
// written. On unrecoverable errors (unreadable DICOM, write failure)
// returns nil and populates `error`.
+ (nullable NSDictionary *)extractPixelDataAtPath:(NSString *)dicomPath
                                            toPath:(NSString *)outPath
                                             error:(NSError **)error;

// Phase 3.1 — read a binary file as a Latin-1-encoded NSString
// (one unichar per byte, code points 0-255). Throws via `error` on read
// failure. `maxBytes` is the max allowed file size in bytes (0 = unlimited).
+ (nullable NSString *)readBinaryFileAtPath:(NSString *)path
                                    maxBytes:(double)maxBytes
                                       error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
