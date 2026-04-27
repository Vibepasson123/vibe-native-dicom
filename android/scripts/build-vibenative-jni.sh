#!/usr/bin/env bash
# Build libVibeNativeDicom.so per ABI by linking our JNI .cpp against the
# GDCM static libraries produced by android/scripts/build-gdcm.sh.
#
# Output: android/src/main/jniLibs/<abi>/libVibeNativeDicom.so (gitignored).
# Gradle's standard AAR build picks these up automatically.
#
# Refs SR-0002, SR-0004, SR-0008.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Allow Gradle to pin the build to a single variant ABI via VND_ANDROID_ABIS
# (space-separated). When unset (manual invocation), build the full default set.
if [[ -n "${VND_ANDROID_ABIS:-}" ]]; then
  read -r -a ABIS <<< "$VND_ANDROID_ABIS"
else
  ABIS=("arm64-v8a" "x86_64")
fi
ANDROID_NDK_VERSION="${ANDROID_NDK_VERSION:-27.1.12297006}"
ANDROID_NDK_ROOT="${ANDROID_NDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}/ndk/$ANDROID_NDK_VERSION}"
ANDROID_PLATFORM="${ANDROID_PLATFORM:-android-24}"

GDCM_BUILD_ROOT="$REPO_ROOT/.build/android/gdcm"
JNI_BUILD_ROOT="$REPO_ROOT/.build/android/jni"
JNILIBS_OUT="$REPO_ROOT/android/src/main/jniLibs"
SRC_CMAKE="$REPO_ROOT/android/src/main/cpp"

# --- Pre-flight ---------------------------------------------------------------

if ! command -v cmake >/dev/null 2>&1; then
  echo "✗ cmake not found. brew install cmake" >&2
  exit 1
fi

if [[ ! -d "$ANDROID_NDK_ROOT" ]]; then
  echo "✗ Android NDK not found at $ANDROID_NDK_ROOT" >&2
  exit 1
fi

if [[ ! -f "$SRC_CMAKE/CMakeLists.txt" || ! -f "$SRC_CMAKE/VibeNativeDicom-jni.cpp" ]]; then
  echo "✗ Expected CMakeLists.txt and VibeNativeDicom-jni.cpp under $SRC_CMAKE" >&2
  exit 1
fi

# --- Ensure GDCM is built -----------------------------------------------------
gdcm_missing=false
for abi in "${ABIS[@]}"; do
  if [[ ! -f "$GDCM_BUILD_ROOT/$abi/install/lib/libgdcmCommon.a" ]]; then
    gdcm_missing=true
    break
  fi
done

if $gdcm_missing; then
  echo "▸ GDCM not built for all ABIs — running build-gdcm.sh first"
  bash "$SCRIPT_DIR/build-gdcm.sh"
fi

# --- Per-ABI build ------------------------------------------------------------
build_abi() {
  local abi="$1"
  local build_dir="$JNI_BUILD_ROOT/$abi"
  local out_dir="$JNILIBS_OUT/$abi"

  echo "▸ Building libVibeNativeDicom.so for $abi"

  rm -rf "$build_dir"
  mkdir -p "$build_dir" "$out_dir"

  cmake -S "$SRC_CMAKE" -B "$build_dir" \
    -DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_ROOT/build/cmake/android.toolchain.cmake" \
    -DANDROID_NDK="$ANDROID_NDK_ROOT" \
    -DANDROID_ABI="$abi" \
    -DANDROID_PLATFORM="$ANDROID_PLATFORM" \
    -DCMAKE_BUILD_TYPE=Release \
    -DGDCM_PREFIX="$GDCM_BUILD_ROOT/$abi/install"

  cmake --build "$build_dir" -- -j"$(sysctl -n hw.ncpu)"

  cp "$build_dir/libVibeNativeDicom.so" "$out_dir/libVibeNativeDicom.so"
  local size
  size="$(du -h "$out_dir/libVibeNativeDicom.so" | cut -f1)"
  echo "✓ $abi: $size → $out_dir/libVibeNativeDicom.so"
}

for abi in "${ABIS[@]}"; do
  build_abi "$abi"
done

echo "✓ libVibeNativeDicom.so built for ABIs: ${ABIS[*]}"
