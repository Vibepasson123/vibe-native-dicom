# Anomaly List

**Standard:** IEC 62304 §5.6.6 · **Status:** Draft · **Last updated:** 2026-05-15 · **Owner:** Vivek Sah

Known issues / anomalies in the package. Each entry has a risk classification per [`14971-risk-management.md`](14971-risk-management.md). Class C anomalies must be resolved before release; lower-class anomalies may carry forward with documented rationale.

## Open anomalies

| ID | Title | Description | Severity | Probability | Residual risk | Linked hazard | Found in version | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-002 | Jest worker SIGSEGV under `--coverage` on macOS (intermittent) | Observed once during Phase 9.3 V&V collection (`npm run vv:collect`): a single jest worker died with `signal=SIGSEGV, exitCode=null` while running `src/measurements/__tests__/canvasToImage.test.ts` under `--coverage`. 23/24 suites and 252 tests ran fine in the same invocation; a retry from a clean tree was immediately clean (24/24 suites, 256 tests). The crash is in jest-worker / istanbul-instrument under Node 24.14 on macOS 15, not in repo code. **Mitigation:** the V&V protocol already requires bundles to be produced on a clean tree; a single retry is acceptable. Re-evaluate after upgrading jest, istanbul, or the host Node. | Low | Low (1 observation in ~10 runs to date) | Low — affects V&V evidence reproducibility only, not runtime correctness; the crash is in instrumentation tooling, not library code. | None (tooling-only) | 0.1.0 (Phase 9.3) | Open — accept-and-monitor |

## Closed anomalies

| ID | Title | Closed in version | Resolution |
| --- | --- | --- | --- |
| A-001 | Android Gradle build fails on duplicate `react_codegen_<Spec>` target | 0.1.0 (Phase 1.4) | Root cause: the example app's `react.root` was pointing at the repo root (`../../../`), and the repo-root `package.json` declares `codegenConfig` for the library spec. RN's gradle plugin then ran `generateCodegenArtifactsFromSchema` for the *app* in addition to the library — emitting two CMakeLists.txt files that both defined `add_library(react_codegen_VibeNativeDicomSpec ...)`. The autolink machinery (`Android-autolinking.cmake`) `add_subdirectory`s the library copy first, then `ReactNative-application.cmake` includes the app copy, and CMake fails per CMP0002. Resolution: changed `react.root = file("../..")` in `example/android/app/build.gradle`, scoping app-level codegen detection to the `example/` directory (which has no `codegenConfig`). Library-level codegen continues to run via the library's own gradle (because `isLibrary=true`). End-to-end `./gradlew :app:assembleDebug` now succeeds for arm64-v8a + x86_64; both `libVibeNativeDicom.so` artifacts are packaged into the APK. The `buildNativeLibs` Gradle task in `android/build.gradle` was reinstated to wire the JNI build into `preBuild`. |

## Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial empty list | Vivek Sah |
| 2026-04-27 | Logged A-001 (Android Gradle codegen duplicate-target). Discovered during Phase 1.4 build verification. iOS Phase 1.4 verified clean; Android JNI standalone build verified clean; Gradle integration is the remaining gap. | Vivek Sah |
| 2026-04-27 | Closed A-001. Root-caused to `react.root` scoping in `example/android/app/build.gradle` — pointing at the repo root caused the consumer app's RN gradle plugin to also run codegen for our spec, colliding with the library's autolinked codegen target. Fix scopes `react.root` to `example/` (which has no `codegenConfig`). End-to-end `./gradlew :app:assembleDebug` verified for arm64-v8a + x86_64 from a clean tree. | Vivek Sah |
| 2026-05-15 | Logged A-002 (intermittent jest-worker SIGSEGV under `--coverage`). Observed during Phase 9.3 V&V collection; retry was immediately clean. Classified accept-and-monitor: tooling-only flake, no runtime correctness impact. | Vivek Sah |
