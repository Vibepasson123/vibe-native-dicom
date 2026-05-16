# Implementation Plan — `@viveksah/vibe-native-dicom`

**Status:** Approved · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

This is the canonical implementation plan for the package. Phases, library stack, file layout, and process commitments live here. Updates require a PR.

## 1. What this package is

A React Native package providing **diagnostic-grade DICOM** capabilities (parsing, decoding, 2D/MPR/3D viewing, measurement tools, DICOMweb networking) as a software component for integration into Medical Device Software products. The integrating company (the customer) is the regulatory manufacturer. This package supplies them with software meeting **IEC 62304** lifecycle requirements so they can include it in their MDR/FDA submission.

## 2. Locked decisions

| Item | Value |
| --- | --- |
| Package | `@viveksah/vibe-native-dicom` (monolithic, MIT, npm) |
| Architecture | Turbo Module + Fabric View, New Arch only |
| Languages | TypeScript (strict), Swift (behind Obj-C++ shim), Kotlin |
| Strategy | Wrap mature C/C++ libs (GDCM, libjpeg-turbo, OpenJPEG, CharLS, VTK), thin native + TS layers on top |
| Scope | Full diagnostic DICOM viewer (2D, MPR, 3D, tools, DICOMweb) |
| Regulatory path | Component supplier; customer holds clearance |
| Process | IEC 62304 (software lifecycle), ISO 14971 (risk), DICOM Conformance Statement, lightweight ISO 13485 QMS |
| Software safety class | **Class C** (see [`regulatory/62304-software-safety-class.md`](regulatory/62304-software-safety-class.md)) |
| Team | Solo dev |
| Estimated effort | 12–14 months full-time |

## 3. Native library stack & licenses

| Component | Library | License | Use |
| --- | --- | --- | --- |
| DICOM parsing/IO | **GDCM 3.x** | BSD-3-Clause | All DICOM file/network I/O, transfer syntax handling, tag dictionary |
| JPEG | **libjpeg-turbo** | BSD/IJG/zlib | JPEG Baseline / Extended / Lossless decode |
| JPEG 2000 | **OpenJPEG** | BSD-2-Clause | J2K decode (very common in radiology) |
| JPEG-LS | **CharLS** | BSD-3-Clause | JPEG-LS decode |
| 3D / MPR / Volume | **VTK 9.x** | BSD-3-Clause | Volume rendering, MPR slicing, transfer functions |
| GPU shading (2D viewer) | Hand-written **Metal** (iOS) / **Vulkan/OpenGL ES** (Android) | n/a | W/L, pan/zoom, fast frame display |
| Linear algebra (tools) | **Eigen** (header-only) | MPL-2.0 | Geometry math for measurements |
| Networking (DICOMweb) | Platform HTTP + GDCM | n/a | TLS handled by OS |

All commercial-friendly. No copyleft. Attribution recorded in `THIRD_PARTY_LICENSES.md`.

## 4. Package file layout (target)

```
.
├── src/                                  TypeScript public API + Turbo Module spec
│   ├── core/                             Parsing & I/O
│   ├── viewer/                           Fabric view components
│   ├── tools/                            Measurement & annotation tools
│   ├── windowing/                        Presets, LUTs, HU conversion
│   └── anonymize/                        DICOM Supp 142 anonymization
├── ios/                                  Swift + Obj-C++ + native libs
│   ├── core/, viewer/, volume/, tools/
│   └── third_party/                      gdcm, openjpeg, charls, vtk
├── android/                              Kotlin + JNI + native libs
│   └── src/main/{java,cpp,jniLibs}/
├── cpp/                                  Cross-platform C++ helpers
├── example/                              Bare RN demo app
├── docs/                                 (this folder)
├── fixtures/                             Public-domain DICOM test data
└── THIRD_PARTY_LICENSES.md
```

## 5. Public TypeScript API (target shape)

See [`integration/api-overview.md`](integration/api-overview.md) (to be written in Phase 0).

## 6. IEC 62304 / ISO 14971 process artifacts

These are **required** for customers to use this package in a cleared device. Live in `docs/regulatory/`. Versioned with code. **Every PR updates the relevant artifact alongside the code change.**

| Artifact | Purpose | Updated when |
| --- | --- | --- |
| Software Development Plan | Defines our 62304 process | Once, at project start |
| Software Safety Class | Class C declaration + rationale | Once, reviewed at phase boundaries |
| Architecture document | Design + classification | Phase boundaries |
| Software Requirements Spec (SRS) | Numbered requirements (SR-001…) | Each new feature |
| Traceability Matrix | Links requirement → design → code → test | Each PR |
| Verification Protocol & Evidence | Tests proving design meets requirements | Each release |
| Validation Protocol & Evidence | Tests in realistic clinical scenarios | Each release |
| Risk Management File (ISO 14971) | Hazards, risks, controls, residual risk | Each new feature, each bug |
| Hazard Analysis | Concrete failure modes | Per phase |
| DICOM Conformance Statement | Supported SOPs, syntaxes, behaviors | Each phase that adds capability |
| Anomaly List | Known issues with risk classification | Each release |

**PR rule:** every code change references a requirement ID (e.g. `SR-074`) in the commit body. CI fails if the traceability matrix doesn't link the PR to a requirement and a test.

## 7. Phase roadmap

| # | Phase | Deliverable | Effort |
| --- | --- | --- | --- |
| **0** | Process foundation | 62304 docs scaffolded, traceability tooling, CI gates, risk register opened | 1–2 wk |
| **1** | Native build infra | GDCM building inside iOS pod and Android Gradle (with GDCM's bundled libjpeg-turbo / OpenJPEG / CharLS). Hello-world call from JS into GDCM. | 3–4 wk |
| **2** | DICOM I/O API | Read all uncompressed + compressed transfer syntaxes; metadata + pixel buffer to JS; DicomWeb client (QIDO/WADO/STOW). **Promote libjpeg-turbo / OpenJPEG / CharLS from GDCM-bundled to direct SOUP** as transfer-syntax fixtures force it (each gets its own SR + 14971 risk row). | 5–7 wk |
| **3** | 2D Viewer (Fabric) | Metal/Vulkan renderer; W/L, pan/zoom/rotate, stack scroll, presets, HU display, inversion | 6–8 wk |
| **4** | Measurement & annotation tools | Linear, angle, Cobb, ROI, bidirectional, persistable + DICOM SR export | 4–6 wk |
| **5** | MPR | VTK build, volume builder, axial/sagittal/coronal/oblique slicing, sync cursors | 6–8 wk |
| **6** | 3D Volume Rendering | Ray-cast volume, transfer functions, presets, clip planes | 6–8 wk |
| **7** | Comparison & Fusion | Side-by-side sync, CT+PET overlay, DICOM SEG/RT overlay | 3–5 wk |
| **8** | Performance & Workflow | Streaming load, prefetch, LRU cache, cine, hanging protocols, anonymization | 4–6 wk |
| **9** | Hardening + V&V package | Real fixtures, perf benchmarks, full V&V evidence, customer integration guide | 4–6 wk |
| **10** | Release 1.0 | Conformance statement finalized, V&V package complete, customer-facing docs ready | 2–3 wk |

Total: **~12–14 months solo full-time.**

## 8. Phase 0 — first commits

No DICOM code yet. Process and infrastructure first:

1. `chore: switch package manager to npm` — commit existing Yarn→npm conversion.
2. `docs: add Software Development Plan (IEC 62304)`
3. `docs: declare Software Safety Class C`
4. `docs: scaffold regulatory artifact templates`
5. `chore: add traceability CI gate` — fails PRs to `src/|ios/|android/` without a requirement reference.
6. `docs: open risk register and initial hazard analysis (ISO 14971)`
7. `docs: scaffold DICOM Conformance Statement`
8. `docs(AGENTS): update for diagnostic SDK scope + 62304 mandate`
9. `docs: Phase 1 Software Requirements Spec`
10. `chore: add THIRD_PARTY_LICENSES.md skeleton`

After Phase 0, **Phase 1 (build infra)** starts under full traceability.

## 9. Open risks for the plan itself

1. **iOS GDCM build.** No officially maintained iOS build. Will fork or use community pod; evaluate at Phase 1 start.
2. **Binary size.** Estimate 60–100 MB final IPA / APK contribution from native libs once VTK is in. Consumers warned.
3. **VTK on mobile.** Plan B if VTK proves intractable: hand-written Metal/Vulkan ray-cast volume rendering (8+ extra weeks). Pre-prototype during Phase 5 prep.
4. **Solo-dev sustainability.** Recommend explicit checkpoint dates at Phase 2, 5, 7. Slip → scope down.
5. **62304 process for solo dev.** Recommend external regulatory consultant review at Phase 3, 6, 9 (~$10–$20K total).
6. **DICOM Conformance Statement** — first one we author. Modeled on published statements from RadiAnt / OsiriX MD; reviewed by consultant.

## 10. Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial plan committed | Vivek Sah |
| 2026-04-28 | Re-scoped Phase 1: scope narrowed to GDCM-only build infrastructure (GDCM's bundled libjpeg-turbo / OpenJPEG / CharLS satisfy "Hello-world call from JS into GDCM" — original Phase 1 acceptance criterion). Direct-SOUP integration of those three libs deferred to Phase 2, where it pays off as transfer-syntax fixtures hit GDCM's bundled-fork limits. Phase 2 effort estimate raised 4–5 wk → 5–7 wk to absorb that work. | Vivek Sah |
| 2026-05-16 | Phases 2 through 9 completed and merged on `main`. Phase 10 release prep: version bumped to 1.0.0, CHANGELOG + README rewritten around real APIs, DICOM conformance statement promoted Draft → Released for 1.0 with §2–§9 populated from as-shipped scope. Per-phase narrative is in `CHANGELOG.md`. | Vivek Sah |
