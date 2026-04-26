# Architecture

Internal-facing design documentation. The customer-facing architecture summary lives in [`../regulatory/62304-architecture.md`](../regulatory/62304-architecture.md). This folder holds deeper, less formal docs intended for contributors and integrators wanting detail.

## Existing documents

- [`native-build.md`](native-build.md) — How SOUP libraries (GDCM, libjpeg-turbo, OpenJPEG, CharLS, VTK) are integrated into iOS and Android builds. **Read this before adding any third-party native dependency.**

## Planned documents (added per phase)

- `overview.md` — system-level architecture diagram + walkthrough (Phase 1)
- `turbo-module-bridge.md` — how data crosses JS ↔ native (codegen, base64 ↔ JSI trade-offs) (Phase 2)
- `viewer-pipeline.md` — Metal / Vulkan rendering pipeline for the 2D viewer (Phase 3)
- `mpr-volume-pipeline.md` — MPR + 3D volume rendering pipeline (Phase 5–6)
- `cross-platform-parity.md` — how iOS and Android stay byte-identical (Phase 1)
