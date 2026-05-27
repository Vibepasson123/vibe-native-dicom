# How to use `@vibepasson/vibe-native-dicom`

A step-by-step guide for adding the DICOM SDK to your React Native app.

---

## What you'll build

By the end of this guide, your app will:

1. Create a DICOM file in memory.
2. Parse it and read its tags.
3. Render the medical image on screen with live window/level controls.
4. Support pinch-to-zoom and pan gestures.

After the basic example works, the guide shows you every feature: volume rendering, MPR, fusion overlays, segmentation, measurements, and more.

---

## Before you start

You need:

- A **React Native 0.85 or newer** project, with the **new architecture** enabled (TurboModules + Fabric).
- **iOS**: a Mac with **Xcode 26**, targeting iOS 15.1 or later.
- **Android**: NDK version **`27.1.12297006`** installed. Install via Android Studio → SDK Manager → SDK Tools → tick "Show package details" → NDK (Side by side) → check `27.1.12297006`.
- **Node.js 20 or newer**.

If you don't have a React Native app yet, create one:

```sh
npx @react-native-community/cli@latest init MyDicomApp
cd MyDicomApp
```

This sets up RN 0.85 with the new architecture on. The official community CLI is what you want — older CLIs and Expo's bare workflow need extra configuration.

---

## Step 1 — Install

From your app's root folder:

```sh
npm install @vibepasson/vibe-native-dicom \
            @shopify/react-native-skia \
            react-native-gesture-handler
```

You're installing three packages:

| Package | What it does |
|---|---|
| `@vibepasson/vibe-native-dicom` | The DICOM SDK itself. |
| `@shopify/react-native-skia` | GPU rendering library — required for the image viewer. |
| `react-native-gesture-handler` | Pinch/pan/rotate gestures on the viewer. |

If you only need to parse DICOM files (no UI), you can skip the last two — but for most apps you'll want them.

---

## Step 2 — iOS setup

```sh
cd ios
pod install
cd ..
```

That's it. The command pulls in the C++ DICOM decoder (GDCM 3.2.5, included with the package) and wires up the Skia bridge. Takes about 30 seconds.

---

## Step 3 — Android setup

Nothing manual. The first time you run an Android build, Gradle will:

1. Compile the C++ DICOM library for all four ABIs (arm64-v8a, armeabi-v7a, x86, x86_64).
2. Bundle the resulting `libVibeNativeDicom.so` files into your APK.

The first Android build takes about **3 minutes** because of this. Every subsequent build is fast.

If you hit an error like `NDK at … not found`, your Android NDK isn't the right version. Open Android Studio → SDK Manager → SDK Tools → tick "Show package details" → install NDK (Side by side) → version `27.1.12297006`.

---

## Step 4 — Your first DICOM viewer

Replace your `App.tsx` with this complete, working example:

```tsx
import React, { useEffect, useState } from 'react';
import {
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
      // 1. Create a synthetic 16×16 DICOM file in the OS temp directory.
      //    In a real app, you'd skip this step and use a real file path.
      const dicomPath = writeSyntheticDicom(
        TransferSyntaxUID.ImplicitVRLittleEndian
      );

      // 2. Parse the DICOM file's metadata.
      const parsed = readDicom(dicomPath);
      setFile(parsed);

      // 3. Extract pixel data to a fast-read sidecar file.
      const outPath = dicomPath.replace(/\.dcm$/, '.pixels');
      const info = extractPixelDataToFile(dicomPath, outPath);
      if (info.hasPixelData) {
        setPixels(info);
      } else {
        setErr('No pixel data found.');
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.body}>
        <Text style={styles.title}>DICOM viewer demo</Text>

        <Text style={styles.label}>Platform</Text>
        <Text style={styles.value}>{Platform.OS}</Text>

        <Text style={styles.label}>Parsed metadata</Text>
        <Text style={styles.value}>
          {file
            ? `${file.transferSyntaxUID} · ${file.image?.rows}×${file.image?.columns} ${file.image?.bitsAllocated}-bit`
            : 'Loading…'}
        </Text>

        {err && <Text style={styles.err}>Error · {err}</Text>}

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

        <Text style={styles.label}>Window center (brightness)</Text>
        <View style={styles.row}>
          <Text style={styles.btn} onPress={() => setWc(Math.max(0, wc - 16))}>
            −
          </Text>
          <Text style={styles.numeric}>WC {wc}</Text>
          <Text style={styles.btn} onPress={() => setWc(wc + 16)}>
            +
          </Text>
        </View>

        <Text style={styles.label}>Window width (contrast)</Text>
        <View style={styles.row}>
          <Text style={styles.btn} onPress={() => setWw(Math.max(16, ww - 16))}>
            −
          </Text>
          <Text style={styles.numeric}>WW {ww}</Text>
          <Text style={styles.btn} onPress={() => setWw(ww + 16)}>
            +
          </Text>
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
    width: 256,
    height: 256,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    alignSelf: 'flex-start',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  btn: { fontSize: 22, color: '#0a66c2', paddingHorizontal: 16 },
  numeric: { fontVariant: ['tabular-nums'], minWidth: 90 },
});
```

---

## Step 5 — Run it

```sh
# iOS Simulator
npx react-native run-ios

# Or Android (start an emulator from Android Studio first)
npx react-native run-android
```

You should see:

- A "DICOM viewer demo" screen.
- A grayscale gradient image (this is your synthetic DICOM).
- Buttons to step the window center (brightness) and width (contrast).
- Pinch-to-zoom and pan on the image (use Cmd+Click + drag in iOS Simulator).

The image **does not reload** when you tap the W/L buttons — only a GPU shader uniform changes. This is why the controls feel instant.

---

## Step 6 — Loading a real DICOM file

The example above creates a synthetic image. For real DICOMs, replace step 1 with a real file path.

### Option A: bundle the DICOM file with your app

1. Place `MyScan.dcm` into:
   - **iOS**: `ios/MyDicomApp/` (then in Xcode → drag into your project → check "Copy to bundle resources")
   - **Android**: `android/app/src/main/assets/MyScan.dcm`

2. At runtime, get the path using `react-native-fs`:

   ```sh
   npm install react-native-fs
   cd ios && pod install && cd ..
   ```

   ```tsx
   import RNFS from 'react-native-fs';
   import { Platform } from 'react-native';

   async function getBundledDicomPath() {
     if (Platform.OS === 'ios') {
       return `${RNFS.MainBundlePath}/MyScan.dcm`;
     }
     // Android assets: copy to a readable path first.
     const dest = `${RNFS.DocumentDirectoryPath}/MyScan.dcm`;
     await RNFS.copyFileAssets('MyScan.dcm', dest);
     return dest;
   }
   ```

3. Replace `writeSyntheticDicom(...)` in the example above with `await getBundledDicomPath()`.

### Option B: file picker

```sh
npm install react-native-document-picker
cd ios && pod install && cd ..
```

```tsx
import DocumentPicker from 'react-native-document-picker';

async function pickDicom(): Promise<string> {
  const [res] = await DocumentPicker.pick({ type: ['public.data'] });
  return res.fileCopyUri ?? res.uri;
}
```

### Option C: download from a DICOMweb server (PACS)

The SDK includes a built-in DICOMweb client:

```tsx
import { DicomWebClient } from '@vibepasson/vibe-native-dicom';

const client = new DicomWebClient({
  baseUrl: 'https://your-pacs.example/dicomweb',
  headers: { Authorization: 'Bearer YOUR_TOKEN' },
});

const studies = await client.searchStudies({ PatientName: 'DOE^JOHN' });
const instances = await client.retrieveInstances(studies[0].studyUid);
// instances are saved locally; use those paths with extractPixelDataToFile.
```

### Where to find test DICOM files

- **DICOM Library** — https://dicomlibrary.com/ (free, anonymous)
- **Stanford AIMI** — https://aimi.stanford.edu/shared-datasets
- **TCIA** — https://www.cancerimagingarchive.net/

---

## Step 7 — Add more features

The first viewer is just the start. Each feature below is a small addition to the example above. Pick what you need.

### Display patient + study info

```tsx
import {
  getPatientName,
  getPatientID,
  getStudyDescription,
  getModality,
  getPixelSpacing,
} from '@vibepasson/vibe-native-dicom';

const name = getPatientName(file.dataset);          // "DOE^JOHN"
const id = getPatientID(file.dataset);              // "MRN-12345"
const study = getStudyDescription(file.dataset);    // "Chest CT"
const modality = getModality(file.dataset);         // "CT"
const spacing = getPixelSpacing(file.dataset);      // [0.5, 0.5] (mm)
```

### Multi-frame (cine) playback

```tsx
import { useFrameSequence } from '@vibepasson/vibe-native-dicom';

const cine = useFrameSequence({
  numberOfFrames: pixels.numberOfFrames,
  fps: 8,
  loop: true,
});

<DicomImageViewSkia
  // ...same props...
  numberOfFrames={pixels.numberOfFrames}
  frameIndex={cine.frameIndex}
/>;
<Text onPress={cine.toggle}>{cine.playing ? 'Pause' : 'Play'}</Text>;
```

### Measurement tools (linear / angle / ROI / Cobb / bidirectional)

