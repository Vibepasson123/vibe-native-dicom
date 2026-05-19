# Using `@vibepasson/vibe-native-dicom`

A detailed, end-to-end guide. Builds a fresh React Native app, installs the package, and walks every published capability with copy-paste examples.

If you just want the 30-second version → [`docs/integration/getting-started.md`](docs/integration/getting-started.md). If you want the full export catalogue → [`docs/integration/api-overview.md`](docs/integration/api-overview.md). If you want the everything-explained version with a working test app, you're in the right place.

---

## Table of contents

1. [What this package is](#1-what-this-package-is)
2. [Host requirements](#2-host-requirements)
3. [Create a fresh test app](#3-create-a-fresh-test-app)
4. [Install the package](#4-install-the-package)
5. [Native install (iOS + Android)](#5-native-install-ios--android)
6. [The first slice](#6-the-first-slice)
7. [Mental model](#7-mental-model)
8. [Capability tour](#8-capability-tour)
9. [Loading real DICOMs](#9-loading-real-dicoms)
10. [Troubleshooting](#10-troubleshooting)
11. [Performance + memory budgets](#11-performance--memory-budgets)
12. [What to read next](#12-what-to-read-next)

---

## 1. What this package is

A diagnostic-grade DICOM SDK for React Native. It does three things across iOS and Android:

1. **Parse DICOM files** — every common transfer syntax (Implicit/Explicit VR LE, JPEG Baseline/Extended/Lossless/LS, JPEG 2000, RLE), SQ traversal, ergonomic per-tag helpers, DICOMweb client (QIDO/WADO/STOW).
2. **Render DICOM on screen** — a JS PNG-encoding viewer for simple cases, plus a Skia GPU viewer with an SkSL window/level shader, pinch/pan/rotate gestures, multi-frame cine, MPR (orthogonal + oblique), slab projection (MIP / MinIP / Average), full ray-cast volume rendering with transfer functions + Phong shading + clip planes, fusion overlays with colour LUTs, segmentation label-map overlays, and RTSTRUCT contour overlays.
3. **Power clinical workflow** — LRU pixel-data cache, series prefetcher, hanging-protocol layout engine, PS3.15 DICOM anonymization.

Architecture: TurboModule + Fabric (new architecture only). C++ decoding via vendored **GDCM 3.2.5**; iOS pulls it as an XCFramework, Android compiles it once via NDK. GPU rendering through **Skia** (optional peer dep).

---

## 2. Host requirements

| Host | Minimum |
|---|---|
| React Native | 0.85 with new architecture enabled |
| iOS | 15.1 simulator / device |
| Xcode | 26.x (recommended) |
| Android API | 24+ (matches RN 0.85) |
| Android NDK | **`27.1.12297006`** (pinned by the library's `android/build.gradle`) |
| Node | 20+ for the dev toolchain |

**About the NDK pin.** The library builds GDCM through your local NDK on the first Android build. If the version differs from `27.1.12297006`, you'll get a Gradle error pointing at "NDK at … not found". Install via Android Studio → SDK Manager → SDK Tools → tick "Show package details" → NDK (Side by side) → check `27.1.12297006`. You can keep newer NDKs installed alongside; the library picks the pinned one explicitly.

**About the new architecture.** TurboModules and Fabric are the new bridge primitives. They're the default in RN 0.85's community CLI. If your project was scaffolded with an older CLI and is still on the old bridge, this library won't load — the TurboModule registry won't find `VibeNativeDicom` and you'll get a runtime `Invariant Violation`. Flip the flag in `android/gradle.properties` (`newArchEnabled=true`) and the iOS Podfile (`ENV['RCT_NEW_ARCH_ENABLED'] = '1'`).

---

## 3. Create a fresh test app

```sh
cd ~
npx @react-native-community/cli@latest init DicomTestApp
cd DicomTestApp
```

Pick **TypeScript** when prompted. The CLI takes 3–5 min to scaffold (it pulls all of React Native's dependencies).

**Why this CLI specifically.** The official `@react-native-community/cli` initialises with the new architecture flag on. Expo's bare workflow and the old `react-native-cli` need extra configuration to enable the new arch; the community CLI is the path of least resistance for a TurboModule consumer.

Sanity check that the empty app builds before you add anything:

```sh
# iOS
cd ios && pod install && cd ..
npx react-native run-ios

# Android (start an emulator first via Android Studio → Device Manager)
npx react-native run-android
```

A "Welcome to React Native" screen should appear. If it doesn't, fix that first — adding the SDK on top of a broken RN app is a bad debugging experience.

---

## 4. Install the package

From the test app's root:

```sh
npm install @vibepasson/vibe-native-dicom \
            @shopify/react-native-skia \
            react-native-gesture-handler
```

The two peer dependencies (Skia + gesture-handler) are required when you use the viewer components. If you're only parsing DICOMs (no UI), you can omit them — every parsing function lives in pure JS and TypeScript.

| Peer | Optional? | Required for |
|---|---|---|
| `react-native` ≥ 0.85 | no (your app already has it) | everything |
| `@shopify/react-native-skia` ≥ 2.0 | yes — only if you import a `*ViewSkia` component or any overlay | `DicomImageViewSkia`, `DicomFusionViewSkia`, `DicomSegmentationOverlay`, `DicomRtStructOverlay`, `MeasurementOverlay` |
| `react-native-gesture-handler` ≥ 2.20 | yes — only if you wire gestures | `useViewerGestures` (and `DicomImageViewSkia` with `enableGestures=true`, which is the default) |

The library uses `peerDependenciesMeta.optional` for both — npm will warn but not fail if you skip them.

---

## 5. Native install (iOS + Android)

### iOS

```sh
cd ios
pod install
cd ..
```

What this does:

- Pulls the vendored **GDCM XCFramework** from the package's `VibeNativeDicom.podspec`.
- Adds the C++ bridge sources from `cpp/` and Obj-C++ wrappers from `ios/`.
- Wires `@shopify/react-native-skia`'s pod.

First run takes ~30s; subsequent installs use CocoaPods' cache.

### Android

No manual step. The library's gradle module is autolinked from `node_modules` by the standard RN autolinker. The first build:

1. Triggers `:viveksah_vibe-native-dicom:configureCMakeDebug` per ABI.
2. Builds `libVibeNativeDicom.so` for `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`.
3. Packages them into the APK.

A cold first build is ~3 min (CMake configure + GDCM compile). After that it's incremental and ~10s.

If the build complains about the NDK path, see §2.

---

## 6. The first slice

Replace `App.tsx` with this complete, runnable example:

```tsx
import React, { useEffect, useState } from 'react';
import { Platform, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import {
  writeSyntheticDicom,
  readDicom,
  extractPixelDataToFile,
  DicomImageViewSkia,
  TransferSyntaxUID,
  type PixelDataInfo,
  type DicomFile,
} from '@vibepasson/vibe-native-dicom';

function DicomDemo() {
  const [file, setFile] = useState<DicomFile | null>(null);
  const [pixels, setPixels] = useState<PixelDataInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [wc, setWc] = useState(128);
  const [ww, setWw] = useState(256);

  useEffect(() => {
    try {
      // 1. Synthesise a 16×16 DICOM in the OS temp dir (Implicit VR LE).
      const dicomPath = writeSyntheticDicom(
        TransferSyntaxUID.ImplicitVRLittleEndian
      );

      // 2. Parse the header → DicomFile (transfer syntax, UIDs, dataset, image).
      const parsed = readDicom(dicomPath);
      setFile(parsed);

      // 3. Decode pixel bytes to a sidecar file the viewer can read fast.
      const outPath = dicomPath.replace(/\.dcm$/, '.pixels');
      const info = extractPixelDataToFile(dicomPath, outPath);
      if (info.hasPixelData) setPixels(info);
      else setErr('No pixel data (unsupported transfer syntax?)');
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.body}>
        <Text style={styles.title}>@vibepasson/vibe-native-dicom demo</Text>

        <Text style={styles.label}>Platform</Text>
        <Text style={styles.value}>{Platform.OS}</Text>

        <Text style={styles.label}>Parsed</Text>
        <Text style={styles.value}>
          {file
            ? `${file.transferSyntaxUID} · ${file.image?.rows}×${file.image?.columns} ${file.image?.bitsAllocated}-bit`
            : '…'}
        </Text>

        {err && <Text style={styles.err}>FAIL · {err}</Text>}

        {pixels && (
          <View style={styles.viewer}>
            <DicomImageViewSkia
              filePath={pixels.filePath}
              rows={pixels.rows}
              columns={pixels.columns}
              bitsAllocated={pixels.bitsAllocated}
              photometricInterpretation={pixels.photometricInterpretation}
              windowCenter={wc}
              windowWidth={ww}
              width={256}
              height={256}
            />
          </View>
        )}

        <Text style={styles.label}>W/L (tap to step)</Text>
        <View style={styles.row}>
          <Text style={styles.btn} onPress={() => setWc(Math.max(0, wc - 16))}>WC −</Text>
          <Text style={styles.numeric}>WC {wc}</Text>
          <Text style={styles.btn} onPress={() => setWc(wc + 16)}>WC +</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.btn} onPress={() => setWw(Math.max(16, ww - 16))}>WW −</Text>
          <Text style={styles.numeric}>WW {ww}</Text>
          <Text style={styles.btn} onPress={() => setWw(ww + 16)}>WW +</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DicomDemo />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  body: { padding: 20, gap: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 12, color: '#666', marginTop: 10 },
  value: { fontSize: 16 },
  err: { color: 'crimson', marginTop: 8 },
  viewer: {
    width: 256, height: 256, marginTop: 8,
    borderWidth: 1, borderColor: '#ccc', alignSelf: 'flex-start',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  btn: { fontSize: 22, color: '#0a66c2', paddingHorizontal: 16 },
  numeric: { fontVariant: ['tabular-nums'], minWidth: 90 },
});
```

Then run it:

```sh
npx react-native run-ios     # or run-android
```

You should see:

- A `Parsed` line confirming `1.2.840.10008.1.2 · 16×16 8-bit`.
- A 256×256 grayscale image (the synthetic gradient, upscaled by the GPU).
- WC/WW step buttons that change the look as you tap. **The image data doesn't re-upload** when you tap — only the shader uniforms update.
- Pinch on the image (on a real device, or via Cmd+Click + drag on iOS Simulator) to zoom.

That's the entire viewer stack working: native decode → file-based pixel buffer → GPU texture upload (once) → SkSL shader (per frame) → gesture transform.

---

## 7. Mental model

The library is layered. Each layer has a *single* job and stays out of the layers above it:

```
┌─────────────────────────────────────────────────────────┐
│  React components + hooks (DicomImageViewSkia, etc.)    │  ← viewer / overlays / controllers
│  Pure TS                                                │
├─────────────────────────────────────────────────────────┤
│  Pixel-data extraction + cache + prefetch + anonymize   │  ← workflow / performance
│  Pure TS + 1 native call (extractPixelDataToFile)       │
├─────────────────────────────────────────────────────────┤
│  TurboModule bridge (NativeVibeNativeDicom)             │  ← single bridge surface
│  JS ↔ ObjC++/Kotlin                                     │
├─────────────────────────────────────────────────────────┤
│  C++ wrappers (cpp/dicom_*.{cpp,h})                     │  ← bridge into GDCM
│  Volume math, oblique reformat, ray casting, anonymize  │
├─────────────────────────────────────────────────────────┤
│  GDCM 3.2.5 (vendored)                                  │  ← parses + decodes DICOM
└─────────────────────────────────────────────────────────┘
```

Three load-bearing design decisions:

1. **Pixel bytes never cross the JS bridge as base64.** Native decoding writes them to a disk file (`extractPixelDataToFile`). The viewer then reads that file via a native helper into a Skia texture in one shot. This skips a 33% bridge-bloat tax and a 75% CPU tax compared to encoding pixels as a base64 string.

2. **Window/level lives in a fragment shader, not in the buffer.** The viewer uploads pixel bytes to a GPU texture *once* and changes W/L by updating shader uniforms. Slider drag stays interactive on 512×512 CT slices because there's no per-frame re-encoding.

3. **The cache is metadata-only, on top of disk-resident pixel files.** `PixelDataCache` remembers "we already extracted `dicomPath` to `outPath`" so the next `cachedExtractPixelDataToFile` returns immediately without calling native. The actual pixel bytes live on disk between calls.

---

## 8. Capability tour

Every capability has an isolated example below. Drop any of them into the `DicomDemo` component in §6 and they'll render alongside (or instead of) the first viewer.

### 8.1. Parse and read DICOM

```ts
import { readDicom, getPatientName, getModality, getWindowCenter } from '@vibepasson/vibe-native-dicom';

const file = readDicom('/path/to/study.dcm');
console.log(file.transferSyntaxUID);          // e.g. "1.2.840.10008.1.2.4.70"
console.log(file.image?.rows, file.image?.columns);

// Per-tag helpers
console.log(getPatientName(file.dataset));    // "DOE^JOHN"
console.log(getModality(file.dataset));       // "CT"
console.log(getWindowCenter(file.dataset));   // 40 (or null if absent)
```

The full helper catalogue is in [`src/helpers.ts`](src/helpers.ts) — `getPatientID`, `getStudyDescription`, `getSeriesDescription`, `getPixelSpacing`, `getRescaleSlope`, `getRescaleIntercept`, etc.

For raw access to any tag (including private / non-standard ones), use `file.dataset` directly. Tags are keyed by `"GGGG,EEEE"` hex strings — e.g. `file.dataset['0010,0010']` is patient name.

### 8.2. DICOMweb (QIDO / WADO / STOW)

```ts
import { DicomWebClient } from '@vibepasson/vibe-native-dicom';

const client = new DicomWebClient({
  baseUrl: 'https://your-pacs.example/dicomweb',
  headers: { Authorization: 'Bearer ...' },
});

// QIDO-RS: find studies
const studies = await client.searchStudies({ PatientName: 'DOE^JOHN' });

// WADO-RS: download a study's instances
const instances = await client.retrieveInstances(studies[0].studyUid);

// STOW-RS: upload a new instance
await client.storeInstances([{ path: '/local/path/instance.dcm' }]);
```

### 8.3. Live W/L (already in §6)

`DicomImageViewSkia`'s `windowCenter` and `windowWidth` props are shader uniforms — change them and the GPU re-shades the existing texture. No re-upload.

### 8.4. Pinch / pan / rotate gestures

Already on in §6's example (the default `enableGestures=true`). Wrap the app in `GestureHandlerRootView` (also in §6) and gestures work end-to-end.

### 8.5. Multi-frame cine

```tsx
import { useFrameSequence } from '@vibepasson/vibe-native-dicom';

const cine = useFrameSequence({
  numberOfFrames: pixels.numberOfFrames,
  fps: 8,
  loop: true,
});

return (
  <>
    <DicomImageViewSkia
      filePath={pixels.filePath}
      rows={pixels.rows} columns={pixels.columns}
      bitsAllocated={pixels.bitsAllocated}
      photometricInterpretation={pixels.photometricInterpretation}
      windowCenter={wc} windowWidth={ww}
      width={256} height={256}
      numberOfFrames={pixels.numberOfFrames}
      frameIndex={cine.frameIndex}
    />
    <Text onPress={cine.toggle}>{cine.playing ? 'Pause' : 'Play'}</Text>
  </>
);
```

`useFrameSequence` is pure JS. The viewer only re-uploads when `frameIndex` changes.

### 8.6. Measurement tools (Phase 4)

```tsx
import {
  MeasurementOverlay,
  useMeasurementsReducer,
} from '@vibepasson/vibe-native-dicom';

const measurements = useMeasurementsReducer();

// pick a tool ('linear' | 'angle' | 'roi-rectangle' | 'roi-ellipse' | 'cobb' | 'bidirectional')
measurements.setTool('linear');

return (
  <View style={{ width: 512, height: 512 }}>
    <DicomImageViewSkia
      /* ...same props as §6, plus: */
      enableGestures={false}     /* let the overlay capture taps */
    />
    <MeasurementOverlay
      measurements={measurements.list}
      tool={measurements.tool}
      onAddPoint={measurements.addPoint}
      imageRows={pixels.rows}
      imageColumns={pixels.columns}
      pixelSpacing={pixelSpacing /* [rowMm, colMm] from getPixelSpacing(...) */}
      canvasWidth={512}
      canvasHeight={512}
    />
  </View>
);
```

Export measurements to DICOM Basic Text SR via `exportBasicTextSr(outPath, JSON.stringify(lines), studyUid, seriesUid, sopUid, sopClassUid)`.

### 8.7. MPR (axial / sagittal / coronal)

```ts
import {
  writeSyntheticVolumeSeries,
  buildVolumeFromDicoms,
  extractMprSlice,
  useMprController,
  releaseVolume,
} from '@vibepasson/vibe-native-dicom';

// Build the volume once. For real DICOMs, replace with paths from disk / WADO.
const seriesDir = '/tmp/synth-volume';
const slicePaths = writeSyntheticVolumeSeries(seriesDir, /*nSlices*/ 16, /*spacingMm*/ 1.0);
const volume = buildVolumeFromDicoms(slicePaths);

// In React: useMprController owns the per-plane indices.
const mpr = useMprController(volume);
const axial = extractMprSlice(volume.handle, 'axial', mpr.axialIndex, '/tmp/axial.bin');

// Render with DicomImageViewSkia — same component as 2D.
<DicomImageViewSkia
  filePath={axial.filePath}
  rows={axial.rows} columns={axial.columns}
  bitsAllocated={axial.bitsAllocated}
  windowCenter={128} windowWidth={256}
  width={256} height={256}
/>;

// When the volume is no longer needed (component unmount):
releaseVolume(volume.handle);
```

For oblique slices (any Euler rotation), see `extractObliqueSlice` + `useObliqueController` — same shape but with `(rotX, rotY, rotZ)` instead of plane + index.

### 8.8. Slab projection (MIP / MinIP / Average)

```ts
import { extractProjectionSlab } from '@vibepasson/vibe-native-dicom';

const slab = extractProjectionSlab(
  volume.handle,
  obliqueSpec,           // from useObliqueController(...).spec
  { slabThicknessMm: 20, mode: 'mip' },
  '/tmp/mip.bin'
);
// render with DicomImageViewSkia like any other 2D slice
```

`mode: 'minip'` for airways/lungs; `'average'` for X-ray-like reconstruction.

### 8.9. Volume rendering (Phase 6)

The high-level path:

```tsx
import { useVolumeRenderController, DicomImageViewSkia } from '@vibepasson/vibe-native-dicom';

const vr = useVolumeRenderController(volume, { initialPreset: 'ct-bone-3d' });

<DicomImageViewSkia
  filePath={vr.slice?.filePath ?? ''}
  rows={vr.slice?.rows ?? 0} columns={vr.slice?.columns ?? 0}
  bitsAllocated={8} samplesPerPixel={4}   // RGBA8 output from VR
  photometricInterpretation="MONOCHROME2"
  windowCenter={128} windowWidth={256}    // ignored for samplesPerPixel=4
  width={256} height={256}
  enableGestures={false}
/>;
// Drive it with vr.setPreset('mr-brain-3d'), vr.setRotY(rad), vr.setClipEnabled(true), …
```

The low-level path (pick your own TF + lighting + clip planes):

```ts
import { extractVolumeRender, VOLUME_RENDER_PRESETS } from '@vibepasson/vibe-native-dicom';

const preset = VOLUME_RENDER_PRESETS['ct-angio-3d'];
const out = extractVolumeRender(
  volume.handle,
  obliqueSpec,
  {
    slabThicknessMm: 60,
    transferFunction: preset.transferFunction,
    lighting: preset.lighting,
    clipPlanes: [
      { pointMm: [0, 0, 10], normalMm: [0, 0, 1] },  // keep z ≥ 10
    ],
  },
  '/tmp/vr.bin'
);
// out.samplesPerPixel === 4 (RGBA8); render with DicomImageViewSkia samplesPerPixel={4}
```

### 8.10. Synced side-by-side viewers (Phase 7.1)

```tsx
import { useSyncedViewerGroup } from '@vibepasson/vibe-native-dicom';

const synced = useSyncedViewerGroup({
  count: 2,
  initial: [{ windowCenter: 128, windowWidth: 256 }, { windowCenter: 200, windowWidth: 80 }],
});

return (
  <View style={{ flexDirection: 'row', gap: 8 }}>
    {synced.slots.map((slot, i) => (
      <DicomImageViewSkia
        key={i}
        filePath={pixels.filePath} rows={pixels.rows} columns={pixels.columns}
        bitsAllocated={pixels.bitsAllocated}
        photometricInterpretation={pixels.photometricInterpretation}
        windowCenter={slot.windowCenter}
        windowWidth={slot.windowWidth}
        onTransformChange={slot.onTransformChange}
        width={160} height={160}
      />
    ))}
    {/* tap to break a sync axis */}
    <Text onPress={() => synced.setAxes({ ...synced.axes, wl: !synced.axes.wl })}>
      WL {synced.axes.wl ? 'SYNC' : 'INDEP'}
    </Text>
  </View>
);
```

### 8.11. Fusion overlay (Phase 7.2)

```tsx
import { DicomFusionViewSkia } from '@vibepasson/vibe-native-dicom';

<DicomFusionViewSkia
  base={{
    filePath: ctPixels.filePath, rows: ctPixels.rows, columns: ctPixels.columns,
    bitsAllocated: ctPixels.bitsAllocated,
    windowCenter: 40, windowWidth: 400,
  }}
  overlay={{
    filePath: petPixels.filePath, rows: petPixels.rows, columns: petPixels.columns,
    bitsAllocated: petPixels.bitsAllocated,
    windowCenter: 200, windowWidth: 80,
  }}
  overlayOpacity={0.5}
  overlayColormap="hot"   // or "jet" / "gray"
  width={256} height={256}
/>;
```

### 8.12. Segmentation overlay (Phase 7.3)

```tsx
import { DicomSegmentationOverlay, makeSyntheticDiscLabelMap } from '@vibepasson/vibe-native-dicom';

// The label-map is a Uint8Array of rows*columns bytes; pixel value = segment ID, 0 = background.
const labelMap = makeSyntheticDiscLabelMap(pixels.rows, pixels.columns, /*id*/1, /*radiusFrac*/0.3);

<DicomSegmentationOverlay
  base={{ ...baseChannel /* same shape as fusion's base */ }}
  labelMap={labelMap}
  segments={[
    { id: 1, label: 'lesion', r: 1, g: 0.2, b: 0.2, opacity: 1 },
    { id: 2, label: 'liver',  r: 0.3, g: 0.7, b: 1, opacity: 0.8 },
  ]}
  overlayOpacity={0.5}
  width={256} height={256}
/>;
```

In production, replace `makeSyntheticDiscLabelMap(...)` with bytes from your SEG decoder or AI model.

### 8.13. RTSTRUCT overlay (Phase 7.4)

```tsx
import { DicomRtStructOverlay, makeSyntheticCircleContour } from '@vibepasson/vibe-native-dicom';

const structures = [
  {
    id: 1, label: 'GTV', r: 1, g: 0.85, b: 0.2,
    strokeWidth: 2,
    contours: [makeSyntheticCircleContour(pixels.columns / 2, pixels.rows / 2, 30, 64)],
  },
];

<DicomRtStructOverlay
  filePath={pixels.filePath} rows={pixels.rows} columns={pixels.columns}
  bitsAllocated={pixels.bitsAllocated}
  windowCenter={128} windowWidth={256}
  structures={structures}
  overlayOpacity={0.9}
  fill={false}
  width={256} height={256}
/>;
```

### 8.14. LRU pixel cache (Phase 8.1)

```ts
import { cachedExtractPixelDataToFile, sharedPixelDataCache } from '@vibepasson/vibe-native-dicom';

// Drop-in for extractPixelDataToFile. First call hits native;
// subsequent calls with the same (dicomPath, outPath) are cache hits.
const info = cachedExtractPixelDataToFile(dicomPath, outPath);

console.log(sharedPixelDataCache.stats());
// { size: 1, bytes: 256, hits: 0, misses: 1, evictions: 0 }
```

Default cache budget: 256 MiB / 512 entries. Tune with `new PixelDataCache({ maxBytes: 1<<30, maxEntries: 1024 })`.

### 8.15. Series prefetch (Phase 8.2)

```ts
import { useSeriesPrefetch } from '@vibepasson/vibe-native-dicom';

const items = slicePaths.map((p, i) => ({
  dicomPath: p,
  outPath: `/tmp/slice-${i}.pixels`,
}));

const prefetch = useSeriesPrefetch(items, currentSliceIndex);
// Items closest to currentSliceIndex are decoded first.
// prefetch.stats.completed climbs over time; the next `cachedExtractPixelDataToFile`
// call hits cache for any decoded slice.
```

### 8.16. Hanging protocols (Phase 8.3)

```ts
import { useHangingProtocol, sortStudiesByDate } from '@vibepasson/vibe-native-dicom';

const studies = sortStudiesByDate([
  { id: 'ct-prior',   modality: 'CT', studyDate: '20200101' },
  { id: 'ct-current', modality: 'CT', studyDate: '20260101' },
  { id: 'pet',        modality: 'PT', studyDate: '20260101' },
]);

const hp = useHangingProtocol(studies, { initialProtocol: 'prior-current' });
// hp.applied.assignments → [{ slot, study }, ...] indexed by hp.protocol.layout.{rows, cols}
// hp.setProtocolName('pet-ct-fusion') to switch.
```

### 8.17. Anonymization (Phase 8.4)

```ts
import { anonymizeDicomFile, UidRemapper } from '@vibepasson/vibe-native-dicom';

const remapper = new UidRemapper();
const anon = anonymizeDicomFile(file, { uidRemapper: remapper, keepDescriptions: false });
// anon.dataset['0010,0010'].value === 'Anonymous'
// anon.dataset['0010,0020'].value === 'ANON-001'
// anon.sopInstanceUID is a fresh 2.25.* UID; same remapper keeps cross-references consistent.
```

---

## 9. Loading real DICOMs

The walkthrough uses `writeSyntheticDicom` to avoid asking you to source test data. For real images:

1. **Local bundled file.** Drop the `.dcm` into `ios/DicomTestApp/` (Xcode → Add Files → Copy to bundle resources) and `android/app/src/main/assets/`. Read the platform path at runtime:

   ```ts
   import RNFS from 'react-native-fs';   // optional dep — `npm install react-native-fs`
   const dicomPath = Platform.OS === 'ios'
     ? `${RNFS.MainBundlePath}/MyScan.dcm`
     : await RNFS.getAssetsFileList(...);
   ```

2. **File picker.** With `react-native-document-picker`:

   ```ts
   import DocumentPicker from 'react-native-document-picker';
   const [res] = await DocumentPicker.pick({ type: ['public.data'] });
   const dicomPath = res.fileCopyUri ?? res.uri;
   ```

3. **DICOMweb (network).** Use the built-in `DicomWebClient` (§8.2) to retrieve instances, then `extractPixelDataToFile` on the saved path.

Once you have a path, the rest of the code in §6 / §8 is identical.

### Test fixtures

Public-domain DICOM test images:
- **NEMA / DICOM samples** — [https://dicomlibrary.com/](https://dicomlibrary.com/)
- **Stanford AIMI** — [https://aimi.stanford.edu/shared-datasets](https://aimi.stanford.edu/shared-datasets)
- **The Cancer Imaging Archive (TCIA)** — [https://www.cancerimagingarchive.net/](https://www.cancerimagingarchive.net/)

---

## 10. Troubleshooting

### Build-time

| Symptom | Cause | Fix |
|---|---|---|
| iOS: `'gdcm/foo.h' file not found` | Pod install didn't pull GDCM | `cd ios && pod deintegrate && pod install` |
| iOS: `module 'VibeNativeDicomSpec' not found` | Codegen didn't run | `cd ios && pod install` rebuilds the codegen module |
| Android: `NDK at … did not have a source.properties file` | Pinned NDK not installed | Install NDK `27.1.12297006` via Android Studio SDK Manager (see §2) |
| Android: duplicate `react_codegen_VibeNativeDicomSpec` target | `react.root` misconfig in your app's `android/app/build.gradle` | Confirm `react.root = file("../..")` points at your project root, not the package root |
| Android first build is slow (~3 min) | CMake compiling GDCM | Expected. Subsequent builds use the build cache. |

### Run-time

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module '@vibepasson/vibe-native-dicom'` | RN cache stale after install | `npx react-native start --reset-cache`; rebuild app |
| `Invariant Violation: TurboModuleRegistry.getEnforcing('VibeNativeDicom') could not be found` | New architecture off | Enable: `newArchEnabled=true` in `android/gradle.properties`, `RCT_NEW_ARCH_ENABLED=1` in iOS Podfile, then full rebuild |
| Viewer renders all-black | Wrong `pixelRepresentation` for signed 16-bit data | Pass `pixelRepresentation: file.image.pixelRepresentation` to the viewer |
| Viewer renders inverted | MONOCHROME1 image | Pass `photometricInterpretation: 'MONOCHROME1'` from the parsed `DicomImage` |
| `extractPixelDataToFile` returns `hasPixelData: false` | Unsupported transfer syntax (e.g. MPEG2) | Check with `isSupportedTransferSyntax(uid)`. Hazard H-021: the library refuses to substitute undefined bytes. |
| Pinch/zoom doesn't work | App not wrapped in `GestureHandlerRootView` | Wrap as in §6 |

### Diagnostic logging

The library does not log to console by default (hazard H-010: no PHI in logs). To inspect, capture return values:

```ts
const info = extractPixelDataToFile(...);
console.log('extracted', { rows: info.rows, bytes: info.byteLength, has: info.hasPixelData });
```

Avoid logging `file.dataset` directly — that contains parsed tag values, some of which are PHI.

---

## 11. Performance + memory budgets

| Operation | Cost | Notes |
|---|---|---|
| `readDicom(path)` | 5–20 ms typical | Pure parse; no pixel decode. |
| `extractPixelDataToFile(in, out)` | 20–500 ms | Dominated by transfer-syntax decode (RLE / JPEG-LS fast; JPEG 2000 slow). |
| `cachedExtractPixelDataToFile` (hit) | <1 ms | Map lookup. |
| First `DicomImageViewSkia` mount | ~30 ms upload | Bytes → GPU texture, once. |
| Subsequent W/L change | <1 ms | Shader uniform change; no upload. |
| `buildVolumeFromDicoms` (200 slices) | 1–3 s | One-shot; volume handle reused. |
| `extractMprSlice` | 5–20 ms | Pure C++ resample. |
| `extractObliqueSlice` | 20–50 ms | Trilinear sampling at each output pixel. |
| `extractVolumeRender` (full ray cast) | 200–800 ms per frame | Slow path; cache result via `useVolumeRenderController`. |

Memory budgets:

- **Pixel-data cache:** default 256 MiB; one 512×512×16-bit slice is ~512 KiB so a 200-slice CT fills 100 MiB.
- **Volume in native memory:** released via `releaseVolume(handle)` — call it on component unmount.
- **Skia textures:** managed by Skia; you don't allocate them directly.

For high-throughput cine (>15 fps on a 200-slice CT), use `useSeriesPrefetch` with `concurrency: 2` and the cache budget bumped to 512 MiB.

---

## 12. What to read next

- [`docs/integration/api-overview.md`](docs/integration/api-overview.md) — exhaustive export catalogue with source-file pointers.
- [`docs/regulatory/conformance-statement.md`](docs/regulatory/conformance-statement.md) — DICOM conformance scope (SOP classes, transfer syntaxes).
- [`docs/regulatory/vv-evidence-collection.md`](docs/regulatory/vv-evidence-collection.md) — how to produce a V&V bundle for a regulatory submission.
- [`CHANGELOG.md`](CHANGELOG.md) — what's new each release.
- [`example/src/App.tsx`](example/src/App.tsx) (in the repo, not the npm install) — the canonical reference app exercising every capability above.

---

## Reporting issues

- **Bugs without regulatory impact** → standard GitHub issue at https://github.com/Vibepasson123/vibe-native-dicom/issues.
- **Anomalies** (regulatory significance) → file a GitHub issue tagged `anomaly`. The maintainer propagates it into `docs/regulatory/anomaly-list.md` with severity / probability per ISO 14971.
- **Vulnerabilities** → email `octohealth.frontend@proton.me`. Do NOT file public issues for security-impacting bugs.

---

*Generated for v1.0.0. Future versions may add capabilities and reorganise sections; the canonical reference is always the repo at HEAD.*
