# Native Build Strategy

**Status:** Approved · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah · **Linked requirements:** SR-0001, SR-0002, SR-0003, SR-0005, SR-0007, SR-0008, SR-0010

This document records the decision on **how third-party native libraries (SOUP) are integrated into the iOS and Android builds** of `@viveksah/vibe-native-dicom`. It is the precondition for Phase 1 task 1.2 onward and binds the integration pattern for all subsequent SOUP additions (libjpeg-turbo, OpenJPEG, CharLS, VTK, Eigen).

The decision below applies symmetrically to both platforms. Where iOS and Android differ in mechanics, both are described.

---

## 1. The decision in one sentence

**We build every SOUP library from pinned source via build scripts and CMake configurations checked into the repository.** No prebuilt opaque binaries; no community pods of unknown provenance; no hidden dependency hops.

This applies to GDCM in Phase 1, to libjpeg-turbo / OpenJPEG / CharLS in Phase 2, and to VTK in Phase 5. Eigen (Phase 4) is header-only and is consumed via a vendored source tree only.

## 2. Options considered

### Option 1 — Prebuilt XCFramework / `.so` checked in

Build GDCM (or any SOUP) once on a maintainer machine, commit the resulting `GDCM.xcframework` and per-ABI `libgdcm.so` into the repo. The podspec references `vendored_frameworks`; Gradle references `jniLibs/`.

**Pros:**

- Fast first install for downstream consumers — no native build on `pod install` / `gradle build`.
- No build-tool prerequisites on consumer machines beyond Xcode and Android Studio.

**Cons:**

- Opaque blobs in the repo. Auditors and customer regulatory teams cannot verify the binary matches the claimed source.
- Provenance is "trust the maintainer's machine." This is the *exact* failure mode IEC 62304 §5.3.3 SOUP discipline is designed to prevent.
- Repo size grows by 50–200 MB per binary library × ABI. We have six SOUP libraries planned. Quickly becomes untenable.
- A binary built on macOS 14 with Xcode 16 may misbehave on macOS 15 with Xcode 17 in subtle ways. Source builds are forward-portable.

**Verdict:** Disqualified by the **regulatory posture** for this project (component supplier path, customer audits expected).

### Option 2 — Build from pinned source via repo-checked build scripts

Add GDCM source as a git submodule at `third_party/gdcm/`, pinned to a specific tag or commit SHA. Provide build scripts (`ios/scripts/build-gdcm.sh`) that invoke CMake to produce platform artifacts. The podspec runs the script via `prepare_command`. Android's `externalNativeBuild` block in `build.gradle` references the same source.

**Pros:**

