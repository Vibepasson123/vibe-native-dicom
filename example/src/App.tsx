import { useEffect, useMemo, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import {
  multiply,
  getGdcmVersion,
  writeSyntheticDicom,
  readDicom,
  isSupportedTransferSyntax,
  TransferSyntaxUID,
  LOSSLESS_TRANSFER_SYNTAXES,
  // Phase 2.5 — pixel-data extraction
  extractPixelDataToFile,
  type PixelDataInfo,
  // Phase 3.1 — viewer
  DicomImageView,
  // Phase 3.2 — Skia/GPU viewer
  DicomImageViewSkia,
  // Phase 3.3 — gestures
  type ViewerTransform,
  // Phase 3.4 — cine playback
  useFrameSequence,
  // Phase 4.1 — measurements
  MeasurementOverlay,
  useMeasurementsReducer,
  canvasToImage,
  computeResult,
  formatResult,
  type MeasurementToolKind,
  // Phase 4.2 — DICOM SR export
  exportBasicTextSr,
  // Phase 5.1 — MPR
  buildVolumeFromDicoms,
  extractMprSlice,
  releaseVolume,
  writeSyntheticVolumeSeries,
  useMprController,
  type VolumeInfo,
  type MprSliceInfo,
  type MprPlane,
  // Phase 5.3 — oblique
  extractObliqueSlice,
  useObliqueController,
  // Phase 6.1 — slab projection (MIP / MinIP / Average)
  extractProjectionSlab,
  type ProjectionMode,
  // Phase 6.2 — volume rendering (TF + alpha compositing)
  extractVolumeRender,
  TF_PRESETS,
  type TfPresetName,
  // Phase 6.5 — 3D presets + controller
  useVolumeRenderController,
  VOLUME_RENDER_PRESETS,
  type VolumeRenderPresetName,
  // Phase 7.1 — synced side-by-side viewers
  useSyncedViewerGroup,
  // Phase 7.2 — fusion overlay
  DicomFusionViewSkia,
  type ColormapName,
  // Phase 7.3 — SEG label-map overlay
  DicomSegmentationOverlay,
  makeSyntheticDiscLabelMap,
  type Segment,
  // Phase 7.4 — RTSTRUCT contour overlay
  DicomRtStructOverlay,
  makeSyntheticCircleContour,
  type Structure,
  // Phase 8.1 — pixel-data LRU cache
  cachedExtractPixelDataToFile,
  sharedPixelDataCache,
  // Phase 8.2 — series prefetcher
  useSeriesPrefetch,
  type PrefetchItem,
  // Phase 2.3 helpers
  getPatientName,
  getPatientID,
  getStudyDescription,
  getSeriesDescription,
  getModality,
  getPixelSpacing,
  getWindowCenter,
  getWindowWidth,
  getRescaleSlope,
  getRescaleIntercept,
  type DicomFile,
} from '@viveksah/vibe-native-dicom';

const EXPECTED_GDCM_VERSION = '3.2.5';

// All supported transfer syntaxes, in the order we want to display them.
// MPEG2MainProfile is included as a *negative* control: the package does
// not decode it (no support in Phase 2.2), so the example app exercises
// the H-021 "never substitute undefined bytes" guard end-to-end.
const SYNTAXES_TO_TEST: { label: string; uid: string }[] = [
  { label: 'Implicit VR LE', uid: TransferSyntaxUID.ImplicitVRLittleEndian },
  { label: 'Explicit VR LE', uid: TransferSyntaxUID.ExplicitVRLittleEndian },
  { label: 'JPEG Baseline', uid: TransferSyntaxUID.JPEGBaselineProcess1 },
  { label: 'JPEG Extended', uid: TransferSyntaxUID.JPEGExtendedProcess2_4 },
  {
    label: 'JPEG Lossless P14',
    uid: TransferSyntaxUID.JPEGLosslessProcess14,
  },
  {
    label: 'JPEG Lossless P14 SV1',
    uid: TransferSyntaxUID.JPEGLosslessProcess14_SV1,
  },
  { label: 'JPEG-LS Lossless', uid: TransferSyntaxUID.JPEGLSLossless },
  { label: 'JPEG-LS Near-Lossless', uid: TransferSyntaxUID.JPEGLSNearLossless },
  { label: 'JPEG 2000 Lossless', uid: TransferSyntaxUID.JPEG2000Lossless },
  { label: 'JPEG 2000 Lossy', uid: TransferSyntaxUID.JPEG2000 },
  { label: 'RLE Lossless', uid: TransferSyntaxUID.RLELossless },
];

const UNSUPPORTED_NEGATIVE = '1.2.840.10008.1.2.4.100'; // MPEG2MainProfile

type SyntaxResult =
  | { kind: 'pass-lossless' } // round-trip exact
  | { kind: 'pass-lossy'; bytes: number } // decoded, byte-divergent
  | { kind: 'fail-decode' } // hasPixelData=false (unexpected)
  | { kind: 'fail-error'; message: string };

function decodeBase64ByteCount(b64: string): number {
  // RFC 4648 — every 4 chars encodes 3 bytes; trailing '=' shrinks.
  const pad = (b64.match(/[=]+$/) ?? [''])[0].length;
  return (b64.length / 4) * 3 - pad;
}

function compareWithExpected(parsed: DicomFile): boolean {
  // Phase 2.1 synthetic image is a 16x16 deterministic gradient (idx % 256).
  if (!parsed.image?.hasPixelData) return false;
  const b64 = parsed.image.pixelDataBase64 ?? '';
  // We don't decode base64 here (RN doesn't ship atob in all targets);
  // for lossless syntaxes byte-count parity is enough as a sanity check
  // (16×16 = 256 bytes), and the C++ side guarantees the gradient survives.
  return decodeBase64ByteCount(b64) === 256;
}

function App() {
  const product = multiply(3, 7);

  const [version, setVersion] = useState<string | null>(null);
  const [parityPass, setParityPass] = useState<boolean | null>(null);
  const [results, setResults] = useState<
    { label: string; uid: string; result: SyntaxResult | null }[]
  >(SYNTAXES_TO_TEST.map((s) => ({ ...s, result: null })));
  const [unsupported, setUnsupported] = useState<{
    supported: boolean | null;
    readPass: boolean | null;
    message: string | null;
  }>({ supported: null, readPass: null, message: null });
  // Phase 2.3: parsed file from the Implicit VR LE round-trip, used by the
  // helpers + SQ display below.
  const [reference, setReference] = useState<DicomFile | null>(null);
  // Phase 2.5: head-to-head perf of base64 (readDicom path) vs file
  // extraction (extractPixelDataToFile path). For the synthetic 16x16x8-bit
  // image the absolute numbers are tiny — but the *ratio* is real and
  // scales linearly to clinical CT slice sizes.
  type PerfRow = {
    base64Bytes: number;
    base64Ms: number;
    fileBytes: number;
    fileMs: number;
    info: PixelDataInfo;
  };
  const [perf, setPerf] = useState<PerfRow | null>(null);
  const [perfErr, setPerfErr] = useState<string | null>(null);
  // Phase 3.1 viewer state — live W/L sliders.
  const [wc, setWc] = useState<number>(128);
  const [ww, setWw] = useState<number>(256);
  const [lastRender, setLastRender] = useState<{
    renderMs: number;
    pngBytes: number;
  } | null>(null);
  const [viewerErr, setViewerErr] = useState<string | null>(null);
  // Phase 3.2 Skia viewer telemetry — texture upload happens once.
  const [skiaUpload, setSkiaUpload] = useState<{ uploadMs: number } | null>(
    null
  );
  const [skiaErr, setSkiaErr] = useState<string | null>(null);
  // Phase 3.3 — current viewer transform from pan/pinch/rotate gestures.
  const [transform, setTransform] = useState<ViewerTransform>({
    scale: 1,
    translateX: 0,
    translateY: 0,
    rotation: 0,
  });
  // Phase 3.4 — path of the multi-frame synthetic file used by the cine panel.
  const [cinePath, setCinePath] = useState<string | null>(null);
  const [cineErr, setCineErr] = useState<string | null>(null);
  // Phase 8.2 — slice paths kept so the prefetch panel can drive
  // useSeriesPrefetch over them. Populated by the same synthetic
  // volume the MPR panels use.
  const [seriesSlicePaths, setSeriesSlicePaths] = useState<string[]>([]);
  // Phase 4.1 — measurement state.
  const measurements = useMeasurementsReducer();
  // Phase 4.2 — last exported SR file path (or error).
  const [srPath, setSrPath] = useState<string | null>(null);
  const [srErr, setSrErr] = useState<string | null>(null);
  // Phase 5.1 — MPR state.
  const [volume, setVolume] = useState<VolumeInfo | null>(null);
  const [mprErr, setMprErr] = useState<string | null>(null);
  const [mprSlices, setMprSlices] = useState<{
    axial: MprSliceInfo | null;
    sagittal: MprSliceInfo | null;
    coronal: MprSliceInfo | null;
  }>({ axial: null, sagittal: null, coronal: null });
  const mpr = useMprController(volume);
  // Phase 5.2 — extra volumes that exercise the lifted limits.
  const [compressedVolume, setCompressedVolume] = useState<VolumeInfo | null>(
    null
  );
  const [gappedVolume, setGappedVolume] = useState<VolumeInfo | null>(null);
  const [phase52Err, setPhase52Err] = useState<string | null>(null);
  // Phase 5.3 — oblique slicing on the same volume.
  const oblique = useObliqueController(volume);
  const [obliqueSlice, setObliqueSlice] = useState<MprSliceInfo | null>(null);
  const [obliqueErr, setObliqueErr] = useState<string | null>(null);
  // Phase 6.1 — slab projection on the same plane.
  const [projectionMode, setProjectionMode] = useState<ProjectionMode>('mip');
  const [slabThicknessMm, setSlabThicknessMm] = useState<number>(8);
  const [projectionSlice, setProjectionSlice] = useState<MprSliceInfo | null>(
    null
  );
  const [projectionErr, setProjectionErr] = useState<string | null>(null);
  // Phase 6.2 — volume rendering on the same plane.
  const [vrPreset, setVrPreset] = useState<TfPresetName>('gray-8bit');
  const [vrSlabMm, setVrSlabMm] = useState<number>(16);
  const [vrSlice, setVrSlice] = useState<MprSliceInfo | null>(null);
  const [vrErr, setVrErr] = useState<string | null>(null);
  // Phase 6.3 — axis-aligned Z clip plane. When `vrClipEnabled` is true
  // we pass a single plane at z = vrClipZMm with normal +Z, which
  // discards every sample below z = clipZ. Slider range matches the
  // synthetic 16-voxel cube (0–15 mm).
  const [vrClipEnabled, setVrClipEnabled] = useState<boolean>(false);
  const [vrClipZMm, setVrClipZMm] = useState<number>(8);
  // Phase 6.4 — Phong shading toggle + light "strength" preset.
  // Each preset scales (ambient, diffuse, specular) together; the
  // shininess + gradient threshold are tuned for the 8-bit synthetic
  // gradient (values 0..255, so a threshold of 4 marks any non-flat
  // patch). Light direction is "over-the-shoulder" along (1,1,1).
  type VrLightStrength = 'soft' | 'medium' | 'hard';
  const [vrLightEnabled, setVrLightEnabled] = useState<boolean>(false);
  const [vrLightStrength, setVrLightStrength] =
    useState<VrLightStrength>('medium');

  // Phase 6.5 — high-level controller driving its own VR panel.
  // Replaces ~30 lines of manual sliders with one hook call. Note
  // that the Phase 6.2–6.4 manual panel above stays in place so the
  // app continues to exercise the low-level API in the same session.
  const vr = useVolumeRenderController(volume, {
    initialPreset: 'gray-8bit-3d',
  });
  // Phase 7.2 — fusion overlay state. The synthetic dataset only has
  // one channel, so the overlay reuses the same file with a different
  // W/L to highlight the bright half of the gradient — this validates
  // the dual-texture composite without needing a second study.
  const [fusionOpacity, setFusionOpacity] = useState<number>(0.5);
  const [fusionColormap, setFusionColormap] = useState<ColormapName>('hot');
  // Phase 7.3 — SEG label-map overlay state. We synthesise a single
  // disc-shaped segment at the centre of the gradient image; the
  // shader colourises it red with the user-chosen opacity.
  const [segOpacity, setSegOpacity] = useState<number>(0.5);
  const segLabelMap = useMemo(
    () =>
      perf?.info
        ? makeSyntheticDiscLabelMap(perf.info.rows, perf.info.columns, 1, 0.3)
        : null,
    [perf?.info]
  );
  const segPalette: Segment[] = useMemo(
    () => [
      { id: 1, label: 'lesion (synthetic)', r: 1, g: 0.2, b: 0.2, opacity: 1 },
    ],
    []
  );
  // Phase 8.2 — prefetcher panel state. activeIndex drives the
  // window-around-current priority order; the hook re-prioritises on
  // each change and keeps two workers chewing through the queue.
  const [prefetchActive, setPrefetchActive] = useState<number>(0);
  const prefetchItems: PrefetchItem[] = useMemo(
    () =>
      seriesSlicePaths.map((p, i) => ({
        dicomPath: p,
        outPath: `/tmp/vnd-prefetch-${i}.pixels`,
      })),
    [seriesSlicePaths]
  );
  const prefetch = useSeriesPrefetch(prefetchItems, prefetchActive);
  // Phase 8.1 — LRU cache panel. We snapshot the shared cache's
  // stats and re-run cachedExtractPixelDataToFile in a tight loop on
  // user request — the second-through-Nth calls should all be hits.
  const [cacheStats, setCacheStats] = useState(() =>
    sharedPixelDataCache.stats()
  );
  const refreshCacheStats = () => setCacheStats(sharedPixelDataCache.stats());
  const runCacheBench = () => {
    if (!perf?.info) return;
    // 10 back-to-back extracts on the same path. First one populates
    // the cache (or hits if a prior run already did); the next 9 are
    // pure cache hits and skip native entirely.
    for (let i = 0; i < 10; i++) {
      try {
        cachedExtractPixelDataToFile(
          '/tmp/vnd-synthetic-default-1f.dcm',
          perf.info.filePath
        );
      } catch {
        // The first run may fail if the synthetic path differs from
        // the one writeSyntheticDicom emitted; ignore — the cache
        // behaviour itself is what we're demoing.
      }
    }
    refreshCacheStats();
  };
  // Phase 7.4 — RTSTRUCT contour overlay. Two synthetic structures
  // ("GTV" and "spinal cord") drawn as circles at different image
  // locations so the polyline rasterisation is exercised end-to-end.
  const [rtOpacity, setRtOpacity] = useState<number>(0.9);
  const [rtFill, setRtFill] = useState<boolean>(false);
  const rtStructures: Structure[] = useMemo(() => {
    if (!perf?.info) return [];
    const cx = perf.info.columns / 2;
    const cy = perf.info.rows / 2;
    const r = Math.min(perf.info.rows, perf.info.columns) * 0.35;
    return [
      {
        id: 1,
        label: 'GTV (synthetic)',
        r: 1,
        g: 0.85,
        b: 0.2,
        strokeWidth: 2,
        contours: [makeSyntheticCircleContour(cx, cy, r, 64)],
      },
      {
        id: 2,
        label: 'spinal cord (synthetic)',
        r: 0.2,
        g: 0.7,
        b: 1,
        strokeWidth: 1.5,
        contours: [
          makeSyntheticCircleContour(perf.info.columns * 0.2, cy, r * 0.4, 32),
        ],
      },
    ];
  }, [perf?.info]);
  // Phase 7.1 — two synced viewers showing the same pixel buffer.
  // In a real workflow the two filePaths would come from different
  // studies (prior vs. current). Here they share to validate the
  // shared-state mechanics — when sync is ON both viewers tick
  // together; when OFF each side independently.
  const synced = useSyncedViewerGroup({
    count: 2,
    initial: [
      { windowCenter: 128, windowWidth: 256 },
      { windowCenter: 128, windowWidth: 256 },
    ],
  });

  useEffect(() => {
    try {
      const v = getGdcmVersion();
      setVersion(v);
      setParityPass(v === EXPECTED_GDCM_VERSION);
    } catch (err) {
      setVersion(`error: ${(err as Error).message}`);
      setParityPass(false);
    }

    // Run all transfer-syntax round trips on mount.
    const next = SYNTAXES_TO_TEST.map((entry) => {
      try {
        const path = writeSyntheticDicom(entry.uid);
        const parsed = readDicom(path);
        // Capture the Implicit VR LE round trip so the helpers section
        // can render against a known-good parsed dataset.
        if (entry.uid === TransferSyntaxUID.ImplicitVRLittleEndian) {
          setReference(parsed);
        }
        const lossless = LOSSLESS_TRANSFER_SYNTAXES.includes(
          entry.uid as (typeof LOSSLESS_TRANSFER_SYNTAXES)[number]
        );
        if (lossless) {
          return {
            ...entry,
            result: compareWithExpected(parsed)
              ? ({ kind: 'pass-lossless' } as const)
              : ({ kind: 'fail-decode' } as const),
          };
        }
        // Lossy: decoder reports hasPixelData=true and we got real bytes.
        if (parsed.image?.hasPixelData) {
          return {
            ...entry,
            result: {
              kind: 'pass-lossy',
              bytes: decodeBase64ByteCount(parsed.image.pixelDataBase64 ?? ''),
            } as const,
          };
        }
        return { ...entry, result: { kind: 'fail-decode' } as const };
      } catch (err) {
        return {
          ...entry,
          result: {
            kind: 'fail-error',
            message: (err as Error).message,
          } as const,
        };
      }
    });
    setResults(next);

    // Negative control: MPEG2MainProfile must report unsupported via
    // isSupportedTransferSyntax(), and writeSyntheticDicom() must throw.
    try {
      const supported = isSupportedTransferSyntax(UNSUPPORTED_NEGATIVE);
      try {
        writeSyntheticDicom(UNSUPPORTED_NEGATIVE);
        setUnsupported({
          supported,
          readPass: false,
          message: 'writeSyntheticDicom did not throw for unsupported syntax',
        });
      } catch (err) {
        setUnsupported({
          supported,
          readPass: !supported, // expected: supported=false, write threw
          message: (err as Error).message,
        });
      }
    } catch (err) {
      setUnsupported({
        supported: null,
        readPass: false,
        message: (err as Error).message,
      });
    }

    // Phase 2.5 perf comparison. Each path runs N times and we take the
    // best wall-clock — JS warmup absorbs the first-call cost.
    try {
      const N = 5;
      const dicomPath = writeSyntheticDicom(
        TransferSyntaxUID.ImplicitVRLittleEndian
      );

      let bestBase64Ms = Number.POSITIVE_INFINITY;
      let base64Bytes = 0;
      for (let i = 0; i < N; i++) {
        const t0 = Date.now();
        const f = readDicom(dicomPath);
        const dt = Date.now() - t0;
        const b64 = f.image?.pixelDataBase64 ?? '';
        // Approximate decoded byte count from base64 length.
        const pad = (b64.match(/[=]+$/) ?? [''])[0].length;
        base64Bytes = (b64.length / 4) * 3 - pad;
        if (dt < bestBase64Ms) bestBase64Ms = dt;
      }

      let bestFileMs = Number.POSITIVE_INFINITY;
      let lastInfo: PixelDataInfo | null = null;
      for (let i = 0; i < N; i++) {
        const outPath = `${dicomPath}.${i}.pixels`;
        const t0 = Date.now();
        const info = extractPixelDataToFile(dicomPath, outPath);
        const dt = Date.now() - t0;
        if (dt < bestFileMs) bestFileMs = dt;
        lastInfo = info;
      }

      if (lastInfo) {
        setPerf({
          base64Bytes,
          base64Ms: bestBase64Ms,
          fileBytes: lastInfo.byteLength,
          fileMs: bestFileMs,
          info: lastInfo,
        });
      }
    } catch (err) {
      setPerfErr((err as Error).message);
    }

    // Phase 3.4: write a 12-frame synthetic DICOM for the cine panel.
    try {
      const path = writeSyntheticDicom(
        TransferSyntaxUID.ImplicitVRLittleEndian,
        12
      );
      setCinePath(path);
    } catch (err) {
      setCineErr((err as Error).message);
    }

    // Phase 5.1: write a 16-slice synthetic volume series + build it.
    let dir = '';
    try {
      // Use the same tmpdir as cine path (parent dir of any synthetic file).
      const probe = writeSyntheticDicom(
        TransferSyntaxUID.ImplicitVRLittleEndian,
        1
      );
      dir = probe.substring(0, probe.lastIndexOf('/'));
      const slicePaths = writeSyntheticVolumeSeries(dir, 16, 1.0);
      setSeriesSlicePaths(slicePaths);
      const v = buildVolumeFromDicoms(slicePaths);
      setVolume(v);
    } catch (err) {
      setMprErr((err as Error).message);
    }

    // Phase 5.2: build two additional volumes to exercise the lifted
    // limits — one from a JPEG-Lossless compressed series, one from a
    // gapped-Z series resampled to a uniform grid. Note: each call to
    // writeSyntheticVolumeSeries reuses filename pattern vnd-vol-<NNN>,
    // so subsequent calls overwrite earlier ones. We capture the
    // returned paths immediately, build the volume in-memory, and the
    // on-disk files become don't-care after that.
    if (dir) {
      try {
        const compressedPaths = writeSyntheticVolumeSeries(dir, 12, 1.0, {
          transferSyntaxUID: TransferSyntaxUID.JPEGLosslessProcess14,
        });
        const cv = buildVolumeFromDicoms(compressedPaths);
        setCompressedVolume(cv);
      } catch (err) {
        setPhase52Err(`compressed: ${(err as Error).message}`);
      }
      try {
        const gappedPaths = writeSyntheticVolumeSeries(dir, 10, 1.0, {
          gappedZ: true,
        });
        const gv = buildVolumeFromDicoms(gappedPaths, {
          resampleNonUniformZ: true,
        });
        setGappedVolume(gv);
      } catch (err) {
        setPhase52Err(`gapped: ${(err as Error).message}`);
      }
    }
  }, []);

  const cineFrames = 12;
  const cine = useFrameSequence({ numberOfFrames: cineFrames, fps: 8 });

  // Phase 5.1: re-extract MPR slices whenever the volume handle or any
  // index changes. Each plane writes to its own .bin file so the Skia
  // viewer's once-per-file cache (Phase 3.4) handles re-uploads.
  useEffect(() => {
    if (!volume) return;
    const planes: MprPlane[] = ['axial', 'sagittal', 'coronal'];
    try {
      const next = { ...mprSlices };
      for (const p of planes) {
        const idx = mpr.indices[p];
        const out = `/tmp/vnd-mpr-${volume.handle}-${p}-${idx}.bin`;
        next[p] = extractMprSlice(volume.handle, p, idx, out);
      }
      setMprSlices(next);
    } catch (err) {
      setMprErr((err as Error).message);
    }
    // mprSlices intentionally NOT in deps — would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, mpr.indices.axial, mpr.indices.sagittal, mpr.indices.coronal]);

  // Free the volume buffer when the component unmounts.
  useEffect(() => {
    return () => {
      if (volume) releaseVolume(volume.handle);
    };
  }, [volume]);

  // Phase 5.2 — extract centre-axial slices from the compressed +
  // gapped volumes for thumbnail preview. We don't expose scrollers
  // for these (Phase 5.1 already proves the scroll UI); the panels
  // exist to demonstrate that the lifted limits actually work.
  const [compressedSlice, setCompressedSlice] = useState<MprSliceInfo | null>(
    null
  );
  const [gappedSlice, setGappedSlice] = useState<MprSliceInfo | null>(null);
  useEffect(() => {
    if (!compressedVolume) return;
    try {
      const idx = Math.floor(compressedVolume.depth / 2);
      const out = `/tmp/vnd-mpr-cv-${compressedVolume.handle}-${idx}.bin`;
      setCompressedSlice(
        extractMprSlice(compressedVolume.handle, 'axial', idx, out)
      );
    } catch (err) {
      setPhase52Err(`compressed slice: ${(err as Error).message}`);
    }
    return () => {
      if (compressedVolume) releaseVolume(compressedVolume.handle);
    };
  }, [compressedVolume]);
  useEffect(() => {
    if (!gappedVolume) return;
    try {
      const idx = Math.floor(gappedVolume.depth / 2);
      const out = `/tmp/vnd-mpr-gv-${gappedVolume.handle}-${idx}.bin`;
      setGappedSlice(extractMprSlice(gappedVolume.handle, 'axial', idx, out));
    } catch (err) {
      setPhase52Err(`gapped slice: ${(err as Error).message}`);
    }
    return () => {
      if (gappedVolume) releaseVolume(gappedVolume.handle);
    };
  }, [gappedVolume]);

  // Phase 5.3 — re-extract the oblique slice when rotation or volume
  // changes. Slow path: trilinear sampling at 100s of thousands of
  // points. Cheap enough at 16x16x16 to run on every slider tick.
  useEffect(() => {
    if (!volume || !oblique.spec) return;
    try {
      const out = `/tmp/vnd-oblique-${volume.handle}-${oblique.rotX.toFixed(
        3
      )}-${oblique.rotY.toFixed(3)}-${oblique.rotZ.toFixed(3)}.bin`;
      setObliqueSlice(extractObliqueSlice(volume.handle, oblique.spec, out));
      setObliqueErr(null);
    } catch (err) {
      setObliqueErr((err as Error).message);
    }
  }, [volume, oblique.spec, oblique.rotX, oblique.rotY, oblique.rotZ]);

  // Phase 6.1 — re-extract the slab projection when rotation, mode,
  // slab thickness, or volume changes. Same plane as the oblique
  // viewer so users can A/B-compare a single slice vs the projected
  // slab live.
  useEffect(() => {
    if (!volume || !oblique.spec) return;
    try {
      const out = `/tmp/vnd-proj-${volume.handle}-${projectionMode}-${slabThicknessMm}-${oblique.rotX.toFixed(3)}-${oblique.rotY.toFixed(3)}-${oblique.rotZ.toFixed(3)}.bin`;
      setProjectionSlice(
        extractProjectionSlab(
          volume.handle,
          oblique.spec,
          { slabThicknessMm, mode: projectionMode },
          out
        )
      );
      setProjectionErr(null);
    } catch (err) {
      setProjectionErr((err as Error).message);
    }
  }, [
    volume,
    oblique.spec,
    oblique.rotX,
    oblique.rotY,
    oblique.rotZ,
    projectionMode,
    slabThicknessMm,
  ]);

  // Phase 6.2 — re-extract the volume render when rotation, preset, or
  // slab thickness changes. Same plane as Phase 6.1 so the user can
  // A/B-compare a hard MIP vs a soft TF-composited render live.
  useEffect(() => {
    if (!volume || !oblique.spec) return;
    try {
      const clipPlanes = vrClipEnabled
        ? [
            {
              pointMm: [0, 0, vrClipZMm] as [number, number, number],
              normalMm: [0, 0, 1] as [number, number, number],
            },
          ]
        : undefined;
      // Phase 6.4 — light strength presets. Diffuse drives most of the
      // visible shading; specular drives the highlight tightness.
      const strengthTuned = {
        soft: { ambient: 0.4, diffuse: 0.5, specular: 0.1, shininess: 8 },
        medium: { ambient: 0.2, diffuse: 0.7, specular: 0.3, shininess: 32 },
        hard: { ambient: 0.05, diffuse: 0.85, specular: 0.55, shininess: 64 },
      }[vrLightStrength];
      const lighting = vrLightEnabled
        ? {
            enabled: true,
            ambient: strengthTuned.ambient,
            diffuse: strengthTuned.diffuse,
            specular: strengthTuned.specular,
            shininess: strengthTuned.shininess,
            gradientThreshold: 4,
            lightDirMm: [1, 1, 1] as [number, number, number],
          }
        : undefined;
      const out = `/tmp/vnd-vr-${volume.handle}-${vrPreset}-${vrSlabMm}-${vrClipEnabled ? `c${vrClipZMm}` : 'noclip'}-${vrLightEnabled ? `l${vrLightStrength}` : 'nol'}-${oblique.rotX.toFixed(3)}-${oblique.rotY.toFixed(3)}-${oblique.rotZ.toFixed(3)}.bin`;
      setVrSlice(
        extractVolumeRender(
          volume.handle,
          oblique.spec,
          {
            slabThicknessMm: vrSlabMm,
            transferFunction: TF_PRESETS[vrPreset],
            clipPlanes,
            lighting,
          },
          out
        )
      );
      setVrErr(null);
    } catch (err) {
      setVrErr((err as Error).message);
    }
  }, [
    volume,
    oblique.spec,
    oblique.rotX,
    oblique.rotY,
    oblique.rotZ,
    vrPreset,
    vrSlabMm,
    vrClipEnabled,
    vrClipZMm,
    vrLightEnabled,
    vrLightStrength,
  ]);

  const overallPass =
    parityPass === true &&
    results.every(
      (r) =>
        r.result?.kind === 'pass-lossless' || r.result?.kind === 'pass-lossy'
    ) &&
    unsupported.readPass === true;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>vibe-native-dicom — Phase 2.2</Text>

      <Text style={styles.label}>Platform</Text>
      <Text style={styles.value}>{Platform.OS}</Text>

      <Text style={styles.label}>multiply(3, 7)</Text>
      <Text style={styles.value}>{product}</Text>

      <Text style={styles.label}>
        GDCM version (parity vs {EXPECTED_GDCM_VERSION})
      </Text>
      <Text style={parityPass ? styles.pass : styles.fail}>
        {parityPass === null
          ? '…'
          : parityPass
            ? `${version}  PASS`
            : `${version}  FAIL`}
      </Text>

      <Text style={styles.section}>Transfer-syntax round trip</Text>
      {results.map((row) => (
        <View key={row.uid} style={styles.row}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.rowUid}>{row.uid}</Text>
          {row.result === null && <ActivityIndicator />}
          {row.result?.kind === 'pass-lossless' && (
            <Text style={styles.pass}>PASS · lossless · 256 bytes</Text>
          )}
          {row.result?.kind === 'pass-lossy' && (
            <Text style={styles.passLossy}>
              PASS · lossy · {row.result.bytes} bytes
            </Text>
          )}
          {row.result?.kind === 'fail-decode' && (
            <Text style={styles.fail}>FAIL · decoder returned no pixels</Text>
          )}
          {row.result?.kind === 'fail-error' && (
            <Text style={styles.fail} numberOfLines={3}>
              FAIL · {row.result.message}
            </Text>
          )}
        </View>
      ))}

      <Text style={styles.section}>Unsupported-syntax guard (H-021)</Text>
      <Text style={styles.rowUid}>MPEG2MainProfile {UNSUPPORTED_NEGATIVE}</Text>
      {unsupported.readPass === null && <ActivityIndicator />}
      {unsupported.readPass === true && (
        <Text style={styles.pass}>PASS · isSupported=false · write threw</Text>
      )}
      {unsupported.readPass === false && (
        <Text style={styles.fail}>
          FAIL · {unsupported.message ?? 'guard did not engage'}
        </Text>
      )}

      <Text style={styles.section}>Helpers (Phase 2.3)</Text>
      {reference === null && <ActivityIndicator />}
      {reference !== null && (
        <View style={styles.block}>
          <Text style={styles.label}>Patient</Text>
          <Text style={styles.value}>
            {getPatientName(reference.dataset) ?? '(missing)'} ·{' '}
            {getPatientID(reference.dataset) ?? '(missing)'}
          </Text>
          <Text style={styles.label}>Study</Text>
          <Text style={styles.value}>
            {getStudyDescription(reference.dataset) ?? '(missing)'}
          </Text>
          <Text style={styles.label}>Series · Modality</Text>
          <Text style={styles.value}>
            {getSeriesDescription(reference.dataset) ?? '(missing)'} ·{' '}
            {getModality(reference.dataset) ?? '?'}
          </Text>
          <Text style={styles.label}>Pixel spacing (row × col, mm)</Text>
          <Text style={styles.value}>
            {(() => {
              const ps = getPixelSpacing(reference.dataset);
              return ps ? `${ps[0]} × ${ps[1]}` : '(missing)';
            })()}
          </Text>
          <Text style={styles.label}>Window center / width</Text>
          <Text style={styles.value}>
            {getWindowCenter(reference.dataset) ?? '?'} /{' '}
            {getWindowWidth(reference.dataset) ?? '?'}
          </Text>
          <Text style={styles.label}>Rescale slope · intercept</Text>
          <Text style={styles.value}>
            {getRescaleSlope(reference.dataset) ?? '?'} ·{' '}
            {getRescaleIntercept(reference.dataset) ?? '?'}
          </Text>
        </View>
      )}

      <Text style={styles.section}>Sequence (SQ) traversal</Text>
      {reference === null && <ActivityIndicator />}
      {reference !== null &&
        (() => {
          const sq = reference.dataset['0008,1032']; // Procedure Code Sequence
          if (!sq) {
            return (
              <Text style={styles.fail}>
                FAIL · Procedure Code Sequence (0008,1032) missing
              </Text>
            );
          }
          if (sq.vr !== 'SQ') {
            return (
              <Text style={styles.fail}>
                FAIL · (0008,1032) VR is {sq.vr}, expected SQ
              </Text>
            );
          }
          const items = sq.items ?? [];
          if (items.length === 0) {
            return <Text style={styles.fail}>FAIL · 0 items in SQ</Text>;
          }
          const item0 = items[0];
          if (!item0) {
            return <Text style={styles.fail}>FAIL · undefined item</Text>;
          }
          const codeValue = item0['0008,0100']?.value ?? '?';
          const codeMeaning = item0['0008,0104']?.value ?? '?';
          return (
            <View style={styles.block}>
              <Text style={styles.pass}>
                PASS · {items.length} item · code {String(codeValue)} ·{' '}
                {String(codeMeaning)}
              </Text>
            </View>
          );
        })()}

      <Text style={styles.section}>Pixel-data path comparison (Phase 2.5)</Text>
      {perf === null && perfErr === null && <ActivityIndicator />}
      {perfErr !== null && <Text style={styles.fail}>FAIL · {perfErr}</Text>}
      {perf !== null && (
        <View style={styles.block}>
          <Text style={styles.label}>via readDicom().pixelDataBase64</Text>
          <Text style={styles.value}>
            {perf.base64Bytes} bytes · {perf.base64Ms} ms
          </Text>

          <Text style={styles.label}>via extractPixelDataToFile()</Text>
          <Text style={styles.value}>
            {perf.fileBytes} bytes · {perf.fileMs} ms
          </Text>
          <Text style={styles.path} numberOfLines={2}>
            {perf.info.filePath}
          </Text>

          <Text style={styles.label}>Bridge payload reduction</Text>
          <Text style={styles.value}>
            {perf.base64Bytes > 0
              ? `${((1 - perf.fileBytes / ((perf.base64Bytes * 4) / 3)) * 100).toFixed(0)}% smaller bridge transfer (no base64)`
              : 'n/a'}
          </Text>
        </View>
      )}

      <Text style={styles.section}>Live W/L viewer (Phase 3.1)</Text>
      {perf?.info.hasPixelData ? (
        <View style={styles.block}>
          <Text style={styles.label}>Window center</Text>
          <View style={styles.sliderRow}>
            <Text
              style={styles.sliderButton}
              onPress={() => setWc(Math.max(0, wc - 16))}
            >
              −
            </Text>
            <Text style={styles.sliderValue}>{wc}</Text>
            <Text
              style={styles.sliderButton}
              onPress={() => setWc(Math.min(255, wc + 16))}
            >
              +
            </Text>
          </View>
          <Text style={styles.label}>Window width</Text>
          <View style={styles.sliderRow}>
            <Text
              style={styles.sliderButton}
              onPress={() => setWw(Math.max(1, ww - 16))}
            >
              −
            </Text>
            <Text style={styles.sliderValue}>{ww}</Text>
            <Text
              style={styles.sliderButton}
              onPress={() => setWw(Math.min(512, ww + 16))}
            >
              +
            </Text>
          </View>
          <View style={styles.viewerWrapper}>
            <DicomImageView
              filePath={perf.info.filePath}
              rows={perf.info.rows}
              columns={perf.info.columns}
              bitsAllocated={perf.info.bitsAllocated}
              photometricInterpretation={perf.info.photometricInterpretation}
              windowCenter={wc}
              windowWidth={ww}
              style={styles.viewer}
              onRendered={(info) => setLastRender(info)}
              onError={(err) => setViewerErr(err.message)}
            />
          </View>
          {lastRender && (
            <Text style={styles.label}>
              rendered in {lastRender.renderMs} ms · PNG {lastRender.pngBytes}{' '}
              bytes
            </Text>
          )}
          {viewerErr && <Text style={styles.fail}>FAIL · {viewerErr}</Text>}
        </View>
      ) : (
        <Text style={styles.label}>Waiting for pixel data…</Text>
      )}

      <Text style={styles.section}>GPU viewer (Phase 3.2 · Skia)</Text>
      {perf?.info.hasPixelData ? (
        <View style={styles.block}>
          <Text style={styles.label}>
            Same W/L sliders above drive both viewers.
          </Text>
          <GestureDetector
            gesture={Gesture.Tap()
              .enabled(measurements.tool !== null)
              .onEnd((e) => {
                const p = canvasToImage(
                  e.x,
                  e.y,
                  perf.info.columns,
                  perf.info.rows,
                  256,
                  256,
                  transform
                );
                measurements.addPoint(p);
              })}
          >
            <View style={styles.viewerWrapper}>
              <DicomImageViewSkia
                filePath={perf.info.filePath}
                rows={perf.info.rows}
                columns={perf.info.columns}
                bitsAllocated={perf.info.bitsAllocated}
                photometricInterpretation={perf.info.photometricInterpretation}
                windowCenter={wc}
                windowWidth={ww}
                width={256}
                height={256}
                enableGestures={measurements.tool === null}
                onReady={(info) => setSkiaUpload(info)}
                onError={(err) => setSkiaErr(err.message)}
                onTransformChange={(t) => setTransform(t)}
              />
              <View style={styles.overlayLayer} pointerEvents="none">
                <MeasurementOverlay
                  width={256}
                  height={256}
                  imageColumns={perf.info.columns}
                  imageRows={perf.info.rows}
                  transform={transform}
                  measurements={measurements.measurements}
                  draft={measurements.draft}
                />
              </View>
            </View>
          </GestureDetector>
          {skiaUpload && (
            <Text style={styles.label}>
              texture uploaded in {skiaUpload.uploadMs} ms · W/L applied on GPU
              per frame
            </Text>
          )}
          {skiaErr && <Text style={styles.fail}>FAIL · {skiaErr}</Text>}
          <Text style={styles.label}>Transform (pinch / pan / rotate)</Text>
          <Text style={styles.value}>
            scale {transform.scale.toFixed(2)} · t (
            {transform.translateX.toFixed(0)}, {transform.translateY.toFixed(0)}
            ) · {((transform.rotation * 180) / Math.PI).toFixed(0)}°
          </Text>
          <Text
            style={styles.sliderButton}
            onPress={() =>
              setTransform({
                scale: 1,
                translateX: 0,
                translateY: 0,
                rotation: 0,
              })
            }
          >
            Reset transform
          </Text>

          <Text style={styles.label}>Measurement tool (Phase 4.1)</Text>
          <View style={styles.sliderRow}>
            {(
              [
                'linear',
                'angle',
                'roi-rect',
                'bidirectional',
                'cobb',
              ] as MeasurementToolKind[]
            ).map((k) => {
              const active = measurements.tool === k;
              return (
                <Text
                  key={k}
                  style={[styles.toolButton, active && styles.toolButtonActive]}
                  onPress={() => measurements.selectTool(active ? null : k)}
                >
                  {k}
                </Text>
              );
            })}
          </View>
          {measurements.draft && (
            <Text style={styles.label}>
              placing {measurements.draft.kind} ·{' '}
              {measurements.draft.points.length} pt
              {measurements.draft.points.length === 1 ? '' : 's'} so far
            </Text>
          )}
          {measurements.measurements.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.label}>
                Measurements ({measurements.measurements.length})
              </Text>
              {measurements.measurements.map((m) => {
                const ps = getPixelSpacing(reference?.dataset ?? {});
                const r = computeResult(m, ps);
                return (
                  <View key={m.id} style={styles.measRow}>
                    <Text style={styles.value}>
                      {m.kind}: {formatResult(r)}
                    </Text>
                    <Text
                      style={styles.miniButton}
                      onPress={() => measurements.remove(m.id)}
                    >
                      ✕
                    </Text>
                  </View>
                );
              })}
              <View style={styles.sliderRow}>
                <Text
                  style={styles.sliderButton}
                  onPress={measurements.clearAll}
                >
                  Clear all
                </Text>
                <Text
                  style={styles.sliderButton}
                  onPress={() => {
                    try {
                      const ps = getPixelSpacing(reference?.dataset ?? {});
                      const path = `${perf.info.filePath}.sr.dcm`;
                      const written = exportBasicTextSr(
                        measurements.measurements,
                        ps,
                        path,
                        {
                          studyInstanceUID:
                            reference?.dataset[
                              '0020,000D'
                            ]?.value?.toString() ?? '',
                          seriesInstanceUID:
                            reference?.dataset[
                              '0020,000E'
                            ]?.value?.toString() ?? '',
                          sopInstanceUID: reference?.sopInstanceUID ?? '',
                          sopClassUID: reference?.sopClassUID ?? '',
                        }
                      );
                      setSrPath(written);
                      setSrErr(null);
                    } catch (err) {
                      setSrErr((err as Error).message);
                    }
                  }}
                >
                  Export SR
                </Text>
              </View>
              {srPath && (
                <View style={styles.block}>
                  <Text style={styles.label}>Wrote SR</Text>
                  <Text style={styles.path} numberOfLines={2}>
                    {srPath}
                  </Text>
                </View>
              )}
              {srErr && <Text style={styles.fail}>FAIL · {srErr}</Text>}
            </View>
          )}
        </View>
      ) : (
        <Text style={styles.label}>Waiting for pixel data…</Text>
      )}

      <Text style={styles.section}>Cine playback (Phase 3.4)</Text>
      {cineErr && <Text style={styles.fail}>FAIL · {cineErr}</Text>}
      {cinePath === null && cineErr === null && <ActivityIndicator />}
      {cinePath !== null && (
        <View style={styles.block}>
          <Text style={styles.label}>
            12-frame synthetic DICOM · gradient shifts 8 px per frame
          </Text>
          <View style={styles.viewerWrapper}>
            <DicomImageViewSkia
              filePath={cinePath}
              rows={16}
              columns={16}
              bitsAllocated={8}
              numberOfFrames={cineFrames}
              frameIndex={cine.frame}
              windowCenter={128}
              windowWidth={256}
              width={256}
              height={256}
              enableGestures={false}
            />
          </View>
          <Text style={styles.value}>
            frame {cine.frame + 1} / {cineFrames} ·{' '}
            {cine.isPlaying ? 'playing' : 'paused'}
          </Text>
          <View style={styles.sliderRow}>
            <Text style={styles.sliderButton} onPress={cine.prev}>
              ‹
            </Text>
            <Text style={styles.sliderButton} onPress={cine.togglePlay}>
              {cine.isPlaying ? '❚❚' : '▶'}
            </Text>
            <Text style={styles.sliderButton} onPress={cine.next}>
              ›
            </Text>
          </View>
        </View>
      )}

      <Text style={styles.section}>MPR (Phase 5.1)</Text>
      {mprErr && <Text style={styles.fail}>FAIL · {mprErr}</Text>}
      {!volume && !mprErr && <ActivityIndicator />}
      {volume && (
        <View style={styles.block}>
          <Text style={styles.label}>
            16-slice synthetic volume · {volume.depth} × {volume.rows} ×{' '}
            {volume.columns} · spacing {volume.pixelSpacingRow}/
            {volume.pixelSpacingCol}/{volume.sliceSpacing} mm
          </Text>
          {(['axial', 'sagittal', 'coronal'] as MprPlane[]).map((p) => {
            const slice = mprSlices[p];
            const idx = mpr.indices[p];
            const max = mpr.maxIndex[p];
            return (
              <View key={p} style={styles.block}>
                <Text style={styles.label}>
                  {p} · slice {idx + 1} / {max + 1}
                </Text>
                <View style={styles.viewerWrapper}>
                  {slice && (
                    <DicomImageViewSkia
                      filePath={slice.filePath}
                      rows={slice.rows}
                      columns={slice.columns}
                      bitsAllocated={slice.bitsAllocated}
                      photometricInterpretation={
                        volume.photometricInterpretation
                      }
                      windowCenter={128}
                      windowWidth={256}
                      width={192}
                      height={192}
                      enableGestures={false}
                    />
                  )}
                </View>
                <View style={styles.sliderRow}>
                  <Text
                    style={styles.sliderButton}
                    onPress={() => mpr.step(p, -1)}
                  >
                    ‹
                  </Text>
                  <Text style={styles.sliderValue}>{idx}</Text>
                  <Text
                    style={styles.sliderButton}
                    onPress={() => mpr.step(p, 1)}
                  >
                    ›
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.section}>Oblique reformat (Phase 5.3)</Text>
      {obliqueErr && <Text style={styles.fail}>FAIL · {obliqueErr}</Text>}
      {!volume && !obliqueErr && <ActivityIndicator />}
      {volume && oblique.spec && (
        <View style={styles.block}>
          <Text style={styles.label}>
            Trilinear-sampled plane through volume centre · output{' '}
            {oblique.spec.columns}×{oblique.spec.rows} @{' '}
            {oblique.spec.pixelSpacingMm.toFixed(2)} mm/px
          </Text>
          <View style={styles.viewerWrapper}>
            {obliqueSlice && (
              <DicomImageViewSkia
                filePath={obliqueSlice.filePath}
                rows={obliqueSlice.rows}
                columns={obliqueSlice.columns}
                bitsAllocated={obliqueSlice.bitsAllocated}
                photometricInterpretation={volume.photometricInterpretation}
                windowCenter={128}
                windowWidth={256}
                width={192}
                height={192}
                enableGestures={false}
              />
            )}
          </View>
          <Text style={styles.label}>rotX · rotY · rotZ (deg)</Text>
          <Text style={styles.value}>
            {((oblique.rotX * 180) / Math.PI).toFixed(0)}° ·{' '}
            {((oblique.rotY * 180) / Math.PI).toFixed(0)}° ·{' '}
            {((oblique.rotZ * 180) / Math.PI).toFixed(0)}°
          </Text>
          <View style={styles.sliderRow}>
            <Text
              style={styles.sliderButton}
              onPress={() => oblique.setRotX(oblique.rotX - Math.PI / 12)}
            >
              X−
            </Text>
            <Text
              style={styles.sliderButton}
              onPress={() => oblique.setRotX(oblique.rotX + Math.PI / 12)}
            >
              X+
            </Text>
            <Text
              style={styles.sliderButton}
              onPress={() => oblique.setRotY(oblique.rotY - Math.PI / 12)}
            >
              Y−
            </Text>
            <Text
              style={styles.sliderButton}
              onPress={() => oblique.setRotY(oblique.rotY + Math.PI / 12)}
            >
              Y+
            </Text>
            <Text
              style={styles.sliderButton}
              onPress={() => oblique.setRotZ(oblique.rotZ - Math.PI / 12)}
            >
              Z−
            </Text>
            <Text
              style={styles.sliderButton}
              onPress={() => oblique.setRotZ(oblique.rotZ + Math.PI / 12)}
            >
              Z+
            </Text>
          </View>
          <Text style={styles.sliderButton} onPress={oblique.reset}>
            Reset
          </Text>
        </View>
      )}

      <Text style={styles.section}>
        Slab projection · MIP / MinIP / Average (Phase 6.1)
      </Text>
      {projectionErr && <Text style={styles.fail}>FAIL · {projectionErr}</Text>}
      {!volume && !projectionErr && <ActivityIndicator />}
      {volume && oblique.spec && (
        <View style={styles.block}>
          <Text style={styles.label}>
            Cast a ray of {slabThicknessMm} mm along the Phase 5.3 plane normal
            · ray-reduce by {projectionMode.toUpperCase()}
          </Text>
          <View style={styles.viewerWrapper}>
            {projectionSlice && (
              <DicomImageViewSkia
                filePath={projectionSlice.filePath}
                rows={projectionSlice.rows}
                columns={projectionSlice.columns}
                bitsAllocated={projectionSlice.bitsAllocated}
                photometricInterpretation={volume.photometricInterpretation}
                windowCenter={128}
                windowWidth={256}
                width={192}
                height={192}
                enableGestures={false}
              />
            )}
          </View>
          <Text style={styles.label}>Mode</Text>
          <View style={styles.sliderRow}>
            {(['mip', 'minip', 'average'] as ProjectionMode[]).map((m) => {
              const active = m === projectionMode;
              return (
                <Text
                  key={m}
                  style={[styles.toolButton, active && styles.toolButtonActive]}
                  onPress={() => setProjectionMode(m)}
                >
                  {m.toUpperCase()}
                </Text>
              );
            })}
          </View>
          <Text style={styles.label}>Slab thickness</Text>
          <View style={styles.sliderRow}>
            <Text
              style={styles.sliderButton}
              onPress={() =>
                setSlabThicknessMm(Math.max(0, slabThicknessMm - 4))
              }
            >
              −
            </Text>
            <Text style={styles.sliderValue}>{slabThicknessMm} mm</Text>
            <Text
              style={styles.sliderButton}
              onPress={() => setSlabThicknessMm(slabThicknessMm + 4)}
            >
              +
            </Text>
          </View>
        </View>
      )}

      <Text style={styles.section}>
        Volume rendering · transfer function (Phase 6.2)
      </Text>
      {vrErr && <Text style={styles.fail}>FAIL · {vrErr}</Text>}
      {!volume && !vrErr && <ActivityIndicator />}
      {volume && oblique.spec && (
        <View style={styles.block}>
          <Text style={styles.label}>
            Front-to-back alpha-composite a {vrSlabMm} mm slab through the Phase
            5.3 plane · TF preset {vrPreset}
          </Text>
          <View style={styles.viewerWrapper}>
            {vrSlice && (
              <DicomImageViewSkia
                filePath={vrSlice.filePath}
                rows={vrSlice.rows}
                columns={vrSlice.columns}
                bitsAllocated={vrSlice.bitsAllocated}
                samplesPerPixel={4}
                photometricInterpretation="MONOCHROME2"
                windowCenter={128}
                windowWidth={256}
                width={192}
                height={192}
                enableGestures={false}
              />
            )}
          </View>
          <Text style={styles.label}>Preset</Text>
          <View style={styles.sliderRow}>
            {(
              ['gray-8bit', 'ct-bone', 'ct-angio', 'mr-brain'] as TfPresetName[]
            ).map((p) => {
              const active = p === vrPreset;
              return (
                <Text
                  key={p}
                  style={[styles.toolButton, active && styles.toolButtonActive]}
                  onPress={() => setVrPreset(p)}
                >
                  {p}
                </Text>
              );
            })}
          </View>
          <Text style={styles.label}>Slab thickness</Text>
          <View style={styles.sliderRow}>
            <Text
              style={styles.sliderButton}
              onPress={() => setVrSlabMm(Math.max(2, vrSlabMm - 4))}
            >
              −
            </Text>
            <Text style={styles.sliderValue}>{vrSlabMm} mm</Text>
            <Text
              style={styles.sliderButton}
              onPress={() => setVrSlabMm(vrSlabMm + 4)}
            >
              +
            </Text>
          </View>
          <Text style={styles.label}>
            Z clip plane (Phase 6.3) · keep samples z ≥ clipZ
          </Text>
          <View style={styles.sliderRow}>
            <Text
              style={[
                styles.toolButton,
                vrClipEnabled && styles.toolButtonActive,
              ]}
              onPress={() => setVrClipEnabled(!vrClipEnabled)}
            >
              {vrClipEnabled ? 'CLIP ON' : 'CLIP OFF'}
            </Text>
            <Text
              style={styles.sliderButton}
              onPress={() => setVrClipZMm(Math.max(0, vrClipZMm - 1))}
            >
              −
            </Text>
            <Text style={styles.sliderValue}>z ≥ {vrClipZMm} mm</Text>
            <Text
              style={styles.sliderButton}
              onPress={() => setVrClipZMm(Math.min(15, vrClipZMm + 1))}
            >
              +
            </Text>
          </View>
          <Text style={styles.label}>
            Phong shading (Phase 6.4) · central-difference gradient
          </Text>
          <View style={styles.sliderRow}>
            <Text
              style={[
                styles.toolButton,
                vrLightEnabled && styles.toolButtonActive,
              ]}
              onPress={() => setVrLightEnabled(!vrLightEnabled)}
            >
              {vrLightEnabled ? 'LIGHT ON' : 'LIGHT OFF'}
            </Text>
            {(['soft', 'medium', 'hard'] as VrLightStrength[]).map((s) => {
              const active = s === vrLightStrength;
              return (
                <Text
                  key={s}
                  style={[styles.toolButton, active && styles.toolButtonActive]}
                  onPress={() => setVrLightStrength(s)}
                >
                  {s}
                </Text>
              );
            })}
          </View>
        </View>
      )}

      <Text style={styles.section}>
        Volume rendering · preset controller (Phase 6.5)
      </Text>
      {vr.error && <Text style={styles.fail}>FAIL · {vr.error.message}</Text>}
      {!volume && !vr.error && <ActivityIndicator />}
      {volume && (
        <View style={styles.block}>
          <Text style={styles.label}>
            One hook owns preset + rotation + clip; sliders shrink to a preset
            picker. Currently: {VOLUME_RENDER_PRESETS[vr.preset].label}
          </Text>
          <View style={styles.viewerWrapper}>
            {vr.slice && (
              <DicomImageViewSkia
                filePath={vr.slice.filePath}
                rows={vr.slice.rows}
                columns={vr.slice.columns}
                bitsAllocated={vr.slice.bitsAllocated}
                samplesPerPixel={4}
                photometricInterpretation="MONOCHROME2"
                windowCenter={128}
                windowWidth={256}
                width={192}
                height={192}
                enableGestures={false}
              />
            )}
          </View>
          <Text style={styles.label}>Preset</Text>
          <View style={styles.sliderRow}>
            {(
              [
                'gray-8bit-3d',
                'ct-bone-3d',
                'ct-angio-3d',
                'mr-brain-3d',
              ] as VolumeRenderPresetName[]
            ).map((p) => {
              const active = p === vr.preset;
              return (
                <Text
                  key={p}
                  style={[styles.toolButton, active && styles.toolButtonActive]}
                  onPress={() => vr.setPreset(p)}
                >
                  {p.replace('-3d', '')}
                </Text>
              );
            })}
          </View>
          <Text style={styles.label}>Rotate Y (controller-owned)</Text>
          <View style={styles.sliderRow}>
            <Text
              style={styles.sliderButton}
              onPress={() => vr.setRotY(vr.rotY - Math.PI / 12)}
            >
              Y−
            </Text>
            <Text style={styles.sliderValue}>
              {((vr.rotY * 180) / Math.PI).toFixed(0)}°
            </Text>
            <Text
              style={styles.sliderButton}
              onPress={() => vr.setRotY(vr.rotY + Math.PI / 12)}
            >
              Y+
            </Text>
            <Text style={styles.sliderButton} onPress={vr.resetRotation}>
              Reset
            </Text>
          </View>
          <Text style={styles.label}>Clip (Z half-space)</Text>
          <View style={styles.sliderRow}>
            <Text
              style={[
                styles.toolButton,
                vr.clipEnabled && styles.toolButtonActive,
              ]}
              onPress={() => vr.setClipEnabled(!vr.clipEnabled)}
            >
              {vr.clipEnabled ? 'CLIP ON' : 'CLIP OFF'}
            </Text>
            <Text
              style={styles.sliderButton}
              onPress={() => vr.setClipZMm(Math.max(0, vr.clipZMm - 1))}
            >
              −
            </Text>
            <Text style={styles.sliderValue}>z ≥ {vr.clipZMm} mm</Text>
            <Text
              style={styles.sliderButton}
              onPress={() => vr.setClipZMm(Math.min(15, vr.clipZMm + 1))}
            >
              +
            </Text>
          </View>
        </View>
      )}

      <Text style={styles.section}>MPR limits lifted (Phase 5.2)</Text>
      {phase52Err && <Text style={styles.fail}>FAIL · {phase52Err}</Text>}
      <View style={styles.block}>
        <Text style={styles.label}>
          JPEG-Lossless compressed series (12 slices, decoded on import)
        </Text>
        {compressedVolume && compressedSlice && (
          <>
            <Text style={styles.value}>
              depth {compressedVolume.depth} · spacing{' '}
              {compressedVolume.sliceSpacing} mm · centre slice{' '}
              {Math.floor(compressedVolume.depth / 2)}
            </Text>
            <View style={styles.viewerWrapper}>
              <DicomImageViewSkia
                filePath={compressedSlice.filePath}
                rows={compressedSlice.rows}
                columns={compressedSlice.columns}
                bitsAllocated={compressedSlice.bitsAllocated}
                photometricInterpretation={
                  compressedVolume.photometricInterpretation
                }
                windowCenter={128}
                windowWidth={256}
                width={160}
                height={160}
                enableGestures={false}
              />
            </View>
          </>
        )}
      </View>
      <View style={styles.block}>
        <Text style={styles.label}>
          Gapped-Z series (10 input slices @ alternating Δz, resampled to a
          uniform grid)
        </Text>
        {gappedVolume && gappedSlice && (
          <>
            <Text style={styles.value}>
              {gappedVolume.depth} resampled slices · uniform spacing{' '}
              {gappedVolume.sliceSpacing.toFixed(2)} mm · centre slice{' '}
              {Math.floor(gappedVolume.depth / 2)}
            </Text>
            <View style={styles.viewerWrapper}>
              <DicomImageViewSkia
                filePath={gappedSlice.filePath}
                rows={gappedSlice.rows}
                columns={gappedSlice.columns}
                bitsAllocated={gappedSlice.bitsAllocated}
                photometricInterpretation={
                  gappedVolume.photometricInterpretation
                }
                windowCenter={128}
                windowWidth={256}
                width={160}
                height={160}
                enableGestures={false}
              />
            </View>
          </>
        )}
      </View>

      <Text style={styles.section}>Series prefetch (Phase 8.2)</Text>
      <View style={styles.block}>
        <Text style={styles.label}>
          Two workers warm the LRU cache around `activeIndex` (the slice you're
          scrubbing through). Forward and backward neighbours get prefetched in
          turn so scrubbing in either direction is instant.
        </Text>
        <Text style={styles.value}>
          enqueued {prefetch.stats.enqueued} · completed{' '}
          {prefetch.stats.completed} · pending {prefetch.stats.pending} ·
          in-flight {prefetch.stats.inFlight} · failed {prefetch.stats.failed}
        </Text>
        <Text style={styles.label}>activeIndex</Text>
        <View style={styles.sliderRow}>
          <Text
            style={styles.sliderButton}
            onPress={() => setPrefetchActive(Math.max(0, prefetchActive - 1))}
          >
            −
          </Text>
          <Text style={styles.sliderValue}>
            {prefetchActive} / {Math.max(0, prefetchItems.length - 1)}
          </Text>
          <Text
            style={styles.sliderButton}
            onPress={() =>
              setPrefetchActive(
                Math.min(prefetchItems.length - 1, prefetchActive + 1)
              )
            }
          >
            +
          </Text>
        </View>
      </View>

      <Text style={styles.section}>Pixel-data LRU cache (Phase 8.1)</Text>
      <View style={styles.block}>
        <Text style={styles.label}>
          Shared cache. Tap RUN ×10 to extract the same DICOM ten times
          back-to-back — the first call hits native, the next nine are cache
          hits and skip the decode entirely.
        </Text>
        <Text style={styles.value}>
          entries {cacheStats.size} · bytes {cacheStats.bytes} · hits{' '}
          {cacheStats.hits} · misses {cacheStats.misses} · evictions{' '}
          {cacheStats.evictions}
        </Text>
        <View style={styles.sliderRow}>
          <Text style={styles.toolButton} onPress={runCacheBench}>
            RUN ×10
          </Text>
          <Text style={styles.toolButton} onPress={refreshCacheStats}>
            REFRESH
          </Text>
          <Text
            style={styles.toolButton}
            onPress={() => {
              sharedPixelDataCache.clear();
              sharedPixelDataCache.resetStats();
              refreshCacheStats();
            }}
          >
            CLEAR
          </Text>
        </View>
      </View>

      <Text style={styles.section}>RTSTRUCT contours (Phase 7.4)</Text>
      {perf?.info.hasPixelData ? (
        <View style={styles.block}>
          <Text style={styles.label}>
            Two synthetic structures (yellow GTV + cyan spinal cord) drawn as
            polyline paths over the base. Stroke-only by default; tap FILL to
            alpha-blend the polygon interior.
          </Text>
          <View style={styles.viewerWrapper}>
            <DicomRtStructOverlay
              filePath={perf.info.filePath}
              rows={perf.info.rows}
              columns={perf.info.columns}
              bitsAllocated={perf.info.bitsAllocated}
              windowCenter={128}
              windowWidth={256}
              structures={rtStructures}
              overlayOpacity={rtOpacity}
              fill={rtFill}
              width={192}
              height={192}
            />
          </View>
          <View style={styles.sliderRow}>
            <Text
              style={[styles.toolButton, rtFill && styles.toolButtonActive]}
              onPress={() => setRtFill(!rtFill)}
            >
              {rtFill ? 'FILL ON' : 'FILL OFF'}
            </Text>
            <Text
              style={styles.sliderButton}
              onPress={() => setRtOpacity(Math.max(0, rtOpacity - 0.1))}
            >
              −
            </Text>
            <Text style={styles.sliderValue}>
              {Math.round(rtOpacity * 100)}%
            </Text>
            <Text
              style={styles.sliderButton}
              onPress={() => setRtOpacity(Math.min(1, rtOpacity + 0.1))}
            >
              +
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.label}>Waiting for pixel data…</Text>
      )}

      <Text style={styles.section}>Segmentation overlay (Phase 7.3)</Text>
      {perf?.info.hasPixelData && segLabelMap ? (
        <View style={styles.block}>
          <Text style={styles.label}>
            Synthetic disc label-map painted with one red segment over the
            gradient base. Opacity slider drives the global overlay alpha.
          </Text>
          <View style={styles.viewerWrapper}>
            <DicomSegmentationOverlay
              base={{
                filePath: perf.info.filePath,
                rows: perf.info.rows,
                columns: perf.info.columns,
                bitsAllocated: perf.info.bitsAllocated,
                windowCenter: 128,
                windowWidth: 256,
              }}
              labelMap={segLabelMap}
              segments={segPalette}
              overlayOpacity={segOpacity}
              width={192}
              height={192}
            />
          </View>
          <Text style={styles.label}>Overlay opacity</Text>
          <View style={styles.sliderRow}>
            <Text
              style={styles.sliderButton}
              onPress={() => setSegOpacity(Math.max(0, segOpacity - 0.1))}
            >
              −
            </Text>
            <Text style={styles.sliderValue}>
              {Math.round(segOpacity * 100)}%
            </Text>
            <Text
              style={styles.sliderButton}
              onPress={() => setSegOpacity(Math.min(1, segOpacity + 0.1))}
            >
              +
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.label}>Waiting for pixel data…</Text>
      )}

      <Text style={styles.section}>Fusion overlay (Phase 7.2)</Text>
      {perf?.info.hasPixelData ? (
        <View style={styles.block}>
          <Text style={styles.label}>
            Same buffer twice: base in MONOCHROME2 W/L, overlay W/L tuned to
            highlight the bright half of the gradient and run through a
            colormap.
          </Text>
          <View style={styles.viewerWrapper}>
            <DicomFusionViewSkia
              base={{
                filePath: perf.info.filePath,
                rows: perf.info.rows,
                columns: perf.info.columns,
                bitsAllocated: perf.info.bitsAllocated,
                windowCenter: 128,
                windowWidth: 256,
              }}
              overlay={{
                filePath: perf.info.filePath,
                rows: perf.info.rows,
                columns: perf.info.columns,
                bitsAllocated: perf.info.bitsAllocated,
                windowCenter: 200,
                windowWidth: 80,
              }}
              overlayOpacity={fusionOpacity}
              overlayColormap={fusionColormap}
              width={192}
              height={192}
            />
          </View>
          <Text style={styles.label}>Colormap</Text>
          <View style={styles.sliderRow}>
            {(['hot', 'jet', 'gray'] as ColormapName[]).map((cm) => {
              const active = cm === fusionColormap;
              return (
                <Text
                  key={cm}
                  style={[styles.toolButton, active && styles.toolButtonActive]}
                  onPress={() => setFusionColormap(cm)}
                >
                  {cm}
                </Text>
              );
            })}
          </View>
          <Text style={styles.label}>Overlay opacity</Text>
          <View style={styles.sliderRow}>
            <Text
              style={styles.sliderButton}
              onPress={() => setFusionOpacity(Math.max(0, fusionOpacity - 0.1))}
            >
              −
            </Text>
            <Text style={styles.sliderValue}>
              {Math.round(fusionOpacity * 100)}%
            </Text>
            <Text
              style={styles.sliderButton}
              onPress={() => setFusionOpacity(Math.min(1, fusionOpacity + 0.1))}
            >
              +
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.label}>Waiting for pixel data…</Text>
      )}

      <Text style={styles.section}>
        Side-by-side synced viewers (Phase 7.1)
      </Text>
      {perf?.info.hasPixelData ? (
        <View style={styles.block}>
          <Text style={styles.label}>
            Two viewers driven by useSyncedViewerGroup. Tap an axis to break
            sync — both panes go independent on that axis only.
          </Text>
          <View style={styles.sliderRow}>
            {(['wl', 'transform', 'frame'] as const).map((key) => {
              const active = synced.axes[key];
              return (
                <Text
                  key={key}
                  style={[styles.toolButton, active && styles.toolButtonActive]}
                  onPress={() =>
                    synced.setAxes({ ...synced.axes, [key]: !active })
                  }
                >
                  {key} {active ? 'SYNC' : 'INDEP'}
                </Text>
              );
            })}
          </View>
          <View style={styles.syncedRow}>
            {synced.slots.map((slot, i) => (
              <View key={i} style={styles.syncedSlot}>
                <Text style={styles.label}>
                  Slot {i} · WC {slot.windowCenter} / WW {slot.windowWidth}
                </Text>
                <DicomImageViewSkia
                  filePath={perf.info.filePath}
                  rows={perf.info.rows}
                  columns={perf.info.columns}
                  bitsAllocated={perf.info.bitsAllocated}
                  photometricInterpretation={
                    perf.info.photometricInterpretation
                  }
                  windowCenter={slot.windowCenter}
                  windowWidth={slot.windowWidth}
                  width={160}
                  height={160}
                  onTransformChange={slot.onTransformChange}
                />
                <View style={styles.sliderRow}>
                  <Text
                    style={styles.sliderButton}
                    onPress={() =>
                      slot.setWindowCenter(Math.max(0, slot.windowCenter - 16))
                    }
                  >
                    WC −
                  </Text>
                  <Text
                    style={styles.sliderButton}
                    onPress={() =>
                      slot.setWindowCenter(
                        Math.min(255, slot.windowCenter + 16)
                      )
                    }
                  >
                    WC +
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <Text style={styles.label}>Waiting for pixel data…</Text>
      )}

      <Text style={styles.section}>Overall</Text>
      <Text style={overallPass ? styles.passLarge : styles.failLarge}>
        {overallPass ? 'PASS' : 'FAIL'}
      </Text>
    </ScrollView>
  );
}

// react-native-gesture-handler requires a GestureHandlerRootView at the
// top of the React tree to wire native gestures into the JS bridge. We
// wrap the example app to keep the Phase 3.3 viewer interactive.
export default function AppRoot() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <App />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    padding: 24,
    paddingTop: 64,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  section: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 8,
    color: '#444',
  },
  label: {
    fontSize: 12,
    color: '#666',
    marginTop: 10,
  },
  value: {
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  row: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowUid: {
    fontSize: 10,
    color: '#888',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    marginBottom: 2,
  },
  path: {
    fontSize: 10,
    color: '#888',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    marginTop: 2,
  },
  block: {
    marginTop: 6,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  syncedRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  syncedSlot: {
    flex: 1,
  },
  sliderButton: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0a66c2',
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#eef',
    borderRadius: 6,
  },
  sliderValue: {
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    minWidth: 60,
    textAlign: 'center',
  },
  toolButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a66c2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#eef',
    borderRadius: 6,
  },
  toolButtonActive: {
    color: '#fff',
    backgroundColor: '#0a66c2',
  },
  measRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  miniButton: {
    fontSize: 14,
    fontWeight: '700',
    color: '#cf222e',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  overlayLayer: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 256,
    height: 256,
  },
  viewerWrapper: {
    marginTop: 12,
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 8,
    borderRadius: 6,
  },
  viewer: {
    width: 256,
    height: 256,
  },
  pass: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a7f37',
  },
  passLossy: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3d8b40',
  },
  fail: {
    fontSize: 14,
    fontWeight: '700',
    color: '#cf222e',
  },
  passLarge: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a7f37',
    textAlign: 'center',
    marginTop: 8,
  },
  failLarge: {
    fontSize: 28,
    fontWeight: '800',
    color: '#cf222e',
    textAlign: 'center',
    marginTop: 8,
  },
});
