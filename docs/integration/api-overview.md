# API Overview

Every export from `@viveksah/vibe-native-dicom`, grouped by capability. The package surface is a single barrel ([`src/index.tsx`](../../src/index.tsx)); this document mirrors that file's structure so you can locate the canonical declaration in seconds.

Conventions:

- **Function** names start with a verb (`extractMprSlice`, `anonymizeDataset`).
- **Hook** names start with `use` (`useMprController`, `useSeriesPrefetch`).
- **Component** names are PascalCase (`DicomImageViewSkia`).
- **Type** names are exported as `type Foo`.
- Trailing **(Skia)** notes require `@shopify/react-native-skia`; **(gestures)** notes require `react-native-gesture-handler`.

---

## Phase 2 — DICOM I/O

| Symbol | Kind | Source |
| --- | --- | --- |
| `readDicom(path)` | function | [`readDicom.tsx`](../../src/readDicom.tsx) |
| `writeSyntheticDicom(uid?, numberOfFrames?)` | function | [`readDicom.tsx`](../../src/readDicom.tsx) |
| `isSupportedTransferSyntax(uid)` | function | [`readDicom.tsx`](../../src/readDicom.tsx) |
| `extractPixelDataToFile(dicomPath, outPath)` | function | [`readDicom.tsx`](../../src/readDicom.tsx) |
| `TransferSyntaxUID`, `LOSSLESS_TRANSFER_SYNTAXES`, `LOSSY_TRANSFER_SYNTAXES` | const enum / arrays | [`transferSyntax.ts`](../../src/transferSyntax.ts) |
| `getPatientName / getPatientID / getStudyDescription / getSeriesDescription / getModality / getPixelSpacing / getWindowCenter / getWindowWidth / getRescaleSlope / getRescaleIntercept / ...` | helpers | [`helpers.ts`](../../src/helpers.ts) |
| `DicomWebClient` | class | [`dicomWeb/DicomWebClient.ts`](../../src/dicomWeb/DicomWebClient.ts) |
| Types: `DicomFile`, `DicomDataset`, `DicomElement`, `DicomImage`, `PixelDataInfo` | type | [`types.ts`](../../src/types.ts) |

## Phase 3 — 2D viewer

