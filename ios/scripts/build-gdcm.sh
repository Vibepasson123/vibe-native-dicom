#!/usr/bin/env bash
# Build GDCM as a static library for iOS device + simulator slices,
# then package the result as an XCFramework consumable by VibeNativeDicom.podspec.
#
# Implements: SR-0001 (GDCM iOS integration), SR-0005 (reproducible from source),
#             SR-0007 (XCFramework with device + simulator slices).
# Architecture: docs/architecture/native-build.md §5.
#
# This script is invoked by VibeNativeDicom.podspec via `prepare_command`.
# It is also runnable standalone for development:
#   ./ios/scripts/build-gdcm.sh
#
# Output: .build/ios/GDCM.xcframework (gitignored)
# Exit codes: 0 on success, non-zero on any build failure (set -e).

set -euo pipefail

# Resolve script and repo paths regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

GDCM_SOURCE="$REPO_ROOT/third_party/gdcm"
BUILD_ROOT="$REPO_ROOT/.build/ios/gdcm"
OUT_FRAMEWORK="$REPO_ROOT/.build/ios/GDCM.xcframework"

# Minimum iOS deployment target. Must match VibeNativeDicom.podspec's
# `min_ios_version_supported` (currently inherited from React Native's RCT
# defaults — typically iOS 15.1 as of RN 0.85).
IOS_DEPLOYMENT_TARGET="${IOS_DEPLOYMENT_TARGET:-15.1}"

# CMake invocation common across slices. We disable everything we don't need
# to keep the build fast and the artifact small. GDCM bundles its own
# OpenJPEG / libjpeg / charls — for Phase 1 we accept the bundled versions
# (Phase 2 replaces them with our own pinned copies, see PLAN.md §7).
GDCM_CMAKE_FLAGS=(
  -DCMAKE_BUILD_TYPE=Release
  -DBUILD_SHARED_LIBS=OFF
  -DGDCM_BUILD_TESTING=OFF
  -DGDCM_BUILD_EXAMPLES=OFF
  -DGDCM_BUILD_APPLICATIONS=OFF
  -DGDCM_BUILD_DOCBOOK_MANPAGES=OFF
  -DGDCM_USE_VTK=OFF
  -DGDCM_USE_SYSTEM_OPENJPEG=OFF
  -DGDCM_USE_SYSTEM_CHARLS=OFF
  -DGDCM_USE_SYSTEM_OPENSSL=OFF
)

# --- Pre-flight ---------------------------------------------------------------

if [[ ! -d "$GDCM_SOURCE" ]]; then
  echo "✗ GDCM source not found at $GDCM_SOURCE" >&2
  echo "  Did you run 'git submodule update --init --recursive'?" >&2
  exit 1
fi

if [[ ! -f "$GDCM_SOURCE/CMakeLists.txt" ]]; then
  echo "✗ Expected CMakeLists.txt at $GDCM_SOURCE/CMakeLists.txt" >&2
  exit 1
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "✗ cmake not found on PATH. Install with: brew install cmake" >&2
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "✗ xcodebuild not found. Install Xcode + command-line tools." >&2
  exit 1
fi

mkdir -p "$BUILD_ROOT"

# --- Skip rebuild if XCFramework already exists -------------------------------
# Idempotent: pod install runs this every time, but we only rebuild when the
# output is missing. To force a rebuild, delete .build/ at the repo root.
if [[ -f "$OUT_FRAMEWORK/Info.plist" ]]; then
  echo "✓ GDCM.xcframework already built at $OUT_FRAMEWORK (skipping rebuild; rm -rf .build/ to force)"
  exit 0
fi

