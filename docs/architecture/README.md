# Architecture

Internal-facing design documentation. The customer-facing architecture summary lives in [`../regulatory/62304-architecture.md`](../regulatory/62304-architecture.md). This folder holds deeper, less formal docs intended for contributors and integrators wanting detail.

> Populated during Phase 1 onward. Topics expected:
>
> - `overview.md` — system-level architecture diagram + walkthrough
> - `turbo-module-bridge.md` — how data crosses JS ↔ native (codegen, base64-vs-JSI trade-offs)
> - `native-build.md` — how GDCM, JPEG decoders, and VTK are built and linked on iOS and Android
> - `viewer-pipeline.md` — Metal/Vulkan rendering pipeline for the 2D viewer
> - `mpr-volume-pipeline.md` — MPR + 3D volume rendering pipeline
> - `cross-platform-parity.md` — how iOS and Android stay byte-identical
