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
// (Phase 2.1 behaviour). `numberOfFrames` >= 1 (Phase 3.4); values > 1
// are only valid for the uncompressed transfer syntaxes. Returns YES on
// success; on failure (unsupported syntax, encode failure, write failure)
// returns NO and populates `error`.
+ (BOOL)writeSyntheticDicomAtPath:(NSString *)path
                transferSyntaxUID:(NSString *)transferSyntaxUID
                   numberOfFrames:(NSInteger)numberOfFrames
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

// Phase 4.2 — write a Basic Text Structured Report (DICOM PS3.4 §A.35.1.4)
// to `outPath` containing the supplied measurement lines. Each line
// becomes a TEXT content item. The SR is linked to the source image via
// (0040,A375) Current Requested Procedure Evidence Sequence.
// `linesJson` is a JSON-encoded array of strings.
+ (nullable NSString *)writeBasicTextSrAtPath:(NSString *)outPath
                                     linesJson:(NSString *)linesJson
                            sourceStudyInstanceUID:(NSString *)studyUID
                           sourceSeriesInstanceUID:(NSString *)seriesUID
                              sourceSopInstanceUID:(NSString *)sopUID
                                 sourceSopClassUID:(NSString *)sopClassUID
                                             error:(NSError **)error;

// Phase 5.1 — build a 3D volume from a JSON-encoded array of DICOM file
// paths. Returns an NSDictionary matching the JS VolumeInfo type.
// Phase 5.2: `resampleNonUniformZ` enables trilinear-along-Z resample.
+ (nullable NSDictionary *)buildVolumeFromDicomPathsJson:(NSString *)json
                                     resampleNonUniformZ:(BOOL)resample
                                                   error:(NSError **)error;

// Phase 5.1 — extract one slice. plane: 0=axial, 1=sagittal, 2=coronal.
+ (nullable NSDictionary *)extractMprSliceFromHandle:(double)handle
                                               plane:(NSInteger)plane
                                               index:(NSInteger)index
                                              toPath:(NSString *)outPath
                                               error:(NSError **)error;

// Phase 5.1 — drop the volume buffer for `handle`.
+ (void)releaseVolumeWithHandle:(double)handle;

// Phase 5.3 — extract an oblique slice. `specJson` is a JSON-encoded
// ObliqueSpec object (see types.ts). Returns an NSDictionary with the
// MprSliceInfo shape.
+ (nullable NSDictionary *)extractObliqueSliceFromHandle:(double)handle
                                                 specJson:(NSString *)specJson
                                                   toPath:(NSString *)outPath
                                                    error:(NSError **)error;

// Phase 6.1 — extract a slab projection (MIP / MinIP / Average).
// mode: 0=MIP, 1=MinIP, 2=Average. slabThicknessMm=0 falls back to a
// single sample per ray (= extractObliqueSlice). stepMm=0 defaults to
// the smallest input axis spacing.
+ (nullable NSDictionary *)extractProjectionSlabFromHandle:(double)handle
                                                   specJson:(NSString *)specJson
                                            slabThicknessMm:(double)slabThicknessMm
                                                     stepMm:(double)stepMm
                                                       mode:(NSInteger)mode
                                                     toPath:(NSString *)outPath
                                                      error:(NSError **)error;

// Phase 5.1 — write a synthetic volume series; returns a JSON-encoded
// array of slice paths. Phase 5.2 options: transferSyntaxUID + gappedZ.
+ (nullable NSString *)writeSyntheticVolumeSeriesAtDir:(NSString *)outDir
                                        numberOfSlices:(NSInteger)n
                                        sliceSpacingMm:(double)spacing
                                     transferSyntaxUID:(NSString *)tsUid
                                               gappedZ:(BOOL)gappedZ
                                                 error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
