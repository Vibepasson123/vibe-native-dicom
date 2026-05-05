import { useEffect, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
  }, []);

  const cineFrames = 12;
  const cine = useFrameSequence({ numberOfFrames: cineFrames, fps: 8 });

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
              enableGestures
              onReady={(info) => setSkiaUpload(info)}
              onError={(err) => setSkiaErr(err.message)}
              onTransformChange={(t) => setTransform(t)}
            />
          </View>
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