```tsx
import {
  MeasurementOverlay,
  useMeasurementsReducer,
} from '@vibepasson/vibe-native-dicom';

const m = useMeasurementsReducer();
m.setTool('linear');  // or 'angle' / 'roi-rectangle' / 'roi-ellipse' / 'cobb' / 'bidirectional'

<View style={{ width: 512, height: 512 }}>
  <DicomImageViewSkia /* ...same as before, but: */ enableGestures={false} />
  <MeasurementOverlay
    measurements={m.list}
    tool={m.tool}
    onAddPoint={m.addPoint}
    imageRows={pixels.rows}
    imageColumns={pixels.columns}
    pixelSpacing={[0.5, 0.5]}  // get from getPixelSpacing(...)
    canvasWidth={512}
    canvasHeight={512}
  />
</View>;
```

### MPR (axial, sagittal, coronal slices through a volume)

```tsx
import {
  writeSyntheticVolumeSeries,
  buildVolumeFromDicoms,
  extractMprSlice,
  useMprController,
  releaseVolume,
} from '@vibepasson/vibe-native-dicom';

// Build the volume from a list of DICOMs (or use writeSyntheticVolumeSeries for testing).
const seriesDir = '/tmp/my-series';
const slicePaths = writeSyntheticVolumeSeries(seriesDir, 16, 1.0);
const volume = buildVolumeFromDicoms(slicePaths);

const mpr = useMprController(volume);
const axial = extractMprSlice(volume.handle, 'axial', mpr.axialIndex, '/tmp/axial.bin');
// then render `axial` like any 2D slice with DicomImageViewSkia.

// IMPORTANT: free the volume when done
useEffect(() => () => releaseVolume(volume.handle), []);
```

### 3D Volume rendering (CT bone, CT angio, MR brain, custom)

```tsx
import {
  useVolumeRenderController,
  DicomImageViewSkia,
} from '@vibepasson/vibe-native-dicom';

const vr = useVolumeRenderController(volume, { initialPreset: 'ct-bone-3d' });

<DicomImageViewSkia
  filePath={vr.slice?.filePath ?? ''}
  rows={vr.slice?.rows ?? 0}
  columns={vr.slice?.columns ?? 0}
  bitsAllocated={8}
  samplesPerPixel={4}     // RGBA8 output from volume rendering
  photometricInterpretation="MONOCHROME2"
  windowCenter={128}
  windowWidth={256}
  width={256}
  height={256}
  enableGestures={false}
/>;

// Switch presets:
<Text onPress={() => vr.setPreset('mr-brain-3d')}>MR Brain</Text>;
// Rotate the camera:
<Text onPress={() => vr.setRotY(vr.rotY + Math.PI / 12)}>Rotate</Text>;
// Toggle the Z clip plane:
<Text onPress={() => vr.setClipEnabled(!vr.clipEnabled)}>
  {vr.clipEnabled ? 'Clip ON' : 'Clip OFF'}
</Text>;
```

### Fusion overlay (CT + PET)

```tsx
import { DicomFusionViewSkia } from '@vibepasson/vibe-native-dicom';

<DicomFusionViewSkia
  base={{
    filePath: ct.filePath, rows: ct.rows, columns: ct.columns,
    bitsAllocated: ct.bitsAllocated,
    windowCenter: 40, windowWidth: 400,
  }}
  overlay={{
    filePath: pet.filePath, rows: pet.rows, columns: pet.columns,
    bitsAllocated: pet.bitsAllocated,
    windowCenter: 200, windowWidth: 80,
  }}
  overlayOpacity={0.5}
  overlayColormap="hot"  // or "jet" / "gray"
  width={256}
  height={256}
/>;
```

### Anonymization (de-identify PHI before sharing)

```tsx
import { anonymizeDicomFile, UidRemapper } from '@vibepasson/vibe-native-dicom';

const remapper = new UidRemapper();
const anon = anonymizeDicomFile(file, {
  uidRemapper: remapper,
  keepDescriptions: false,
});

// anon.dataset['0010,0010'].value === 'Anonymous'  (patient name)
// anon.dataset['0010,0020'].value === 'ANON-001'   (patient ID)
// anon.sopInstanceUID is a new, anonymous UID
```

### Caching + prefetching for fast scrolling

```tsx
import {
  cachedExtractPixelDataToFile,
  useSeriesPrefetch,
} from '@vibepasson/vibe-native-dicom';

// Instead of extractPixelDataToFile:
const info = cachedExtractPixelDataToFile(dicomPath, outPath);
// The first call decodes; the second is instant.

// Prefetch slices around the current one as the user scrolls:
const items = slicePaths.map((p, i) => ({
  dicomPath: p,
  outPath: `/tmp/slice-${i}.pixels`,
}));
const prefetch = useSeriesPrefetch(items, currentIndex);
// Slices near currentIndex get decoded in the background.
```

---

## Common errors and fixes

### Build errors

