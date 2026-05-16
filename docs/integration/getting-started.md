# Getting Started

This guide takes an integrator from `npm install` to a rendered DICOM slice on iOS and Android. It assumes a React Native ≥ 0.85 app with the new architecture enabled (TurboModules + Fabric).

## 1. Install

```sh
npm install @viveksah/vibe-native-dicom
```

### Required peer dependencies

| Peer | Why | Install |
| --- | --- | --- |
| `react-native` ≥ 0.85 | TurboModule host | already in your app |
| `@shopify/react-native-skia` ≥ 2.0 | GPU viewer (W/L shader, fusion, SEG, RT) | `npm install @shopify/react-native-skia` |
| `react-native-gesture-handler` ≥ 2.20 | pan / pinch / rotate gestures | `npm install react-native-gesture-handler` |

The Skia and gesture-handler peers are only loaded when you import the components that depend on them — a consumer using only the parsing API never pays the install cost. Static analysis can't tell, though, so add them as direct dependencies even if you only use them transitively.

### Native install

- **iOS:** `cd ios && pod install`. The podspec autolinks GDCM (vendored as an XCFramework) plus the C++ bridge.
- **Android:** no manual steps. The library's gradle module is autolinked from `node_modules`. The first build compiles the JNI shared object (libVibeNativeDicom.so) once and caches it.

### Minimum host requirements

- iOS 15.1 simulator / device. Tested against Xcode 26.x.
- Android NDK `27.1.12297006` (pinned in the library's `android/build.gradle`). Newer NDKs may work; older ones haven't been tested.
- Hermes recommended (not required).

### Permissions

The library does not declare any iOS / Android runtime permissions itself. Your app's permissions cover whatever sandbox the DICOM files come from (Documents directory, app group, file picker URL, network for DICOMweb, etc.).

## 2. Render your first slice

```ts
import {
  // Phase 2.x — parse + extract pixel data
  readDicom,
  extractPixelDataToFile,
  // Phase 3.2 — GPU viewer
  DicomImageViewSkia,
} from '@viveksah/vibe-native-dicom';

function MyViewer({ dicomPath, outPath }: { dicomPath: string; outPath: string }) {
  const file = readDicom(dicomPath);
  const info = extractPixelDataToFile(dicomPath, outPath);
  if (!info.hasPixelData) return null;

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
}
```

`extractPixelDataToFile` writes decoded pixel bytes to disk in a single bridge call. `DicomImageViewSkia` reads the file on the native side, uploads it to a GPU texture once, and re-applies window/level via an SkSL shader — slider drag stays interactive on 512×512 CT slices.

## 3. Wiring gestures (optional)

`<GestureHandlerRootView>` must wrap the React tree above any viewer that uses gestures (pinch / pan / rotate):

```ts
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MyViewer ... />
    </GestureHandlerRootView>
  );
}
```

## 4. Capability map by phase

The library exposes capabilities in layered phases. Each phase ships:

- a public TypeScript surface,
- an example-app panel demonstrating it end-to-end,
- a regression test (where the behaviour is JS-testable), and
- a V&V evidence row in [`docs/regulatory/`](../regulatory/).

| Phase | Capability | Entry point |
| --- | --- | --- |
| 2.x | Parse, transfer syntaxes, DICOMweb, pixel data | `readDicom`, `extractPixelDataToFile`, `DicomWebClient` |
| 3.x | JS PNG viewer, Skia W/L, gestures, cine | `DicomImageView`, `DicomImageViewSkia`, `useFrameSequence` |
| 4.x | Measurement / annotation tools, SR export | `MeasurementOverlay`, `useMeasurementsReducer`, `exportBasicTextSr` |
| 5.x | Volume build, orthogonal + oblique MPR | `buildVolumeFromDicoms`, `extractMprSlice`, `extractObliqueSlice` |
| 6.x | Slab projection, transfer functions, volume render, Phong, presets | `extractProjectionSlab`, `extractVolumeRender`, `useVolumeRenderController` |
| 7.x | Synced viewers, fusion overlay, SEG / RT overlays | `useSyncedViewerGroup`, `DicomFusionViewSkia`, `DicomSegmentationOverlay`, `DicomRtStructOverlay` |
| 8.x | LRU cache, prefetch, hanging protocols, anonymization | `PixelDataCache`, `useSeriesPrefetch`, `useHangingProtocol`, `anonymizeDicomFile` |
| 9.x | V&V evidence collector | `scripts/collect-vv-evidence.mjs` |

See [`api-overview.md`](api-overview.md) for the full export catalogue and which file each lives in.

## 5. Where to read next

- [`api-overview.md`](api-overview.md) — every public export at a glance.
- [`../regulatory/vv-evidence-collection.md`](../regulatory/vv-evidence-collection.md) — how to produce a V&V bundle for your submission.
- [`../PLAN.md`](../PLAN.md) — phase roadmap (where 1.0 sits on the trajectory).
- [`../regulatory/conformance-statement.md`](../regulatory/conformance-statement.md) — DICOM conformance scope.

## 6. Reporting issues

- **Anomalies** (regulatory significance) → file a GitHub issue tagged `anomaly`. We propagate it into [`docs/regulatory/anomaly-list.md`](../regulatory/anomaly-list.md) with a severity / probability classification per `14971-risk-management.md`.
- **Bug reports** without regulatory impact → standard GitHub issue.
- **Vulnerability disclosure** → `octohealth.frontend@proton.me`. Do NOT file public issues for security-impacting bugs.