- Full SOUP transparency. Every byte of every shipped binary traces back to a specific commit of the upstream library plus checked-in build options.
- Satisfies SR-0005 (reproducible native builds from source) directly.
- Customer audit story is clean: "here is the submodule, here is the build script, here are the flags. Reproduce on a clean machine; you get the same artifact."
- Repo size impact is small (the submodule reference is one line; nobody clones the submodule's history unnecessarily).
- Same GDCM source tree drives both iOS and Android, eliminating divergence.

**Cons:**

- First `pod install` and first Android Gradle sync take 5–15 minutes per platform on a typical developer machine. Subsequent builds use CocoaPods / Gradle native caches and are near-instant.
- Consumers need CMake on their `PATH` (already required for any RN package using NDK; trivially installed via Homebrew on macOS).
- Build script complexity is real — not "free."

**Verdict:** **Selected.** Build time cost is one-time and acceptable; the regulatory benefit is decisive.

### Option 3 — Community-maintained pod / Gradle artifact

Use a third-party pod (e.g. `pod 'GDCM', :git => '<community-fork>'`) or a Maven artifact (e.g. a community NDK build of GDCM published to JCenter / Maven Central).

**Pros:**

- Lowest initial setup effort.

**Cons:**

- Adds an unaudited dependency hop. The community fork's relationship to upstream GDCM is informal.
- Community pods have a history of being abandoned, deleted from registries, or renamed. Customer audits cannot accept "this came from a GitHub user's personal repo."
- License compliance and version pinning are the community maintainer's discipline, not ours.
- We lose direct control over compile flags (which matter for, e.g., turning off GDCM's optional GPL components or non-DICOM-related codecs).

**Verdict:** Disqualified by SOUP discipline and customer audit requirements.

---

## 3. Consequences of the decision

### Repo layout

A new top-level `third_party/` directory is added (not yet present; introduced in Phase 1.2):

```
third_party/
├── gdcm/                       git submodule, pinned to a specific GDCM tag
├── libjpeg-turbo/              (Phase 2)
├── openjpeg/                   (Phase 2)
├── charls/                     (Phase 2)
├── vtk/                        (Phase 5, large)
└── eigen/                      (Phase 4, header-only)
```

iOS and Android build scripts both read from `third_party/`.

iOS-specific scripts and CMake wrappers live in `ios/scripts/` and `ios/cmake/`. Android-specific build files live in `android/src/main/cpp/CMakeLists.txt`.

### Cost we are accepting

| Cost | Magnitude | Mitigation |
| --- | --- | --- |
| First `pod install` build time | 5–15 min for GDCM alone, more as we add JPEG decoders | CocoaPods caches the built artifacts in `~/Library/Caches/CocoaPods/`. Subsequent installs are fast. |
| Android first Gradle build | 5–15 min similar | Gradle native caches. Subsequent builds are fast. |
| CI build time | ~20 min cold cache, ~3 min warm | GitHub Actions cache step keyed on `third_party/<lib>/` submodule SHAs. |
| Consumer prerequisites | Xcode + CocoaPods + CMake (iOS); Android Studio + NDK + CMake (Android) | All standard for native RN. CMake required by RN's New Architecture anyway. Documented in `docs/integration/getting-started.md` (Phase 1.4). |

### Cost we are NOT accepting

We do **not** accept committing prebuilt binaries into the repo. There will be no `*.xcframework`, `*.framework`, or `*.so` files checked into git for SOUP libraries. The example app's CocoaPods cache (`example/ios/Pods/`) is gitignored already; the pattern continues for SOUP outputs.

---

## 4. Adding a SOUP library — the procedure (satisfies SR-0010)

This is the canonical checklist for any future SOUP addition (libjpeg-turbo, OpenJPEG, CharLS, VTK, etc.). Every step is mandatory; PRs that skip steps are rejected.

1. **License vetting.** Confirm the library's license is in the approved set: BSD-2/3-Clause, MIT, Apache-2.0, MPL-2.0 (with file-level copyleft rules followed for any modifications), zlib, ISC. If not on this list, escalate before proceeding.
2. **Pin a version.** Choose an upstream tag or commit SHA. Avoid `master`, `main`, or moving refs.
3. **Add as submodule.** `git submodule add <url> third_party/<lib>` at the pinned ref.
4. **Update [`THIRD_PARTY_LICENSES.md`](../../THIRD_PARTY_LICENSES.md).** Fill in the version, source URL, intended use, and paste the verbatim license text from the pinned source tree.
5. **Update [SOUP inventory](../regulatory/62304-architecture.md) §4.** Add the library with version, license, intended use, known hazards, mitigations.
6. **Update [hazard analysis](../regulatory/14971-hazard-analysis.md)** if the library introduces or affects any hazard. Cross-reference the new entries.
7. **Add a build script.** Create `ios/scripts/build-<lib>.sh` (CMake invocation producing an iOS-fat static library, then `xcrun xcodebuild -create-xcframework`) and the corresponding Android CMake target in `android/src/main/cpp/CMakeLists.txt`.
8. **Wire the iOS podspec.** Add `s.prepare_command` (or extend it) to run the build script. Add `s.vendored_frameworks` pointing at the resulting `.xcframework` (built into `.build/` and gitignored).
9. **Wire the Android Gradle build.** Add the library to `externalNativeBuild { cmake {} }` in `android/build.gradle`. Ensure ABIs `arm64-v8a` and `x86_64` minimum.
10. **Add a smoke-test method.** Expose at least one trivial Turbo Module method that exercises the library (e.g. `getGdcmVersion()`, `getOpenJpegVersion()`). The method must return identical output on both platforms (cross-platform parity contract, architecture §5).
11. **Add an integration test.** In the example app, assert the smoke-test method returns the expected non-empty value on iOS and Android.
12. **Add a parity test.** Assert both platforms return byte-identical output for the smoke-test method.
13. **Add SR-XXXX requirements.** New requirements in [SRS](../regulatory/62304-requirements.md) covering the integration. ID range `0xxx` for functional requirements.
14. **Update [traceability matrix](../regulatory/62304-traceability-matrix.md).** Link new SRs to architecture sections, code paths, tests, and any related hazards.
15. **PR.** Commits cite the new SR IDs (`Refs SR-XXXX`) per AGENTS.md §6.1. CI traceability gate will reject otherwise.

This is a 15-step procedure on purpose. Each step exists to satisfy a specific IEC 62304 / ISO 14971 / customer-audit obligation.

---

## 5. iOS specifics

GDCM is built as a **static library** for iOS, then packaged into an **XCFramework** containing slices for:

- `arm64-apple-ios` (device)
- `arm64-apple-ios-simulator` (Apple-Silicon simulator)
- `x86_64-apple-ios-simulator` (Intel simulator, dropped if the project's iOS deployment target makes it unnecessary; otherwise included for compatibility)

The build flow:

```
third_party/gdcm/  (submodule at pinned tag)
        │
        ▼
ios/scripts/build-gdcm.sh
        │
        │  cmake -DCMAKE_BUILD_TYPE=Release -DGDCM_BUILD_SHARED_LIBS=OFF \
        │        -DGDCM_USE_SYSTEM_OPENJPEG=OFF -DGDCM_USE_SYSTEM_LIBJPEG=OFF \
        │        -DCMAKE_OSX_DEPLOYMENT_TARGET=<min iOS> \
        │        -DCMAKE_SYSTEM_NAME=iOS  ...
        │  cmake --build .
        │  xcodebuild -create-xcframework ...
        ▼
.build/ios/GDCM.xcframework  (gitignored)
        │
        ▼
VibeNativeDicom.podspec  (s.vendored_frameworks)
        │
        ▼
example/ios/Pods/  (CocoaPods integrates the framework)
```

`.build/` is gitignored. The podspec's `prepare_command` invokes the build script during `pod install`. CocoaPods caches the resulting frameworks per integrity hash, so re-runs are fast.

## 6. Android specifics

GDCM is built as a **static library per ABI** via a standalone CMake invocation in `android/scripts/build-gdcm.sh` — symmetric to the iOS approach in §5. The output static archives are consumed by Phase 1.4's JNI-bridge build, which produces our shared `libVibeNativeDicom.so` per ABI and stages it into `android/src/main/jniLibs/<abi>/` for the standard Gradle AAR build to package.

```
third_party/gdcm/  (same submodule shared with iOS)
        │
        ▼
android/scripts/build-gdcm.sh
        │  for each ABI in {arm64-v8a, x86_64}:
        │    cmake -DCMAKE_TOOLCHAIN_FILE=<NDK>/build/cmake/android.toolchain.cmake
        │          -DANDROID_ABI=<abi> -DANDROID_PLATFORM=android-24
        │          -DCMAKE_C_FLAGS=-I<repo>/android/scripts/iconv-shim
        │          -DCMAKE_CXX_FLAGS=-I<repo>/android/scripts/iconv-shim
        │          [GDCM disable-flags identical to ios/scripts/build-gdcm.sh]
        ▼
.build/android/gdcm/<abi>/install/{lib,include}/  (gitignored)
        │
        ▼
[Phase 1.4] android/scripts/build-vibenative-jni.sh
        │  builds libVibeNativeDicom.so per ABI against GDCM static libs
        ▼
android/src/main/jniLibs/<abi>/libVibeNativeDicom.so  (gitignored, regenerated)
        │
        ▼
android/build/outputs/aar/  (Gradle's standard AAR build embeds jniLibs/)
```

### Why a standalone script instead of AGP `externalNativeBuild`?

We initially tried `externalNativeBuild { cmake { path "src/main/cpp/CMakeLists.txt" } }` plus `add_subdirectory(third_party/gdcm)`. This produced a **duplicate-target collision** on `react_codegen_VibeNativeDicomSpec`: when the consuming app's React Native autolinker processes our package, both our package's auto-generated codegen CMakeLists *and* the app's own auto-generated codegen CMakeLists try to define the same target. AGP's CMake configure errors out.

Switching to a standalone script side-steps the autolink entirely — our package no longer participates in AGP's CMake graph. The codegen target is created exactly once by the consuming app, and our pre-built `.so` rides into the AAR via `jniLibs/`. This pattern is also what react-native-mmkv and react-native-vision-camera use.

### iconv shim

Android's bionic libc does not ship `iconv`, but GDCM's `Utilities/gdcmext/mec_mr3_io.c` (Toshiba / Canon MEC MR3 vendor-extension parser) hard-includes `<iconv.h>`. To compile GDCM unmodified, we provide a header-only shim at `android/scripts/iconv-shim/iconv.h` whose `iconv_open` returns `(iconv_t)-1`. The upstream code already has a fallback for that case (emits the literal "No iconv support" for Japanese text fields).

Effect on Android: the MEC MR3 vendor parser still works for everything except Japanese text within those proprietary tags. iOS uses the system libiconv and has full functionality. **No public API in `@viveksah/vibe-native-dicom` exposes this vendor parser today**, so this divergence does not break the cross-platform parity contract for any shipped feature. If we expose vendor-extension parsing in a future phase, this limitation is documented in the integration guide and the Conformance Statement.

### NDK pinning

NDK version pinned in `android/build.gradle`'s `ndkVersion` and in `android/scripts/build-gdcm.sh`'s `ANDROID_NDK_VERSION` default. Update both together.

### ABIs

`arm64-v8a` (production) and `x86_64` (emulator). Optional `armeabi-v7a` if any customer requires 32-bit ARM support; not shipped by default.

## 7. Open issues to decide before Phase 1.2 starts

These are deliberately *not* decided in this document — they are tactical decisions for the implementing PR:

1. **Specific GDCM version to pin.** Latest stable is preferred. Confirm at Phase 1.2 start that the chosen version compiles cleanly on iOS + Android with NDK 26 and Xcode 26.
2. **Whether to enable GDCM's bundled OpenJPEG and libjpeg.** Initially **no** (`GDCM_USE_SYSTEM_OPENJPEG=OFF` and `GDCM_USE_SYSTEM_LIBJPEG=OFF` AND `GDCM_USE_BUNDLED_OPENJPEG=OFF`) — we will add those libraries independently in Phase 2 and link them ourselves. This avoids version drift between GDCM-bundled and our standalone copies.
3. **Build-time prerequisites docs.** A `docs/integration/getting-started.md` section listing required tools (Xcode ≥ 16, CocoaPods ≥ 1.16, CMake ≥ 3.20, Android NDK r26) — written in Phase 1.4 alongside the smoke-test integration.
4. **CI cache strategy.** GitHub Actions cache key for `third_party/gdcm/`-based builds. Likely keyed on submodule SHA + iOS / Android SDK version.

## 8. Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial decision: build every SOUP library from pinned source. Procedure for adding a SOUP library documented. | Vivek Sah |
