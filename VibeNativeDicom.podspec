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
  s.exclude_files = "ios/scripts/**/*"
  s.header_mappings_dir = "."
  s.pod_target_xcconfig = {
    # Let GdcmBridge.mm find "dicom_read.h" without a path prefix.
    "HEADER_SEARCH_PATHS" => "$(PODS_TARGET_SRCROOT)/cpp",
  }

  s.swift_version = "5.9"

  # Build GDCM from pinned source (third_party/gdcm submodule, tag v3.2.5) into
  # an XCFramework on first pod install. See docs/architecture/native-build.md.
  # The script is idempotent: it skips the rebuild if .build/ios/GDCM.xcframework
  # already exists.
  s.prepare_command = <<-CMD
    bash ios/scripts/build-gdcm.sh
  CMD

  s.vendored_frameworks = ".build/ios/GDCM.xcframework"
  s.preserve_paths = ".build/ios/GDCM.xcframework"

  install_modules_dependencies(s)
end
