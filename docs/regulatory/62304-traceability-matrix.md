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
| SR-9001 | _TBD_ | `scripts/check-traceability.mjs` | `.github/workflows/ci.yml::traceability` (intentional-failure smoke test pending) | _n/a_ | In progress |
| SR-9002 | _TBD_ | `scripts/check-coverage.mjs` (Phase 1) | `.github/workflows/ci.yml::coverage-gate` (Phase 1) | _n/a_ | Draft |
| SR-9003 | _TBD_ | `scripts/build-vv-package.mjs` (Phase 1) | `.github/workflows/release.yml::vv-package` (Phase 1) | _n/a_ | Draft |
| SR-9004 | _TBD_ | `scripts/check-pinned-deps.mjs` (Phase 1) | `.github/workflows/ci.yml::pinned-deps` (Phase 1) | _n/a_ | Draft |
| SR-0001 | arch §3, §4 GDCM SOUP entry | _Phase 1: ios/third_party/gdcm/_ | _Phase 1: ios build CI job_ | H-004 | Draft |
| SR-0002 | arch §3, §4 GDCM SOUP entry | _Phase 1: android/src/main/cpp/gdcm/_ | _Phase 1: android build CI job_ | H-004 | Draft |
| SR-0003 | arch §4 SOUP discipline | `THIRD_PARTY_LICENSES.md` (skeleton); `docs/regulatory/62304-architecture.md` §4 | `scripts/check-pinned-deps.mjs` (Phase 1, SR-9004) | _n/a_ | Draft |
| SR-0004 | _TBD: src/NativeVibeNativeDicom.ts spec_ | _Phase 1: src/index.ts, ios/VibeNativeDicomImpl.swift, android/.../VibeNativeDicomModule.kt_ | _Phase 1: example app integration test + parity test_ | H-004 | Draft |
| SR-0005 | arch §6 (planned) | _Phase 1: ios/scripts/build-gdcm.sh, android/cpp/CMakeLists.txt_ | _Phase 1: clean-environment CI build_ | _n/a_ | Draft |
| SR-0006 | _TBD: ios/VibeNativeDicomImpl.swift, android/.../VibeNativeDicomModule.kt_ | _Phase 1_ | _Phase 1: integration test with GDCM artificially absent_ | H-004 | Draft |
| SR-0007 | arch §3 | _Phase 1: VibeNativeDicom.podspec, ios/scripts/build-gdcm.sh_ | _Phase 1: pod install + xcodebuild for iphoneos and iphonesimulator_ | _n/a_ | Draft |
| SR-0008 | arch §3 | _Phase 1: android/build.gradle_ | _Phase 1: gradle build artifact inspection_ | _n/a_ | Draft |
| SR-0009 | arch §3 | `ios/VibeNativeDicom.mm` (in place from commit 92df3bf), `ios/VibeNativeDicomImpl.swift` | Code review; future SwiftLint rule (Phase 1.5) | _n/a_ | Draft |
| SR-0010 | [`docs/architecture/native-build.md`](../architecture/native-build.md) §4 | n/a (procedure doc, not code) | Inspection: section 4 contains a 15-step checklist | _n/a_ | Verified |

## Backlinks

For convenience, requirements grouped by code module:

> _To be populated automatically by `scripts/check-traceability.mjs` once Phase 0 complete._

## Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial matrix | Vivek Sah |
| 2026-04-26 | Added SR-0001..SR-0010 (Phase 1 build-infra requirements); updated SR-9001 status to "In progress" with implementation in `scripts/check-traceability.mjs` | Vivek Sah |