# --- Slice builder ------------------------------------------------------------
#
# build_slice <slice-name> <CMAKE_OSX_SYSROOT> <CMAKE_OSX_ARCHITECTURES>
#
# Produces a static library at $BUILD_ROOT/<slice-name>/install/lib/libgdcm*.a
build_slice() {
  local slice="$1"
  local sysroot="$2"
  local arch="$3"

  local build_dir="$BUILD_ROOT/$slice/build"
  local install_dir="$BUILD_ROOT/$slice/install"

  echo "▸ Building GDCM slice: $slice (sysroot=$sysroot, arch=$arch)"

  rm -rf "$build_dir" "$install_dir"
  mkdir -p "$build_dir"

  cmake -S "$GDCM_SOURCE" -B "$build_dir" \
    -DCMAKE_SYSTEM_NAME=iOS \
    -DCMAKE_OSX_SYSROOT="$sysroot" \
    -DCMAKE_OSX_ARCHITECTURES="$arch" \
    -DCMAKE_OSX_DEPLOYMENT_TARGET="$IOS_DEPLOYMENT_TARGET" \
    -DCMAKE_INSTALL_PREFIX="$install_dir" \
    -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
    "${GDCM_CMAKE_FLAGS[@]}"

  cmake --build "$build_dir" --target install --config Release \
    -- -j"$(sysctl -n hw.ncpu)"
}

# --- Slice 1: iOS device (arm64) ----------------------------------------------
build_slice "ios-arm64-device"      "iphoneos"          "arm64"

# --- Slice 2: iOS simulator (arm64 + x86_64 fat) ------------------------------
# CMake's iOS support requires a single CMAKE_OSX_ARCHITECTURES value when
# building for simulator with multiple archs; we pass them as a semicolon-
# separated list to produce a fat binary. xcodebuild -create-xcframework then
# bundles it as a single simulator slice.
build_slice "ios-arm64-simulator"   "iphonesimulator"   "arm64;x86_64"

# --- Combine into XCFramework -------------------------------------------------
#
# GDCM installs multiple static libraries (libgdcmCommon.a, libgdcmDICT.a,
# libgdcmDSED.a, libgdcmMSFF.a, ...). For an XCFramework we need to merge
# them into a single .a per slice using libtool, then create-xcframework.

merge_static_libs() {
  local slice_install="$1"
  local out_lib="$2"
  echo "▸ Merging static libs in $slice_install/lib into $out_lib"
  # libtool with multiple -static inputs produces a combined archive.
  # The -no_warning_for_no_symbols flag silences benign warnings about
  # empty archives (some GDCM sub-libraries are headers-only).
  local libs=()
  for lib in "$slice_install"/lib/libgdcm*.a; do
    [[ -f "$lib" ]] && libs+=("$lib")
  done
  if [[ ${#libs[@]} -eq 0 ]]; then
    echo "✗ No GDCM static libs found in $slice_install/lib" >&2
    exit 1
  fi
  rm -f "$out_lib"
  libtool -static -no_warning_for_no_symbols -o "$out_lib" "${libs[@]}"
}

DEVICE_LIB="$BUILD_ROOT/ios-arm64-device/install/lib/libgdcm-merged.a"
SIM_LIB="$BUILD_ROOT/ios-arm64-simulator/install/lib/libgdcm-merged.a"

merge_static_libs "$BUILD_ROOT/ios-arm64-device/install"    "$DEVICE_LIB"
merge_static_libs "$BUILD_ROOT/ios-arm64-simulator/install" "$SIM_LIB"

# Headers are identical between slices; pick one for the framework include path.
HEADERS="$BUILD_ROOT/ios-arm64-device/install/include/gdcm-3.2"

if [[ ! -d "$HEADERS" ]]; then
  echo "✗ Expected GDCM headers at $HEADERS — was the install step skipped?" >&2
  exit 1
fi

echo "▸ Creating XCFramework at $OUT_FRAMEWORK"
rm -rf "$OUT_FRAMEWORK"
xcodebuild -create-xcframework \
  -library "$DEVICE_LIB" -headers "$HEADERS" \
  -library "$SIM_LIB"    -headers "$HEADERS" \
  -output "$OUT_FRAMEWORK"

echo "✓ GDCM.xcframework built at $OUT_FRAMEWORK"
