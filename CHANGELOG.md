# Changelog

All notable changes to `@viveksah/vibe-native-dicom` are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-05-16

First production release. Closes the eleven-phase roadmap in [`docs/PLAN.md`](docs/PLAN.md). The full per-commit history is in `git log`; the entries below condense it to the capability units that consumers see.

### Added — Phase 2: DICOM I/O

- `readDicom(path)` and `writeSyntheticDicom(uid?, numberOfFrames?)` — parse and synthesise DICOM files across iOS + Android (Phase 2.1).
- 11 transfer syntaxes decoded via GDCM-bundled codecs (Phase 2.2): Implicit/Explicit VR LE, JPEG Baseline, JPEG Extended, JPEG Lossless (Process 14, including SV1), JPEG-LS Lossless + Near-Lossless, JPEG 2000 Lossless + Lossy, RLE Lossless.
- Recursive SQ traversal + ergonomic accessor helpers for the common viewer tags (Phase 2.3).
- `DicomWebClient` with QIDO-RS, WADO-RS, and STOW-RS support (Phase 2.4).
- `extractPixelDataToFile` — out-of-band pixel transfer that bypasses the 33% bridge bloat and 75% CPU hit of the base64 path (Phase 2.5).

### Added — Phase 3: 2D viewer

- `DicomImageView` — pure-JS PNG-encoding viewer with live window/level (Phase 3.1).
- `DicomImageViewSkia` — GPU viewer; W/L applied via an SkSL fragment shader, so slider drag stays interactive on 512×512 CT (Phase 3.2).
- `useViewerGestures` — pinch / pan / rotate composed gesture wired into the Skia viewer (Phase 3.3).
- `useFrameSequence` + multi-frame buffer slicing — cine playback on a single extracted pixel file (Phase 3.4).

### Added — Phase 4: Measurement & annotation

- `MeasurementOverlay` + `useMeasurementsReducer` + linear / angle / ROI tools (Phase 4.1).
- Bidirectional + Cobb measurements + DICOM Basic Text SR export (`exportBasicTextSr`) (Phase 4.2).

### Added — Phase 5: MPR

- `buildVolumeFromDicoms` + `extractMprSlice` — orthogonal axial / sagittal / coronal reformats (Phase 5.1).
- Compressed-series + non-uniform Z resample at build time (Phase 5.2).
- `extractObliqueSlice` + `useObliqueController` — slicing along an arbitrary Euler-rotated plane (Phase 5.3).

### Added — Phase 6: Slab + Volume rendering

- `extractProjectionSlab` — MIP / MinIP / Average (Phase 6.1).
- `extractVolumeRender` with piecewise-linear transfer function, four bundled TF presets, RGBA8 output through the Skia viewer (Phase 6.2).
- `ClipPlane[]` half-space clipping during ray composition (Phase 6.3).
- Phong shading from central-difference gradients; lighting gated by gradient magnitude so flat regions stay TF-pure (Phase 6.4).
- `VolumeRenderPreset` bundles (CT bone / angio, MR brain, gray 8-bit) + `useVolumeRenderController` (Phase 6.5).

### Added — Phase 7: Comparison & fusion

- `useSyncedViewerGroup` — N viewer slots with per-axis sync (W/L, transform, frame) (Phase 7.1).
- `DicomFusionViewSkia` + colormap LUTs (`hot`, `jet`, `gray`) — two grayscale buffers composited in one SkSL pass (Phase 7.2).
- `DicomSegmentationOverlay` — label-map overlay with a per-segment RGBA palette (Phase 7.3).
- `DicomRtStructOverlay` — polyline contour overlay (RTSTRUCT-style) with optional fill (Phase 7.4).

### Added — Phase 8: Performance & workflow

- `PixelDataCache` LRU + `cachedExtractPixelDataToFile` wrapper (Phase 8.1).
- `SeriesPrefetcher` + `useSeriesPrefetch` with window-around-current priority (Phase 8.2).
- `useHangingProtocol` + four bundled layouts (single, CT 2-up, prior/current, PET-CT fusion) (Phase 8.3).
- `anonymizeDataset` / `anonymizeDicomFile` per DICOM PS3.15 §E.1 Basic Application Confidentiality Profile, with deterministic `UidRemapper` (Phase 8.4).

### Added — Phase 9: V&V + integration docs

- `scripts/collect-vv-evidence.mjs` — dated, content-addressed V&V evidence bundles with SHA-256 file hashes and parsed jest stats (Phase 9.1).
- Coverage HTML + `coverage-summary.json` inside each bundle; schema bumped to `vv-evidence/2` (Phase 9.2).
- Frozen synthetic-gradient pixel regression fixture under `src/__fixtures__/` (Phase 9.3).
- Customer-facing integration guide — `docs/integration/getting-started.md` + `docs/integration/api-overview.md` (Phase 9.4).

### Known limitations

- Pixel-data burnt-in PHI scrubbing (OCR / image inspection) is not implemented — `anonymizeDataset` covers tag-level PHI only. (Tracked for a future minor release.)
- The Skia and gesture-handler peers are optional but TypeScript declares them as `peerDependencies`; consumers that never import the Skia viewer still need to install the peer or use `peerDependenciesMeta.optional` in their app's package manifest. (See [`docs/integration/getting-started.md`](docs/integration/getting-started.md).)
- DIMSE (C-FIND / C-MOVE / C-STORE) is out of scope; DICOMweb only.

### Regulatory

- IEC 62304 process artefacts complete and in-tree under [`docs/regulatory/`](docs/regulatory/).
- V&V evidence bundle [`2026-05-16-dc8bd57`](docs/regulatory/vv-evidence/) attached: 24 suites / 256 tests, coverage 61.0% statements / 55.3% branches / 55.6% functions / 62.2% lines.
- One open anomaly (`A-002`, jest-worker SIGSEGV intermittent under coverage, tooling-only); no open class-B or class-C anomalies.

## [0.1.0] — pre-1.0 prototypes

Eleven phases of build-up; see git history for the per-commit narrative. Phase 0 (process foundation) committed on 2026-04-26; Phase 9 closed on 2026-05-15.
