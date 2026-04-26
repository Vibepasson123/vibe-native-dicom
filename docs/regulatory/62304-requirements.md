# Software Requirements Specification (SRS)

**Standard:** IEC 62304 §5.2 · **Status:** Draft · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

## 1. Purpose

Numbered, testable software requirements for `@viveksah/vibe-native-dicom`. Each requirement has:

- ID (`SR-XXXX`)
- Title
- Description (what the system shall do)
- Rationale / source (why)
- Verification method (how it'll be tested)
- Phase (when it's implemented)
- Status (Draft / Approved / Implemented / Verified)

## 2. ID conventions

- `SR-0xxx` — system-level (functional)
- `SR-1xxx` — performance / non-functional
- `SR-2xxx` — security / privacy
- `SR-3xxx` — usability / API ergonomics
- `SR-9xxx` — process / build / CI

IDs are never reused. Once a requirement is retired it is marked **Obsolete** and kept for history.

## 3. Requirements

> _Filled in iteratively. Phase 0 establishes only process requirements; Phase 1 adds functional requirements._

### Phase 0 — Process & Build Infrastructure

| ID | Title | Description | Rationale | Verification | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SR-9001 | Traceability gate | CI shall fail any push or PR whose commits modify `src/`, `ios/`, `android/`, or `cpp/` but do not contain a `Refs SR-XXXX` reference in the commit body for at least one valid requirement ID. | Per IEC 62304 §5.1.1, all changes must trace to a requirement. Test-case linking is enforced via manual review of the traceability matrix update accompanying the change. | CI workflow runs `scripts/check-traceability.mjs` against the commit range; intentional-failure dry-run on a commit without an `SR-XXXX` reference. | 0 | Draft |
| SR-9002 | Coverage minimums | The build shall reject any release where line coverage on `src/` is below 80% or coverage on safety-critical modules below 100% line + branch. | Class C verification rigor (§5.6). | CI coverage gate test. | 0 | Draft |
| SR-9003 | Release V&V package | Each tagged release shall include a downloadable V&V evidence ZIP containing test results, coverage report, traceability matrix snapshot, and anomaly list as of that tag. | Customer audit support. | Release workflow test. | 0 | Draft |
| SR-9004 | Reproducible build | All third-party native libraries shall be pinned to specific versions documented in `THIRD_PARTY_LICENSES.md`. CI shall fail if an unpinned dependency is added. | SOUP control (§5.3.3). | CI dependency-pin check. | 0 | Draft |

### Phase 1 — Native build infrastructure

| ID | Title | Description | Rationale | Verification | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SR-0001 | GDCM library integration (iOS) | The package shall integrate GDCM (Grassroots DICOM) as a static library on iOS via the project's CocoaPods integration, linking successfully against the example app. | GDCM is the canonical SOUP for DICOM parsing/IO across the project (architecture §4). Without iOS integration, no DICOM functionality can ship for iOS. | iOS build of the example app via `pod install` + `xcodebuild`; symbol verification that GDCM functions are reachable from the Turbo Module. | 1 | Draft |
| SR-0002 | GDCM library integration (Android) | The package shall integrate GDCM as a static or shared library on Android via the project's NDK + CMake build, linking successfully against the example app. | Symmetric to SR-0001 for Android. | Android build of the example app via Gradle; symbol verification. | 1 | Draft |
| SR-0003 | Pinned GDCM version | The exact GDCM version used shall be recorded in `THIRD_PARTY_LICENSES.md` and `docs/regulatory/62304-architecture.md` §4. The project shall not use unpinned (`*`, `^`, `~`) version specifiers for GDCM. | IEC 62304 §5.3.3 SOUP discipline (controllable, reproducible builds). | Dependency-pin CI gate (SR-9004); manual file inspection. | 1 | Draft |
| SR-0004 | `getGdcmVersion()` JS API | The package shall expose a JS function `getGdcmVersion(): string` returning the GDCM version string of the linked library (e.g. `"3.0.24"`). The function shall return identical strings on iOS and Android for the same package version. | Smoke test verifying the full TS → Obj-C++ shim → Swift → GDCM and TS → Kotlin → JNI → GDCM chains. Establishes the Turbo Module integration pattern for all subsequent native libraries. | Integration test in the example app on iOS device + Android emulator asserting non-empty matching version strings; cross-platform parity test. | 1 | Draft |
| SR-0005 | Reproducible native builds from source | All native libraries (GDCM in this phase; libjpeg-turbo / OpenJPEG / CharLS in Phase 2; VTK in Phase 5) shall be built from source via build scripts/CMake configurations checked into the repo. The repo shall not contain opaque pre-built binary artifacts whose origin cannot be reconstructed. | SOUP transparency for regulatory; reproducible builds (IEC 62304 §5.1); customer audit support. | Clean-environment CI build that produces equivalent artifacts (per-byte or per-symbol equivalent, allowing for build-stamp differences). | 1 | Draft |
| SR-0006 | Load-time symbol resolution | The package shall fail loudly (throw at module-load time) if it cannot resolve linked GDCM symbols, rather than silently falling back to stub or no-op behavior. | Hazard H-004 (mis-applied transfer syntax decoder) and similar require unambiguous failure modes — silent fallbacks are unacceptable for diagnostic software. | Integration test that introspects symbol availability and asserts module-load failure when GDCM is artificially absent. | 1 | Draft |
| SR-0007 | iOS XCFramework or static library output | The iOS build shall produce a single XCFramework or static library that the example app's CocoaPods integration consumes. The build shall include device + simulator slices (arm64 device, arm64 simulator, x86_64 simulator). | Standard iOS distribution requirement; allows the example app and customer apps to build for both device and simulator. | `pod install` + `xcodebuild` for both `iphoneos` and `iphonesimulator` SDK destinations. | 1 | Draft |
| SR-0008 | Android per-ABI shared library output | The Android build shall produce `.so` artifacts for at least the ABIs `arm64-v8a` (production devices) and `x86_64` (emulator). Inclusion of additional ABIs (`armeabi-v7a`, `x86`) is permitted but not required. | Standard Android distribution requirement; matches the React Native New Architecture default ABI set. | Gradle build inspecting the resulting `.so` files in the AAR / package output. | 1 | Draft |
| SR-0009 | iOS implementation pattern | All iOS Turbo Module implementations shall follow the "thin Obj-C++ shim delegating to Swift" pattern: the `.mm` file imports the auto-generated `<Module>-Swift.h` and forwards to a Swift class; real logic lives in Swift. | Architectural decision recorded in `62304-architecture.md` §3. Centralizes Swift logic, keeps the codegen-required Obj-C++ surface minimal. | Code review; future SwiftLint / clang-tidy rule (Phase 1.5). | 1 | Draft |
| SR-0010 | Documented "add a SOUP library" procedure | The architecture document (`docs/architecture/native-build.md`) shall document the procedure for adding a new SOUP library to the iOS and Android build, including pinning, license capture, SOUP-inventory update, and hazard analysis. | Phase 2 (libjpeg-turbo/OpenJPEG/CharLS) and Phase 5 (VTK) require multiple SOUP additions; without a documented procedure they will diverge. | Architecture doc has a section "Adding a SOUP library" with a step-by-step checklist. | 1 | Draft |

### Phase 2 — DICOM I/O

> _To be added._

### Subsequent phases

> _To be added phase-by-phase._

## 4. Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial structure + Phase 0 process requirements | Vivek Sah |
| 2026-04-26 | Refined SR-9001 description (drop test-case-ID gate, focus on SR-XXXX commit reference); seeded Phase 1 SRS (SR-0001..SR-0010) | Vivek Sah |
