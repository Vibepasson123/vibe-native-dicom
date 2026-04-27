# V&V Evidence Manifest — Phase 1 (Native build infrastructure)

**Standard:** IEC 62304 §5.6 · **Status:** Frozen · **Date:** 2026-04-28 · **Owner:** Vivek Sah

This document is a phase-level V&V evidence manifest. It is the in-tree analogue of the eventual release ZIP (`SR-9003`) and exists so a regulatory reviewer (or future maintainer) can reconstruct what was verified, when, and against which version of the code, without leaving the repository.

A full release-grade V&V evidence package — coverage HTML, mutation reports, test summaries — is implemented in Phase 9 per `SR-9003`. Phase 1 has no production DICOM code, so coverage / mutation evidence does not yet apply.

## 1. Phase 1 acceptance criteria

From [`docs/PLAN.md`](../PLAN.md) §7:

> **Phase 1 — Native build infra:** GDCM building inside iOS pod and Android Gradle (with GDCM's bundled libjpeg-turbo / OpenJPEG / CharLS). Hello-world call from JS into GDCM.

Acceptance: a JavaScript caller can invoke a TurboModule method that resolves to a GDCM C++ call on both iOS and Android, returning a known-good value.

**Met:** [`getGdcmVersion()`](../../src/getGdcmVersion.native.tsx) returns `'3.2.5'` on both platforms (verified — see §3).

## 2. Code under verification (frozen reference)

| Subject | Path | Pinned to |
| --- | --- | --- |
| GDCM source | [`third_party/gdcm/`](../../third_party/gdcm/) | tag `v3.2.5`, commit `dacccb6c0` |
| Android NDK | (consumed via `$ANDROID_HOME`) | `27.1.12297006` (pinned in [`android/build.gradle`](../../android/build.gradle)) |
| Xcode toolchain | (consumed via system) | recorded per build run |
| Library version | [`package.json`](../../package.json) | `0.1.0` |
| Last commit at freeze | (see below) | _filled in at commit_ |

To reproduce the build environment, the pinned NDK and the GDCM submodule together are sufficient. Xcode/Swift versions are recorded in [`62304-verification-protocol.md`](62304-verification-protocol.md) per build run.

## 3. Verification activities — what was run, what passed

The full per-SR results table lives in [`62304-verification-protocol.md`](62304-verification-protocol.md) §7. This section is a one-page summary.

### 3.1 Build verification

| Platform | Command | Result | Artifact | Size |
| --- | --- | --- | --- | --- |
| iOS (simulator, arm64) | `xcodebuild -workspace example/ios/VibeNativeDicomExample.xcworkspace -scheme VibeNativeDicomExample -configuration Debug -sdk iphonesimulator build` | Pass | `.build/ios/GDCM.xcframework` + simulator app | _per-build_ |
| Android (arm64-v8a + x86_64) | `cd example/android && ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a,x86_64` | Pass | `example/android/app/build/outputs/apk/debug/app-debug.apk` containing `lib/arm64-v8a/libVibeNativeDicom.so` (893 KB) and `lib/x86_64/libVibeNativeDicom.so` (864 KB) | 36 MB APK |

### 3.2 JS-side contract verification

| Subject | Tool | Result |
| --- | --- | --- |
| Public API surface | `npm test` (Jest) → [`src/__tests__/index.test.tsx`](../../src/__tests__/index.test.tsx) | 3/3 passing |
| Type safety | `npm run typecheck` (TypeScript strict) | Clean |
| Style + lint | `npm run lint` (ESLint flat config) | Clean |

### 3.3 Cross-platform parity smoke

The example app ([`example/src/App.tsx`](../../example/src/App.tsx)) calls `getGdcmVersion()` and asserts the returned string equals `'3.2.5'`. Both the iOS and Android binary launch the same UI; PASS/FAIL is rendered on screen.

| Platform | Asserted at runtime | Result |
| --- | --- | --- |
| iOS simulator | `getGdcmVersion() === '3.2.5'` → "PASS" rendered | Pass (manual launch) |
| Android emulator | `getGdcmVersion() === '3.2.5'` → "PASS" rendered | Pass (manual launch) |

A device-driven automated parity test (Detox or similar) is deferred to Phase 9 per the verification protocol.

## 4. Anomalies open at Phase 1 close-out

None. See [`anomaly-list.md`](anomaly-list.md). A-001 (Android Gradle codegen duplicate-target) was discovered during Phase 1.4 and closed in commit `6a491ad` before this phase close-out.

## 5. SOUP discipline status

| SOUP | Pinned version | License | Direct integration | License attribution |
| --- | --- | --- | --- | --- |
| GDCM | v3.2.5 (`dacccb6c0`) | BSD-3-Clause-modified | Yes — submodule + per-platform build | [`THIRD_PARTY_LICENSES.md`](../../THIRD_PARTY_LICENSES.md) (complete) |
| libjpeg-turbo | (bundled in GDCM) | BSD-3-Clause | No — used via GDCM's `gdcmjpeg{8,12,16}` static libs | Skeleton; promoted to direct in Phase 2 |
| OpenJPEG | (bundled in GDCM as `gdcmopenjp2`) | BSD-2-Clause | No — used via GDCM's static lib | Skeleton; promoted to direct in Phase 2 |
| CharLS | (bundled in GDCM as `gdcmcharls`) | BSD-3-Clause | No — used via GDCM's static lib | Skeleton; promoted to direct in Phase 2 |
| zlib (`gdcmzlib`) | (bundled in GDCM) | zlib | No — used via GDCM's static lib | Inherited from GDCM attribution |
| expat (`gdcmexpat`) | (bundled in GDCM) | MIT | No — used via GDCM's static lib | Inherited from GDCM attribution |

The "bundled in GDCM" entries inherit GDCM's pinned version (v3.2.5) and license attribution. They will be promoted to direct SOUP entries in Phase 2 as transfer-syntax fixtures expose the limits of GDCM's bundled forks. The procedure for that promotion is the 15-step "Adding a SOUP library" checklist in [`docs/architecture/native-build.md`](../architecture/native-build.md) §4.

## 6. Sign-off

**Phase 1 acceptance criterion ("Hello-world call from JS into GDCM, building inside iOS pod and Android Gradle") is met on both platforms. No open anomalies. Ready to proceed to Phase 2 (DICOM I/O API).**

Signed off: Vivek Sah · 2026-04-28

## 7. Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-28 | Initial Phase 1 V&V evidence manifest | Vivek Sah |
