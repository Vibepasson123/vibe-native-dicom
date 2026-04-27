# Anomaly List

**Standard:** IEC 62304 §5.6.6 · **Status:** Draft · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

Known issues / anomalies in the package. Each entry has a risk classification per [`14971-risk-management.md`](14971-risk-management.md). Class C anomalies must be resolved before release; lower-class anomalies may carry forward with documented rationale.

## Open anomalies

| ID | Title | Description | Severity | Probability | Residual risk | Linked hazard | Found in version | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-001 | Android Gradle build fails on duplicate `react_codegen_<Spec>` target | Running `./gradlew :app:assembleDebug` from `example/android` fails at CMake configure with `add_library cannot create target "react_codegen_VibeNativeDicomSpec" because another target with the same name already exists`. Root cause: the consumer app's RN autolink (Android-autolinking.cmake) does `add_subdirectory` on our library's auto-generated `<lib>/build/generated/source/codegen/jni/CMakeLists.txt`, AND ReactNative-application.cmake separately does `add_subdirectory` on the app's own `<app>/build/generated/source/codegen/jni/CMakeLists.txt`. Both define the same target. Affects Android end-to-end build only; the standalone JNI build (`bash android/scripts/build-vibenative-jni.sh`) and per-platform unit testing of the Kotlin module / JNI .cpp / GDCM static libs work correctly. iOS is unaffected. | S2 | P5 | A (acceptable) — does not affect any shipping feature (no Android distribution yet); blocks downstream Android Gradle integration only. | _n/a_ (build infrastructure issue, no clinical hazard) | 0.1.0 (Phase 1.4) | Open |

## Closed anomalies

| ID | Title | Closed in version | Resolution |
| --- | --- | --- | --- |
| _none_ | | | |

## Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial empty list | Vivek Sah |
| 2026-04-27 | Logged A-001 (Android Gradle codegen duplicate-target). Discovered during Phase 1.4 build verification. iOS Phase 1.4 verified clean; Android JNI standalone build verified clean; Gradle integration is the remaining gap. | Vivek Sah |