| Error | Why | Fix |
|---|---|---|
| `'gdcm/foo.h' file not found` (iOS) | Pod install didn't run | `cd ios && pod deintegrate && pod install` |
| `NDK at … did not have a source.properties file` (Android) | Wrong NDK version | Install NDK `27.1.12297006` via Android Studio |
| `module 'VibeNativeDicomSpec' not found` (iOS) | Codegen didn't run | `cd ios && pod install` |
| First Android build is very slow | Compiling C++ DICOM library | Expected — only the first build. |

### Runtime errors

| Error | Why | Fix |
|---|---|---|
| `Cannot find module '@vibepasson/vibe-native-dicom'` | Metro cache stale | `npx react-native start --reset-cache` and rebuild |
| `Invariant Violation: TurboModuleRegistry.getEnforcing('VibeNativeDicom') could not be found` | New architecture is off | Enable: `newArchEnabled=true` in `android/gradle.properties`, `RCT_NEW_ARCH_ENABLED=1` in iOS Podfile, full rebuild |
| Image renders all black | Wrong pixel representation (signed/unsigned) | Pass `pixelRepresentation={file.image?.pixelRepresentation}` |
| Image renders inverted (black where it should be white) | MONOCHROME1 image | Pass `photometricInterpretation="MONOCHROME1"` |
| `hasPixelData: false` from `extractPixelDataToFile` | Unsupported transfer syntax | Check with `isSupportedTransferSyntax(uid)` |
| Pinch/zoom doesn't work | Missing `GestureHandlerRootView` wrapper | Wrap your root component as shown in Step 4 |

### When all else fails

Nuke everything and reinstall:

```sh
# From your app root
rm -rf node_modules ios/Pods ios/build android/build android/.gradle
npm install
cd ios && pod install && cd ..
npx react-native run-ios     # or run-android
```

---

## What can the package handle?

### Supported DICOM transfer syntaxes

| UID | Name | Notes |
|---|---|---|
| `1.2.840.10008.1.2` | Implicit VR Little Endian | Most common |
| `1.2.840.10008.1.2.1` | Explicit VR Little Endian | |
| `1.2.840.10008.1.2.4.50` | JPEG Baseline | Lossy |
| `1.2.840.10008.1.2.4.51` | JPEG Extended | Lossy |
| `1.2.840.10008.1.2.4.57` | JPEG Lossless (Process 14) | Lossless |
| `1.2.840.10008.1.2.4.70` | JPEG Lossless SV1 | Lossless |
| `1.2.840.10008.1.2.4.80` | JPEG-LS Lossless | Lossless |
| `1.2.840.10008.1.2.4.81` | JPEG-LS Near-Lossless | Lossy |
| `1.2.840.10008.1.2.4.90` | JPEG 2000 Lossless | Lossless |
| `1.2.840.10008.1.2.4.91` | JPEG 2000 (Lossy or Lossless) | Either |
| `1.2.840.10008.1.2.5` | RLE Lossless | Lossless |

**Not** supported: Explicit VR Big Endian (retired), Deflated Explicit VR LE, MPEG/MPEG-4/HEVC video.

### Supported SOP classes

The parser is SOP-class-agnostic — any DICOM file with a supported transfer syntax can be read. The viewer was tested against: CT Image, MR Image, US Image, Secondary Capture, PET Image, RT Structure Set, Segmentation Storage, Basic Text SR.

### What's NOT included in 1.0

- **DIMSE networking** (C-FIND / C-MOVE / C-STORE) — DICOMweb only.
- **Burnt-in PHI scrubbing** — anonymization handles tags only, not pixel content.
- **DICOMDIR parsing** — read files by their full path.

---

## Performance expectations

| Operation | Typical time |
|---|---|
| Parse a DICOM file | 5–20 ms |
| Decode pixel data (uncompressed) | 20 ms |
| Decode pixel data (JPEG 2000) | 200–500 ms |
| First viewer mount (GPU upload) | ~30 ms |
| Window/level change | <1 ms (GPU shader uniform) |
| Build a 200-slice volume | 1–3 s |
| MPR slice extract | 5–20 ms |
| Volume render (one frame) | 200–800 ms |

For smooth scrolling through a 200-slice CT series, combine the LRU cache + series prefetcher (see Step 7 → "Caching + prefetching").

---

## Getting help

- **Bug reports / questions** → https://github.com/Vibepasson123/vibe-native-dicom/issues
- **Security vulnerabilities** → email `octohealth.frontend@proton.me` (do NOT file public issues for security bugs)
- **Full API reference** → see [`docs/integration/api-overview.md`](docs/integration/api-overview.md) in the repository

---

You're done. The first viewer should be running on your phone or simulator, and you have working code samples for every feature. From here, copy the pieces you need into your real app.
