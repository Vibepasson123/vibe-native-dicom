# Software Architecture

**Standard:** IEC 62304 §5.3 · **Status:** Draft · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

## 1. Purpose

Describes the high-level architecture of `@viveksah/vibe-native-dicom`, its decomposition into software items, and dependencies on third-party libraries (SOUP).

> Filled in iteratively. Update this document at each phase boundary and whenever a new top-level module is added.

## 2. System context

```
┌──────────────────────────────────────────────┐
│  Customer's React Native App                 │
│  ┌────────────────────────────────────────┐  │
│  │  @viveksah/vibe-native-dicom (SDK)    │  │
│  │  ┌────────────┐  ┌──────────────────┐  │  │
│  │  │ JS / TS    │  │ Native (iOS/    │  │  │
│  │  │ public API │  │ Android)        │  │  │
│  │  └────────────┘  └──────────────────┘  │  │
│  │         │                  │           │  │
│  │         └────  TurboModule ┘           │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
                  │
                  ▼
            DICOM source
       (file / DICOMweb / PACS)
```

## 3. Software item decomposition

> _To be filled._ Each item below will be expanded as it is implemented.

| Item | Class | Description | Status |
| --- | --- | --- | --- |
| Core I/O (parsing, transfer syntaxes) | C | `src/core/`, `ios/core/`, `android/.../core/` | Phase 1–2 |
| 2D Viewer | C | Fabric view, Metal/Vulkan renderer | Phase 3 |
| Tools (measurement, annotation) | C | `src/tools/` | Phase 4 |
| MPR | C | Volume builder, slicer | Phase 5 |
| 3D Volume Rendering | C | VTK wrap | Phase 6 |
| Comparison / Fusion | C | Sync engine, overlay compositor | Phase 7 |
| Performance / Workflow | C | LRU cache, prefetch, anonymization | Phase 8 |

## 4. SOUP (Software Of Unknown Provenance) inventory

Per IEC 62304 §5.3.3 — each external library used is documented here with version, license, intended use, hazards.

| Library | Version | License | Intended use | Known hazards | Mitigation |
| --- | --- | --- | --- | --- | --- |
| GDCM | _TBD Phase 1_ | BSD-3-Clause | DICOM parsing & I/O | Mis-handling rare transfer syntaxes | Pinned version, full fixture coverage, mutation testing |
| libjpeg-turbo | _TBD Phase 1_ | BSD/IJG/zlib | JPEG decoding | Decoder bugs in Lossless mode historically | Pinned version, fixture suite per JPEG variant |
| OpenJPEG | _TBD Phase 1_ | BSD-2-Clause | JPEG 2000 decoding | Memory issues on malformed streams | Sandbox via input validation, fuzz testing |
| CharLS | _TBD Phase 1_ | BSD-3-Clause | JPEG-LS decoding | Less-tested codepaths | Fixture suite |
| VTK | _TBD Phase 5_ | BSD-3-Clause | 3D / MPR | Large codebase, hard to audit fully | Use minimal subset, document used classes |
| Eigen | _TBD Phase 4_ | MPL-2.0 | Geometry math | None known | Pinned version |

## 5. Cross-platform parity contract

iOS and Android implementations of the same logical software item MUST produce byte-identical output for the same input. Verified by parity tests (Phase 1 onward). Any divergence is logged as an anomaly per [`anomaly-list.md`](anomaly-list.md).

## 6. Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial skeleton | Vivek Sah |
