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

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp}"
  s.private_header_files = "ios/**/*.h"
  s.exclude_files = "ios/scripts/**/*"

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
