# Verification Protocol

**Standard:** IEC 62304 §5.6 · **Status:** Draft · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

## 1. Purpose

Defines how `@viveksah/vibe-native-dicom` is verified — i.e. how we demonstrate that the software meets its requirements ([`62304-requirements.md`](62304-requirements.md)).

## 2. Test types

| Layer | Tool | What it verifies |
| --- | --- | --- |
| Unit (TS) | Jest | Pure functions, public API shape, validators |
| Unit (Swift) | XCTest | Native parsing, math, GDCM/VTK wrappers |
| Unit (Kotlin) | JUnit + Robolectric | Same as Swift, on Android |
| Integration | Custom harness in `example/` app | Turbo Module wiring, end-to-end JS↔native call |
| Cross-platform parity | `parity-tests/` (added Phase 1) | iOS and Android produce byte-identical output for same DICOM input |
| Performance | Benchmarks in `bench/` (added Phase 3) | Decode + render time within published budgets |
| Mutation testing | Stryker (TS), Muter (Swift), Pitest (Kotlin) | Test-suite effectiveness on safety-critical modules |
| Static analysis | TypeScript strict + ESLint + SwiftLint + ktlint + clang-tidy | Type & style compliance |
| Fuzz testing | libFuzzer / Jazzer (Phase 2 onward, on parsers) | Robustness vs. malformed input |

## 3. Coverage targets

- **Overall**: ≥ 80% line coverage (enforced by `SR-9002`).
- **Safety-critical modules** (parsing, W/L, HU conversion, transfer syntax dispatch, pixel decode dispatch, MPR/3D math): **100% line + branch coverage**, with mutation score ≥ 80%.
- Coverage reports collected per-platform and aggregated in the V&V evidence ZIP.

## 4. Test data

All test fixtures live under `fixtures/` and are anonymized public-domain DICOM files. Provenance recorded in `fixtures/PROVENANCE.md` (added Phase 1). Fixtures cover:

- Modalities: CT, MR, X-ray, US, PET, NM, MG, RT.
- Transfer syntaxes: Implicit/Explicit VR LE/BE, JPEG Baseline/Extended/Lossless, JPEG 2000 lossy/lossless, JPEG-LS, RLE, deflate.
- Edge cases: multi-frame, padded, malformed (negative tests).

## 5. Evidence collection

Each release produces a V&V evidence ZIP (`SR-9003`):

- `tests-summary.json` — test pass/fail counts per platform.
- `coverage/` — line/branch coverage HTML reports.
- `mutation/` — mutation test reports.
- `traceability-snapshot.md` — frozen matrix as of the tag.
- `anomalies.md` — open anomalies.
- `fixtures-manifest.txt` — list of fixture files + hashes.

Attached to the GitHub release.

## 6. Re-verification triggers

Per IEC 62304 §5.6.7, full verification re-run on:

- Every release tag.
- Any change to a safety-critical module.
- Any change to a SOUP version.
- Any addition of a new SOUP.
- Any change to a verification tool.

## 7. Verification results — Phase 1 (build infrastructure)

Records the verification activities run for SR-0001..SR-0010 and SR-9001..SR-9004. Each row links to the executed evidence (commit, log, build artifact).

### Method legend
- **B** — Build verification (the subject command runs from a clean tree and produces the expected artifact)
- **I** — Inspection (manual review of the artifact / file)
- **U** — Unit test (Jest / XCTest / JUnit)
- **S** — Smoke test (artifact runs; expected runtime behaviour observed)

### Phase 1 results