| Symbol | Kind | Source |
| --- | --- | --- |
| `DicomImageView` | component | [`viewer/DicomImageView.tsx`](../../src/viewer/DicomImageView.tsx) |
| `DicomImageViewSkia` (Skia, gestures) | component | [`viewer/DicomImageViewSkia.tsx`](../../src/viewer/DicomImageViewSkia.tsx) |
| `useViewerGestures` (gestures) | hook | [`viewer/useViewerGestures.ts`](../../src/viewer/useViewerGestures.ts) |
| `useFrameSequence` | hook | [`viewer/useFrameSequence.ts`](../../src/viewer/useFrameSequence.ts) |
| `applyWindowLevel`, `bytesFromLatin1` | functions | [`viewer/windowLevel.ts`](../../src/viewer/windowLevel.ts) |
| `encodeRgbaPng`, `pngBytesToDataUri` | functions | [`viewer/png.ts`](../../src/viewer/png.ts) |
| Types: `DicomImageViewProps`, `DicomImageViewSkiaProps`, `ViewerTransform`, `FrameSequenceOptions`, `FrameSequenceState` | type | viewer/* |

## Phase 4 — Measurement & annotation

| Symbol | Kind | Source |
| --- | --- | --- |
| `MeasurementOverlay` (Skia) | component | [`measurements/MeasurementOverlay.tsx`](../../src/measurements/MeasurementOverlay.tsx) |
| `useMeasurementsReducer` | hook | [`measurements/useMeasurementsReducer.ts`](../../src/measurements/useMeasurementsReducer.ts) |
| `measurementsReducer`, `computeResult`, `formatResult` | functions | [`measurements/reducer.ts`](../../src/measurements/reducer.ts) |
| `pixelDistance`, `distanceMm`, `canvasToImage` | functions | [`measurements/geometry.ts`](../../src/measurements/geometry.ts) |
| `exportBasicTextSr(outPath, measurementLinesJson, …source UIDs)` | function | [`readDicom.tsx`](../../src/readDicom.tsx) |
| Types: `Measurement`, `MeasurementToolKind`, `MeasurementsAction`, `MeasurementResult` | type | measurements/* |

## Phase 5 — MPR

| Symbol | Kind | Source |
| --- | --- | --- |
| `buildVolumeFromDicoms(paths, opts?)` | function | [`mpr/volume.tsx`](../../src/mpr/volume.tsx) |
| `extractMprSlice(handle, plane, index, outPath)` | function | [`mpr/volume.tsx`](../../src/mpr/volume.tsx) |
| `extractObliqueSlice(handle, spec, outPath)` | function | [`mpr/volume.tsx`](../../src/mpr/volume.tsx) |
| `releaseVolume(handle)` | function | [`mpr/volume.tsx`](../../src/mpr/volume.tsx) |
| `writeSyntheticVolumeSeries(outDir, n, spacing, opts?)` | function | [`mpr/volume.tsx`](../../src/mpr/volume.tsx) |
| `useMprController`, `useObliqueController`, `buildObliqueSpec` | hooks / function | [`mpr/`](../../src/mpr/) |
| Types: `VolumeInfo`, `MprPlane`, `MprSliceInfo`, `ObliqueSpec`, `BuildVolumeOptions` | type | [`mpr/types.ts`](../../src/mpr/types.ts) |

## Phase 6 — Slab / Volume rendering

| Symbol | Kind | Source |
| --- | --- | --- |
| `extractProjectionSlab(handle, spec, opts, outPath)` | function | [`mpr/volume.tsx`](../../src/mpr/volume.tsx) |
| `extractVolumeRender(handle, spec, opts, outPath)` | function | [`mpr/volume.tsx`](../../src/mpr/volume.tsx) |
| `CT_BONE / CT_ANGIO / MR_BRAIN / GRAY_8BIT`, `TF_PRESETS`, `rescaleTransferFunction` | TF presets | [`mpr/transferFunctions.ts`](../../src/mpr/transferFunctions.ts) |
| `CT_BONE_3D / CT_ANGIO_3D / MR_BRAIN_3D / GRAY_8BIT_3D`, `VOLUME_RENDER_PRESETS`, `presetToVolumeRenderOptions` | 3D bundle presets | [`mpr/volumeRenderPresets.ts`](../../src/mpr/volumeRenderPresets.ts) |
| `useVolumeRenderController(volume, opts?)` | hook | [`mpr/useVolumeRenderController.ts`](../../src/mpr/useVolumeRenderController.ts) |
| Types: `ProjectionMode`, `ProjectionOptions`, `TransferFunction`, `TransferFunctionPoint`, `VolumeRenderOptions`, `LightingOptions`, `ClipPlane`, `TfPresetName`, `VolumeRenderPreset`, `VolumeRenderPresetName` | type | [`mpr/types.ts`](../../src/mpr/types.ts) |

## Phase 7 — Comparison & fusion

| Symbol | Kind | Source |
| --- | --- | --- |
| `useSyncedViewerGroup({count, axes?, initial?})` | hook | [`viewer/useSyncedViewerGroup.ts`](../../src/viewer/useSyncedViewerGroup.ts) |
| `pickSlotValue` | function | [`viewer/useSyncedViewerGroup.ts`](../../src/viewer/useSyncedViewerGroup.ts) |
| `DicomFusionViewSkia` (Skia) | component | [`viewer/DicomFusionViewSkia.tsx`](../../src/viewer/DicomFusionViewSkia.tsx) |
| `buildColormapLut`, `hot / jet / gray` | functions | [`viewer/colormaps.ts`](../../src/viewer/colormaps.ts) |
| `DicomSegmentationOverlay` (Skia) | component | [`viewer/DicomSegmentationOverlay.tsx`](../../src/viewer/DicomSegmentationOverlay.tsx) |
| `buildSegmentPalette`, `makeSyntheticDiscLabelMap` | functions | [`viewer/segmentation.ts`](../../src/viewer/segmentation.ts) |
| `DicomRtStructOverlay` (Skia) | component | [`viewer/DicomRtStructOverlay.tsx`](../../src/viewer/DicomRtStructOverlay.tsx) |
| `makeSyntheticCircleContour`, `pixelToScreen` | functions | [`viewer/rtStruct.ts`](../../src/viewer/rtStruct.ts) |
| Types: `SyncedViewerAxes`, `SyncedViewerSlot`, `FusionChannel`, `ColormapName`, `Segment`, `SegmentationBaseChannel`, `Contour`, `Structure` | type | viewer/* |

## Phase 8 — Performance & workflow

| Symbol | Kind | Source |
| --- | --- | --- |
| `PixelDataCache`, `sharedPixelDataCache` | class + singleton | [`cache/pixelDataCache.ts`](../../src/cache/pixelDataCache.ts) |
| `cachedExtractPixelDataToFile(dicomPath, outPath, opts?)` | function | [`cache/cachedExtractPixelDataToFile.ts`](../../src/cache/cachedExtractPixelDataToFile.ts) |
| `SeriesPrefetcher`, `prioritizeWindow` | class + helper | [`cache/seriesPrefetcher.ts`](../../src/cache/seriesPrefetcher.ts) |
| `useSeriesPrefetch(items, activeIndex, opts?)` | hook | [`cache/useSeriesPrefetch.ts`](../../src/cache/useSeriesPrefetch.ts) |
| `applyHangingProtocol`, `findAssignmentAt`, `sortStudiesByDate` | functions | [`workflow/hangingProtocol.ts`](../../src/workflow/hangingProtocol.ts) |
| `SINGLE / CT_AXIAL_2UP / PRIOR_CURRENT / PET_CT_FUSION`, `HANGING_PROTOCOLS` | presets | [`workflow/hangingProtocol.ts`](../../src/workflow/hangingProtocol.ts) |
| `useHangingProtocol(studies, opts?)` | hook | [`workflow/useHangingProtocol.ts`](../../src/workflow/useHangingProtocol.ts) |
| `anonymizeDataset`, `anonymizeDicomFile`, `describeAnonymizationActions`, `UidRemapper` | functions / class | [`anonymize/anonymizeDataset.ts`](../../src/anonymize/anonymizeDataset.ts) |
| Types: `PixelDataCacheOptions`, `PixelDataCacheStats`, `PrefetchItem`, `StudyDescriptor`, `HangingProtocol`, `HangingProtocolName`, `AnonymizationAction`, `AnonymizationOptions` | type | cache/, workflow/, anonymize/ |

## Phase 9 — V&V tooling

Not part of the JS API surface — these are CLI tools.

| Tool | Source |
| --- | --- |
| `npm run vv:collect` / `vv:collect:all` | [`scripts/collect-vv-evidence.mjs`](../../scripts/collect-vv-evidence.mjs) |
| Traceability gate | [`scripts/check-traceability.mjs`](../../scripts/check-traceability.mjs) |
| Fixture: synthetic gradient (frozen SHA-256) | [`src/__fixtures__/syntheticGradient.ts`](../../src/__fixtures__/syntheticGradient.ts) |

---

## Looking up a specific symbol

`grep` over the [`src/index.tsx`](../../src/index.tsx) barrel is the fastest path — every public export is re-emitted there, grouped by phase. From there, the type signatures and JSDoc on the canonical declaration cover the actual usage.
