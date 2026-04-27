# Traceability Matrix

**Standard:** IEC 62304 §5.1.1 · **Status:** Draft · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

Links each software requirement to its design, code, and test artifacts. Updated by every PR (CI gate `SR-9001`).

## Conventions

- **Requirement** — `SR-XXXX` from [`62304-requirements.md`](62304-requirements.md).
- **Design** — section reference in [`62304-architecture.md`](62304-architecture.md) (e.g. `arch §3.4`).
- **Code** — file + symbol (e.g. `src/core/readDicom.ts:readDicom`).
- **Test** — file + test name (e.g. `src/__tests__/readDicom.test.ts:reads valid CT`).
- **Risk** — hazard ID from [`14971-hazard-analysis.md`](14971-hazard-analysis.md) (e.g. `H-014`).
- **Status** — Draft / In progress / Verified.

## Matrix

| Requirement | Design | Code | Test | Risk | Status |
| --- | --- | --- | --- | --- | --- |
| SR-9001 | arch §3 | [`scripts/check-traceability.mjs`](../../scripts/check-traceability.mjs) | [`62304-verification-protocol.md`](62304-verification-protocol.md) §7 (Phase 1) | _n/a_ | Verified |
| SR-9002 | _TBD_ | `scripts/check-coverage.mjs` (Phase 2) | `.github/workflows/ci.yml::coverage-gate` (Phase 2) | _n/a_ | Deferred to Phase 2 |
| SR-9003 | _TBD_ | `scripts/build-vv-package.mjs` (Phase 9) | `.github/workflows/release.yml::vv-package` (Phase 9) | _n/a_ | Deferred to Phase 9 |
| SR-9004 | _TBD_ | `scripts/check-pinned-deps.mjs` (Phase 2) | `.github/workflows/ci.yml::pinned-deps` (Phase 2) | _n/a_ | Deferred to Phase 2 |
| SR-0001 | arch §3, §4 GDCM SOUP entry | [`third_party/gdcm/`](../../third_party/gdcm/) submodule pinned to v3.2.5; [`ios/scripts/build-gdcm.sh`](../../ios/scripts/build-gdcm.sh); [`VibeNativeDicom.podspec`](../../VibeNativeDicom.podspec) | [`62304-verification-protocol.md`](62304-verification-protocol.md) §7 (Phase 1) — `xcodebuild` build pass | H-004 | Verified |
| SR-0002 | [`docs/architecture/native-build.md`](../architecture/native-build.md) §6 | [`android/scripts/build-gdcm.sh`](../../android/scripts/build-gdcm.sh) + [`android/scripts/iconv-shim/iconv.h`](../../android/scripts/iconv-shim/iconv.h); [`third_party/gdcm/`](../../third_party/gdcm/) submodule | [`62304-verification-protocol.md`](62304-verification-protocol.md) §7 (Phase 1) — 14 static libs × 2 ABIs produced; end-to-end APK packaging verified | H-004 | Verified |
| SR-0003 | arch §4 SOUP discipline | [`THIRD_PARTY_LICENSES.md`](../../THIRD_PARTY_LICENSES.md) (GDCM section complete; libjpeg-turbo / OpenJPEG / CharLS / VTK / Eigen as skeletons until promoted to direct SOUP in Phase 2); [`62304-architecture.md`](62304-architecture.md) §4 | [`62304-verification-protocol.md`](62304-verification-protocol.md) §7 (Phase 1) — inspection pass for GDCM | _n/a_ | Verified (GDCM only) |
| SR-0004 | [`src/NativeVibeNativeDicom.ts`](../../src/NativeVibeNativeDicom.ts) spec | [`src/getGdcmVersion.native.tsx`](../../src/getGdcmVersion.native.tsx), [`ios/VibeNativeDicomImpl.swift`](../../ios/VibeNativeDicomImpl.swift), [`ios/GdcmBridge.mm`](../../ios/GdcmBridge.mm), [`android/src/main/java/.../VibeNativeDicomModule.kt`](../../android/src/main/java/com/viveksah/vibenativedicom/VibeNativeDicomModule.kt), [`android/src/main/cpp/VibeNativeDicom-jni.cpp`](../../android/src/main/cpp/VibeNativeDicom-jni.cpp) | [`src/__tests__/index.test.tsx`](../../src/__tests__/index.test.tsx) (JS contract); [`example/src/App.tsx`](../../example/src/App.tsx) (on-device parity smoke — both platforms render `'3.2.5'` and `'PASS'`); [`62304-verification-protocol.md`](62304-verification-protocol.md) §7 (Phase 1) | H-004 | Verified |
| SR-0005 | [`docs/architecture/native-build.md`](../architecture/native-build.md) §6 | [`ios/scripts/build-gdcm.sh`](../../ios/scripts/build-gdcm.sh), [`android/scripts/build-gdcm.sh`](../../android/scripts/build-gdcm.sh), [`android/src/main/cpp/CMakeLists.txt`](../../android/src/main/cpp/CMakeLists.txt) | _Phase 9: clean-environment CI build_ | _n/a_ | Deferred to Phase 9 |
| SR-0006 | _TBD: graceful degradation in [`ios/VibeNativeDicomImpl.swift`](../../ios/VibeNativeDicomImpl.swift), [`android/src/main/java/.../VibeNativeDicomModule.kt`](../../android/src/main/java/com/viveksah/vibenativedicom/VibeNativeDicomModule.kt)_ | _Phase 2_ | _Phase 2: integration test with GDCM artificially absent_ | H-004 | Deferred to Phase 2 |
| SR-0007 | arch §3 | [`VibeNativeDicom.podspec`](../../VibeNativeDicom.podspec), [`ios/scripts/build-gdcm.sh`](../../ios/scripts/build-gdcm.sh) | iphonesimulator: verified (Phase 1.4). iphoneos device: deferred to Phase 9 (CI hardware). | _n/a_ | Partial — iphoneos deferred to Phase 9 |
| SR-0008 | arch §3 | [`android/build.gradle`](../../android/build.gradle); [`android/scripts/build-vibenative-jni.sh`](../../android/scripts/build-vibenative-jni.sh) | [`62304-verification-protocol.md`](62304-verification-protocol.md) §7 (Phase 1) — APK contains `lib/arm64-v8a/libVibeNativeDicom.so` (893 KB) + `lib/x86_64/libVibeNativeDicom.so` (864 KB) | _n/a_ | Verified |
| SR-0009 | arch §3 | [`ios/VibeNativeDicom.mm`](../../ios/VibeNativeDicom.mm), [`ios/VibeNativeDicomImpl.swift`](../../ios/VibeNativeDicomImpl.swift), [`ios/GdcmBridge.h`](../../ios/GdcmBridge.h)/[`.mm`](../../ios/GdcmBridge.mm) | [`62304-verification-protocol.md`](62304-verification-protocol.md) §7 (Phase 1) — code-review inspection pass; SwiftLint rule deferred. | _n/a_ | Verified (lint rule deferred) |
| SR-0010 | [`docs/architecture/native-build.md`](../architecture/native-build.md) §4 | n/a (procedure doc, not code) | Inspection: section 4 contains a 15-step checklist; verified end-to-end against the GDCM rollout. | _n/a_ | Verified |

