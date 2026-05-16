# @viveksah/vibe-native-dicom

Diagnostic-grade DICOM SDK for React Native — parsing, GPU-accelerated viewing, MPR, volume rendering, fusion overlays, segmentation, and the workflow primitives (cache, prefetch, hanging protocols, anonymization) that a clinical viewer needs around them.

Targets iOS and Android via TurboModules + Fabric, with C++ image decoding through a vendored GDCM 3.2.5 and Skia for GPU rendering.

```sh
npm install @viveksah/vibe-native-dicom @shopify/react-native-skia react-native-gesture-handler
```

Requires React Native ≥ 0.85 with the new architecture enabled. See [`docs/integration/getting-started.md`](docs/integration/getting-started.md) for host requirements (iOS 15.1, Xcode 26.x, Android NDK 27.1) and the first-slice round-trip.

## At a glance

```ts
import {
  readDicom,
  extractPixelDataToFile,
  DicomImageViewSkia,
} from '@viveksah/vibe-native-dicom';

const file = readDicom(dicomPath);
const info = extractPixelDataToFile(dicomPath, outPath);

return (
  <DicomImageViewSkia
    filePath={info.filePath}
    rows={info.rows}
    columns={info.columns}
    bitsAllocated={info.bitsAllocated}
    pixelRepresentation={file.image?.pixelRepresentation}
    photometricInterpretation={info.photometricInterpretation}
    windowCenter={128}
    windowWidth={256}
    width={512}
    height={512}
  />
);
```

## Capabilities

- **Parse** — every common transfer syntax (Implicit/Explicit VR LE, JPEG, JPEG-Lossless, JPEG-LS, JPEG 2000, RLE), SQ traversal, ergonomic per-tag helpers.
- **DICOMweb** — QIDO-RS, WADO-RS, STOW-RS client.
- **2D viewer** — JS PNG path + Skia GPU path with SkSL window/level shader, pinch/pan/rotate gestures, multi-frame cine.
- **Measurement & SR** — linear, angle, ROI, bidirectional, Cobb; export to DICOM Basic Text SR.
- **MPR** — orthogonal axial/sagittal/coronal + oblique reformats; compressed series + non-uniform Z handled at build time.
- **Slab + volume rendering** — MIP / MinIP / Average; full ray-cast with piecewise-linear TF, clip planes, Phong shading; bundled modality presets (CT bone, CT angio, MR brain).
- **Comparison & fusion** — synced side-by-side viewers, fusion overlay with colormap LUTs (`hot`, `jet`, `gray`), segmentation label-map overlay, RTSTRUCT polyline overlay.
- **Performance & workflow** — LRU pixel-data cache, series prefetcher with window-around-current priority, hanging-protocol layout engine, PS3.15 anonymization.

Every capability has an example-app panel under [`example/src/App.tsx`](example/src/App.tsx).

## Documentation

- [`docs/integration/getting-started.md`](docs/integration/getting-started.md) — install, peer deps, the first slice end-to-end.
- [`docs/integration/api-overview.md`](docs/integration/api-overview.md) — every public export grouped by phase.
- [`docs/PLAN.md`](docs/PLAN.md) — phase roadmap.
- [`docs/regulatory/`](docs/regulatory/) — IEC 62304 + ISO 14971 + DICOM conformance artefacts.
- [`docs/regulatory/vv-evidence-collection.md`](docs/regulatory/vv-evidence-collection.md) — how to produce a V&V evidence bundle for your submission.
- [`CHANGELOG.md`](CHANGELOG.md) — per-release notes.

## Status

**1.0.0** — first production release. See [`CHANGELOG.md`](CHANGELOG.md) for what shipped and [`docs/regulatory/conformance-statement.md`](docs/regulatory/conformance-statement.md) for the DICOM conformance scope.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT
