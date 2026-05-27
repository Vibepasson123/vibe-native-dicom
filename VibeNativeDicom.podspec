require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "VibeNativeDicom"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/Vibepasson123/vibe-native-dicom.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp}", "cpp/**/*.{h,cpp}"
  # Only the TurboModule shim header is private — it #imports the codegen
  # spec header which uses C++ types and cannot live in the umbrella header.
  # GdcmBridge.h is pure Obj-C and must be in the umbrella so Swift code in
  # the same pod (VibeNativeDicomImpl.swift) can call into it.
  # cpp/dicom_read.h is private — Swift never touches it; only GdcmBridge.mm
  # (Obj-C++) does, and that file gets the include path via header_dir.
  s.private_header_files = "ios/VibeNativeDicom.h", "cpp/**/*.h"
  # Exclude maintainer scripts and the vendored XCFramework's own headers
  # from the pod's source-file globs — the XCFramework is consumed via
  # s.vendored_frameworks below, not via header search.
  s.exclude_files = "ios/scripts/**/*", "ios/Frameworks/**/*"
  s.header_mappings_dir = "."
  s.pod_target_xcconfig = {
    # Header search paths:
    #   - $(PODS_TARGET_SRCROOT)/cpp lets GdcmBridge.mm find "dicom_read.h"
    #     without a path prefix.
    #   - The GDCM XCFramework's per-slice Headers/ directories are NOT
    #     auto-added to consumer search paths by CocoaPods when the
    #     framework wraps a static .a (vs a real .framework). Add both
    #     slices explicitly so dicom_volume.cpp can `#include "gdcmAttribute.h"`
    #     on device and simulator builds alike.
    "HEADER_SEARCH_PATHS" => [
      "$(PODS_TARGET_SRCROOT)/cpp",
      "$(PODS_TARGET_SRCROOT)/ios/Frameworks/GDCM.xcframework/ios-arm64/Headers",
      "$(PODS_TARGET_SRCROOT)/ios/Frameworks/GDCM.xcframework/ios-arm64_x86_64-simulator/Headers",
    ].join(" "),
    # Static-archive selection per-slice. CocoaPods links the XCFramework
    # path but the .a inside it isn't auto-discovered for `vendored_frameworks`
    # wrapping static libs. Per-config xcconfig keys (suffix
    # `[sdk=iphoneos*]` / `[sdk=iphonesimulator*]`) pick the right slice at
    # link time.
  }

  # The user_target_xcconfig propagates to the consumer app's link step,
  # whereas pod_target_xcconfig above only affects the library's own
  # compile step. Both are needed: the library's .o files need GDCM
  # headers to compile; the app target needs libgdcm-merged.a on its
  # link line.
  #
  # CocoaPods automatically extracts the per-platform slice of an
  # `.xcframework` containing a static library into
  # `${BUILT_PRODUCTS_DIR}/XCFrameworkIntermediates/<PodName>/`. This
  # path is stable across configs and across "developing the library
  # via npm workspace" vs "installed under node_modules", so a single
  # OTHER_LDFLAGS entry works in both modes.
  s.user_target_xcconfig = {
    "OTHER_LDFLAGS" =>
      "$(inherited) \"${BUILT_PRODUCTS_DIR}/XCFrameworkIntermediates/VibeNativeDicom/libgdcm-merged.a\"",
  }

  s.swift_version = "5.9"

  # GDCM ships as a prebuilt XCFramework under ios/Frameworks/. Both device
  # (ios-arm64) and simulator (ios-arm64_x86_64-simulator) slices are
  # included; total weight ~57 MB. See docs/architecture/native-build.md.
  #
  # The XCFramework is built by maintainers via ios/scripts/build-gdcm.sh
  # (kept in the repo for reproducibility but excluded from the pod via
  # s.exclude_files above) and refreshed when GDCM is bumped. Consumers
  # `pod install` no longer invoke that script — they vendor the prebuilt
  # artefact directly, so there is no dependency on the consumer's CMake /
  # Xcode CLI toolchain.
  s.vendored_frameworks = "ios/Frameworks/GDCM.xcframework"
  s.preserve_paths = "ios/Frameworks/GDCM.xcframework"

  install_modules_dependencies(s)
end
