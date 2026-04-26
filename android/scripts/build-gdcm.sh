#!/usr/bin/env bash
# Build GDCM as a static library for Android NDK targets, one slice per ABI.
#
# Implements: SR-0002 (GDCM Android integration), SR-0005 (reproducible from
#             source), SR-0008 (per-ABI .so output) — the pre-build half.
# Architecture: docs/architecture/native-build.md §6.
# Mirrors ios/scripts/build-gdcm.sh by intent: cross-platform parity contract
# (62304-architecture.md §5).
#
# Usage:
#   ./android/scripts/build-gdcm.sh
#
# Output: .build/android/<abi>/install/{lib,include}/  (gitignored)
# Exit codes: 0 on success, non-zero on any build failure.
#
# Phase 1.4 will write a second script that builds our shared
# libVibeNativeDicom.so against these GDCM static libs and stages the result
# under android/src/main/jniLibs/<abi>/, where Gradle's standard AAR build
# bundles it without any AGP externalNativeBuild integration.

set -euo pipefail

# Resolve paths regardless of where this script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

GDCM_SOURCE="$REPO_ROOT/third_party/gdcm"
BUILD_ROOT="$REPO_ROOT/.build/android/gdcm"

# ABIs we ship per SR-0008.
ABIS=("arm64-v8a" "x86_64")

# Pinned NDK version. Must match android/build.gradle's ndkVersion.
ANDROID_NDK_VERSION="${ANDROID_NDK_VERSION:-27.1.12297006}"
ANDROID_NDK_ROOT="${ANDROID_NDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}/ndk/$ANDROID_NDK_VERSION}"

# Min SDK matches android/build.gradle (currently 24, per the package config).
ANDROID_PLATFORM="${ANDROID_PLATFORM:-android-24}"

# Same flag set as ios/scripts/build-gdcm.sh (parity).
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

if [[ ! -f "$GDCM_SOURCE/CMakeLists.txt" ]]; then
  echo "✗ GDCM source not found at $GDCM_SOURCE" >&2
  echo "  Did you run 'git submodule update --init --recursive'?" >&2
  exit 1
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "✗ cmake not found on PATH. Install with: brew install cmake" >&2
  exit 1
fi

if [[ ! -d "$ANDROID_NDK_ROOT" ]]; then
  echo "✗ Android NDK not found at $ANDROID_NDK_ROOT" >&2
  echo "  Set ANDROID_NDK_ROOT or install NDK $ANDROID_NDK_VERSION via Android Studio." >&2
  exit 1
fi

if [[ ! -f "$ANDROID_NDK_ROOT/build/cmake/android.toolchain.cmake" ]]; then
  echo "✗ Android CMake toolchain not found at $ANDROID_NDK_ROOT/build/cmake/android.toolchain.cmake" >&2
  exit 1
fi

mkdir -p "$BUILD_ROOT"

# --- Skip rebuild if all slices already exist --------------------------------
all_built=true
for abi in "${ABIS[@]}"; do
  if [[ ! -d "$BUILD_ROOT/$abi/install/lib" ]]; then
    all_built=false
    break
  fi
done

if $all_built; then
  echo "✓ GDCM Android slices already built under $BUILD_ROOT/<abi>/ (skipping rebuild; rm -rf .build/android to force)"
  exit 0
fi

# --- Per-ABI builder ----------------------------------------------------------
build_abi() {
  local abi="$1"
  local build_dir="$BUILD_ROOT/$abi/build"
  local install_dir="$BUILD_ROOT/$abi/install"

  echo "▸ Building GDCM for Android ABI: $abi"

  rm -rf "$build_dir" "$install_dir"
  mkdir -p "$build_dir"

  cmake -S "$GDCM_SOURCE" -B "$build_dir" \
    -DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_ROOT/build/cmake/android.toolchain.cmake" \
    -DANDROID_NDK="$ANDROID_NDK_ROOT" \
    -DANDROID_ABI="$abi" \
    -DANDROID_PLATFORM="$ANDROID_PLATFORM" \
    -DCMAKE_INSTALL_PREFIX="$install_dir" \
    -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
    -DCMAKE_C_FLAGS="-I$SCRIPT_DIR/iconv-shim" \
    -DCMAKE_CXX_FLAGS="-I$SCRIPT_DIR/iconv-shim" \
    "${GDCM_CMAKE_FLAGS[@]}"

  cmake --build "$build_dir" --target install --config Release \
    -- -j"$(sysctl -n hw.ncpu)"

  echo "✓ $abi built: $(ls "$install_dir/lib/"libgdcm*.a 2>/dev/null | wc -l | tr -d ' ') static libs at $install_dir/lib"
}

for abi in "${ABIS[@]}"; do
  build_abi "$abi"
done

echo "✓ GDCM built for Android ABIs: ${ABIS[*]}"
echo "  Outputs: $BUILD_ROOT/<abi>/install/{lib,include}/"