## Backlinks

For convenience, requirements grouped by code module:

> _To be populated automatically by `scripts/check-traceability.mjs` once Phase 0 complete._

## Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial matrix | Vivek Sah |
| 2026-04-26 | Added SR-0001..SR-0010 (Phase 1 build-infra requirements); updated SR-9001 status to "In progress" with implementation in `scripts/check-traceability.mjs` | Vivek Sah |
| 2026-04-26 | SR-0002 moved to In progress: standalone Android GDCM build via `android/scripts/build-gdcm.sh` + iconv-shim verified locally to produce 14 static libs per ABI for arm64-v8a + x86_64. Final verification in CI deferred to Phase 1.4. | Vivek Sah |
| 2026-04-27 | SR-0004 evidence updated: A-001 (Android Gradle codegen duplicate-target) resolved; end-to-end `./gradlew :app:assembleDebug` now produces an APK with both arm64-v8a and x86_64 `libVibeNativeDicom.so` packaged. Cross-platform parity test deferred to Phase 1.5. | Vivek Sah |
| 2026-04-28 | Phase 1 close-out. Verified: SR-9001, SR-0001, SR-0002, SR-0003 (GDCM only), SR-0004, SR-0008, SR-0009 (lint rule deferred), SR-0010. Partial: SR-0007 (iphoneos device deferred to Phase 9). Deferred to Phase 2: SR-9002, SR-9004, SR-0006. Deferred to Phase 9: SR-9003, SR-0005. Evidence references point at [`62304-verification-protocol.md`](62304-verification-protocol.md) §7. | Vivek Sah |