| Req | Method | Procedure | Result | Evidence | Date | Tester |
| --- | --- | --- | --- | --- | --- | --- |
| SR-9001 | B+I | Push commits touching `src/`, `ios/`, `android/`, `cpp/` paths without an SR-XXXX reference; verify CI fails. Then push with reference; verify CI passes. | Pass — gate active since commit f7c404d. Every commit on `main` since carries an `Refs SR-XXXX` line. | [`scripts/check-traceability.mjs`](../../scripts/check-traceability.mjs); CI runs since f7c404d | 2026-04-26 | Vivek Sah |
| SR-9002 | I | Inspect the codebase for a coverage gate. | Deferred — implementation slated for Phase 2 once we have safety-critical TS modules under test. Status remains Draft. | _n/a_ | 2026-04-28 | Vivek Sah |
| SR-9003 | I | Inspect the codebase for a V&V evidence packaging script. | Deferred — implementation slated for Phase 9 (release hardening). Status remains Draft. | _n/a_ | 2026-04-28 | Vivek Sah |
| SR-9004 | I | Inspect for a pinned-deps gate. | Deferred — implementation slated for Phase 2 (when we add the first non-GDCM SOUP). Status remains Draft. NDK pinned manually in [`android/build.gradle`](../../android/build.gradle); GDCM pinned via submodule (v3.2.5). | _n/a_ | 2026-04-28 | Vivek Sah |
| SR-0001 | B | Run `xcodebuild -workspace example/ios/VibeNativeDicomExample.xcworkspace -scheme VibeNativeDicomExample -configuration Debug -sdk iphonesimulator build` from a fresh `pod install`. | Pass — `** BUILD SUCCEEDED **`. `GDCM.xcframework` produced under `.build/ios/`; example app links it via the podspec's `vendored_frameworks`. | Phase 1.4 build log; commit 535015d | 2026-04-26 | Vivek Sah |
| SR-0002 | B | Run `bash android/scripts/build-gdcm.sh` from a fresh checkout. | Pass — produces 14 GDCM static libs per ABI for arm64-v8a + x86_64 under `.build/android/gdcm/<abi>/install/lib/`. Iconv-shim verified to satisfy GDCM's mec_mr3_io.c stub requirement. | Phase 1.3 build log; commit fa64019 | 2026-04-26 | Vivek Sah |
| SR-0003 | I | Inspect [`THIRD_PARTY_LICENSES.md`](../../THIRD_PARTY_LICENSES.md) for GDCM section completeness; inspect [`62304-architecture.md`](62304-architecture.md) §4 for SOUP inventory entry. | Pass for GDCM (v3.2.5, BSD-3-Clause-modified, full Copyright.txt verbatim). Skeletons present for libjpeg-turbo / OpenJPEG / CharLS / VTK / Eigen — to be filled when promoted to direct SOUP in Phase 2. | [`THIRD_PARTY_LICENSES.md`](../../THIRD_PARTY_LICENSES.md); commit bdfc75c | 2026-04-26 | Vivek Sah |
| SR-0004 | B+S+U | (i) Build verification on both platforms. (ii) Cross-platform parity smoke: launch the example app on iOS simulator and Android emulator; verify both display GDCM version "3.2.5" and "PASS". (iii) Jest test asserting JS surface contract. | (i) Pass — iOS xcodebuild + Android `./gradlew :app:assembleDebug` both succeed; both ship `libVibeNativeDicom.so` / `GDCM.xcframework`. (ii) Pass — example app's [`example/src/App.tsx`](../../example/src/App.tsx) renders the version and asserts it equals `'3.2.5'` at runtime. Manual launch on a simulator/emulator confirms the same string on both platforms. (iii) Pass — `npm test` reports 3/3 passing in [`src/__tests__/index.test.tsx`](../../src/__tests__/index.test.tsx). | Commits 535015d (iOS+Android bridge), 6a491ad (A-001 fix); Phase 1.5 commit (this one) for the parity UI + Jest test. | 2026-04-28 | Vivek Sah |
| SR-0005 | I | Inspect for clean-environment CI build. | Deferred — first CI hardware build slated for Phase 9 (V&V package). Local clean-tree builds documented above for SR-0001 / SR-0002 / SR-0004 substitute interim. | _n/a_ | 2026-04-28 | Vivek Sah |
| SR-0006 | I | Inspect for runtime SOUP-absent integration test. | Deferred — slated for Phase 2 alongside transfer-syntax decoders. The current behaviour (TurboModule throws if `libVibeNativeDicom.so` / framework missing) is implicit but not yet asserted. | _n/a_ | 2026-04-28 | Vivek Sah |
| SR-0007 | B | Run `pod install` then `xcodebuild` for both `iphoneos` and `iphonesimulator` SDKs. | Partial — iphonesimulator verified (Phase 1.4). iphoneos device build pending physical-device access; deferred to first CI run (Phase 9). | Phase 1.4 build log | 2026-04-28 | Vivek Sah |
| SR-0008 | B+I | Inspect the produced AAR (or APK that consumes it) for `libVibeNativeDicom.so` under both `lib/arm64-v8a/` and `lib/x86_64/`. | Pass — `unzip -l example/android/app/build/outputs/apk/debug/app-debug.apk` shows `lib/arm64-v8a/libVibeNativeDicom.so` (893 KB) and `lib/x86_64/libVibeNativeDicom.so` (864 KB). | Commit 6a491ad build log | 2026-04-28 | Vivek Sah |
| SR-0009 | I | Inspect the iOS layer for the Obj-C++ shim pattern (Swift never directly includes C++ headers). | Pass — [`ios/GdcmBridge.h`](../../ios/GdcmBridge.h) is pure Obj-C; [`ios/GdcmBridge.mm`](../../ios/GdcmBridge.mm) is the only file that includes `gdcmVersion.h`. [`ios/VibeNativeDicomImpl.swift`](../../ios/VibeNativeDicomImpl.swift) calls `GdcmBridge.version()` — no C++ in the Swift compilation unit. SwiftLint enforcement deferred to Phase 1.5+. | Commit 535015d | 2026-04-28 | Vivek Sah |
| SR-0010 | I | Inspect [`docs/architecture/native-build.md`](../architecture/native-build.md) §4 for the 15-step "Adding a SOUP library" procedure. | Pass — section 4 contains the checklist; verified end-to-end against the GDCM rollout in Phase 1. | Commit c47be45 | 2026-04-26 | Vivek Sah |

### Phase 1 anomalies open at close-out
None. A-001 (Android Gradle codegen duplicate target) was discovered during Phase 1.4 verification and closed in commit 6a491ad before Phase 1 close-out.

### Phase 1 verification sign-off
**Status:** All in-scope SR-0001..SR-0010 and SR-9001 pass or are explicitly deferred with rationale. Phase 1 acceptance criterion ("Hello-world call from JS into GDCM, building inside iOS pod and Android Gradle") is met on both platforms.

**Signed off:** Vivek Sah · 2026-04-28

## 8. Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial protocol | Vivek Sah |
| 2026-04-28 | Section 7 added: Phase 1 verification results table + sign-off. | Vivek Sah |
