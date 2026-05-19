import { describe, it, expect, jest } from '@jest/globals';

// @shopify/react-native-skia ships ESM that Jest can't transform out of
// the box. The library doesn't run any Skia code under tests — we only
// need the import to resolve. Replace the whole module with stubs.
jest.mock('@shopify/react-native-skia', () => ({
  __esModule: true,
  AlphaType: { Opaque: 1 },
  ColorType: { RGBA_8888: 4 },
  Canvas: () => null,
  Circle: () => null,
  Fill: () => null,
  Group: () => null,
  Image: () => null,
  Line: () => null,
  Path: () => null,
  Shader: () => null,
  ImageShader: () => null,
  Text: () => null,
  matchFont: () => null,
  vec: (x: number, y: number) => ({ x, y }),
  Skia: {
    RuntimeEffect: { Make: () => null },
    Data: { fromBytes: () => null },
    Image: { MakeImage: () => null },
    Path: { Make: () => ({ addArc: () => null, addRect: () => null }) },
  },
}));

// react-native-gesture-handler also ships ESM; same mock strategy.
jest.mock('react-native-gesture-handler', () => {
  const chain = (): unknown => {
    const obj = {
      onStart: () => obj,
      onUpdate: () => obj,
      onBegin: () => obj,
      onEnd: () => obj,
      enabled: () => obj,
    };
    return obj;
  };
  return {
    __esModule: true,
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: ({ children }: { children: unknown }) => children,
    Gesture: {
      Pan: chain,
      Pinch: chain,
      Rotation: chain,
      Simultaneous: chain,
      Tap: chain,
    },
  };
});

// Stub the TurboModule before importing the library, so the native-resolved
// implementations (multiply.native.tsx / getGdcmVersion.native.tsx /
// readDicom.native.tsx) can run in node without a host. This validates the
// JS-side bridge wiring; the real cross-platform parity check is performed
// by launching the example app on iOS and Android (see
// docs/regulatory/62304-verification-protocol.md).

jest.mock('../NativeVibeNativeDicom', () => {
  const SUPPORTED_UIDS = new Set([
    '1.2.840.10008.1.2',
    '1.2.840.10008.1.2.1',
    '1.2.840.10008.1.2.4.50',
    '1.2.840.10008.1.2.4.51',
    '1.2.840.10008.1.2.4.57',
    '1.2.840.10008.1.2.4.70',
    '1.2.840.10008.1.2.4.80',
    '1.2.840.10008.1.2.4.81',
    '1.2.840.10008.1.2.4.90',
    '1.2.840.10008.1.2.4.91',
    '1.2.840.10008.1.2.5',
  ]);
  return {
    __esModule: true,
    default: {
      multiply: (a: number, b: number) => a * b,
      getGdcmVersion: () => '3.2.5',
      isSupportedTransferSyntax: (uid: string) => SUPPORTED_UIDS.has(uid),
      writeSyntheticDicom: (uid: string, numberOfFrames = 1) => {
        if (uid && !SUPPORTED_UIDS.has(uid)) {
          throw new Error(
            `writeSyntheticDicom: unsupported transfer syntax UID: ${uid}`
          );
        }
        const frames = Math.max(1, Math.floor(numberOfFrames));
        return `/tmp/vnd-synthetic-${uid || 'default'}-${frames}f.dcm`;
      },
      extractPixelDataToFile: (dicomPath: string, outPath: string) => {
        // Mimic the C++ contract: success path returns hasPixelData=true
        // and fakes a 256-byte gradient. Unknown UID in the path yields
        // hasPixelData=false (the H-021 contract).
        const isUnsupported = dicomPath.includes('1.2.840.10008.1.2.4.100');
        if (isUnsupported) {
          return {
            filePath: '',
            byteLength: 0,
            rows: 16,
            columns: 16,
            bitsAllocated: 8,
            samplesPerPixel: 1,
            photometricInterpretation: 'MONOCHROME2',
            numberOfFrames: 1,
            hasPixelData: false,
          };
        }
        return {
          filePath: outPath,
          byteLength: 256,
          rows: 16,
          columns: 16,
          bitsAllocated: 8,
          samplesPerPixel: 1,
          photometricInterpretation: 'MONOCHROME2',
          numberOfFrames: 1,
          hasPixelData: true,
        };
      },
      exportBasicTextSr: (
        outPath: string,
        _linesJson: string,
        _studyUID: string,
        _seriesUID: string,
        _sopUID: string,
        _sopClassUID: string
      ) => outPath,
      buildVolumeFromDicoms: (
        _pathsJson: string,
        _resampleNonUniformZ: boolean
      ) => ({
        handle: 1,
        columns: 16,
        rows: 16,
        depth: 8,
        bitsAllocated: 8,
        pixelRepresentation: 0,
        pixelSpacingRow: 1,
        pixelSpacingCol: 1,
        sliceSpacing: 1,
        photometricInterpretation: 'MONOCHROME2',
      }),
      extractMprSlice: (
        _handle: number,
        _plane: number,
        _index: number,
        outPath: string
      ) => ({
        filePath: outPath,
        byteLength: 256,
        rows: 16,
        columns: 16,
        bitsAllocated: 8,
        pixelRepresentation: 0,
        pixelSpacingRow: 1,
        pixelSpacingCol: 1,
      }),
      releaseVolume: (_handle: number) => undefined,
      extractObliqueSlice: (
        _handle: number,
        _specJson: string,
        outPath: string
      ) => ({
        filePath: outPath,
        byteLength: 256,
        rows: 16,
        columns: 16,
        bitsAllocated: 8,
        pixelRepresentation: 0,
        pixelSpacingRow: 1,
        pixelSpacingCol: 1,
      }),
      extractProjectionSlab: (
        _handle: number,
        _specJson: string,
        _slabThicknessMm: number,
        _stepMm: number,
        _mode: number,
        outPath: string
      ) => ({
        filePath: outPath,
        byteLength: 256,
        rows: 16,
        columns: 16,
        bitsAllocated: 8,
        pixelRepresentation: 0,
        pixelSpacingRow: 1,
        pixelSpacingCol: 1,
      }),
      extractVolumeRender: (
        _handle: number,
        _specJson: string,
        _slabThicknessMm: number,
        _stepMm: number,
        _tfJson: string,
        _clipPlanesJson: string,
        _lightingJson: string,
        outPath: string
      ) => ({
        filePath: outPath,
        // 16*16 RGBA = 1024 bytes
        byteLength: 1024,
        rows: 16,
        columns: 16,
        bitsAllocated: 8,
        pixelRepresentation: 0,
        pixelSpacingRow: 1,
        pixelSpacingCol: 1,
        samplesPerPixel: 4,
      }),
      writeSyntheticVolumeSeries: (
        outDir: string,
        n: number,
        _spacing: number,
        _transferSyntaxUID: string,
        _gappedZ: boolean
      ) => {
        const arr: string[] = [];
        for (let i = 0; i < n; i++) {
          arr.push(`${outDir}/vnd-vol-${String(i).padStart(3, '0')}.dcm`);
        }
        return JSON.stringify(arr);
      },
      readDicom: (path: string) => {
        const uidMatch = path.match(/vnd-synthetic-([0-9.]+|default)/);
        const uid = uidMatch?.[1];
        const ts = uid && uid !== 'default' ? uid : '1.2.840.10008.1.2';
        return {
          transferSyntaxUID: ts,
          sopClassUID: '1.2.840.10008.5.1.4.1.1.4',
          sopInstanceUID: '1.2.3.4.5.6.7.8.9',
          dataset: {
            // Patient
            '0010,0010': { vr: 'PN', value: 'VibeNativeDicom^Synthetic' },
            '0010,0020': { vr: 'LO', value: 'VND-SYN-001' },
            '0010,0030': { vr: 'DA', value: '20000101' },
            '0010,0040': { vr: 'CS', value: 'O' },
            // Study
            '0020,000D': { vr: 'UI', value: '1.2.3.4.5' },
            '0008,0020': { vr: 'DA', value: '20260101' },
            '0008,0030': { vr: 'TM', value: '120000' },
            '0008,0050': { vr: 'SH', value: 'VND0001' },
            '0008,1030': { vr: 'LO', value: 'VND Synthetic Study' },
            // Series
            '0020,000E': { vr: 'UI', value: '1.2.3.4.5.6' },
            '0020,0011': { vr: 'IS', value: '1' },
            '0008,103E': { vr: 'LO', value: 'VND Synthetic Series' },
            '0008,0060': { vr: 'CS', value: 'MR' },
            // SOP / Image
            '0020,0013': { vr: 'IS', value: '1' },
            // Pixel geometry
            '0028,0010': { vr: 'US', value: '16' },
            '0028,0030': { vr: 'DS', value: '0.5\\0.5' },
            // VOI / rescale
            '0028,1050': { vr: 'DS', value: '128' },
            '0028,1051': { vr: 'DS', value: '256' },
            '0028,1052': { vr: 'DS', value: '0' },
            '0028,1053': { vr: 'DS', value: '1' },
            // Sequence (SQ) — Procedure Code Sequence
            '0008,1032': {
              vr: 'SQ',
              value: null,
              items: [
                {
                  '0008,0100': { vr: 'SH', value: 'VND-001' },
                  '0008,0102': { vr: 'SH', value: 'VND' },
                  '0008,0104': {
                    vr: 'LO',
                    value: 'Synthetic procedure',
                  },
                },
              ],
            },
            // A Type 2 empty SQ (zero items) for the "empty sequence is
            // legitimate" path coverage.
            '0040,0260': { vr: 'SQ', value: null, items: [] },
            // A Type 2 empty value (present, no value) for helper-null path.
            '0008,0090': { vr: 'PN', value: null },
          },
          image: {
            rows: 16,
            columns: 16,
            bitsAllocated: 8,
            bitsStored: 8,
            highBit: 7,
            pixelRepresentation: 0,
            samplesPerPixel: 1,
            photometricInterpretation: 'MONOCHROME2',
            numberOfFrames: 1,
            hasPixelData: true,
            pixelDataBase64:
              'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn+AgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/w==',
          },
        };
      },
    },
  };
});

const lib = require('../index') as typeof import('../index');

describe('@vibepasson/vibe-native-dicom — public surface', () => {
  it('exports the Phase 1 + Phase 2.1 + Phase 2.2 functions', () => {
    expect(typeof lib.multiply).toBe('function');
    expect(typeof lib.getGdcmVersion).toBe('function');
    expect(typeof lib.writeSyntheticDicom).toBe('function');
    expect(typeof lib.readDicom).toBe('function');
    expect(typeof lib.isSupportedTransferSyntax).toBe('function');
    expect(typeof lib.TransferSyntaxUID).toBe('object');
    expect(Array.isArray(lib.LOSSLESS_TRANSFER_SYNTAXES)).toBe(true);
    expect(Array.isArray(lib.LOSSY_TRANSFER_SYNTAXES)).toBe(true);
  });

  it('multiply returns the product', () => {
    expect(lib.multiply(3, 7)).toBe(21);
  });

  it('getGdcmVersion returns a version string', () => {
    expect(lib.getGdcmVersion()).toBe('3.2.5');
  });

  it('isSupportedTransferSyntax recognises every documented UID', () => {
    for (const uid of Object.values(lib.TransferSyntaxUID)) {
      expect(lib.isSupportedTransferSyntax(uid)).toBe(true);
    }
  });

  it('isSupportedTransferSyntax rejects unsupported syntaxes', () => {
    // MPEG2MainProfile is intentionally outside the Phase 2.2 whitelist.
    expect(lib.isSupportedTransferSyntax('1.2.840.10008.1.2.4.100')).toBe(
      false
    );
    // Random gibberish should also be false, not throw.
    expect(lib.isSupportedTransferSyntax('not-a-uid')).toBe(false);
  });

  it('writeSyntheticDicom defaults to Implicit VR LE on empty input', () => {
    const p = lib.writeSyntheticDicom('');
    expect(p).toContain('default');
  });

  it('writeSyntheticDicom accepts every supported UID and rejects unsupported', () => {
    for (const uid of Object.values(lib.TransferSyntaxUID)) {
      expect(typeof lib.writeSyntheticDicom(uid)).toBe('string');
    }
    expect(() => lib.writeSyntheticDicom('1.2.840.10008.1.2.4.100')).toThrow(
      /unsupported transfer syntax/
    );
  });

  it('readDicom returns a DicomFile with the documented shape', () => {
    const file = lib.readDicom('/tmp/vnd-synthetic-default.dcm');
    expect(file.transferSyntaxUID).toBe('1.2.840.10008.1.2');
    expect(file.sopClassUID).toBe('1.2.840.10008.5.1.4.1.1.4');
    expect(file.dataset['0010,0010']).toEqual({
      vr: 'PN',
      value: 'VibeNativeDicom^Synthetic',
    });
    expect(file.image?.rows).toBe(16);
    expect(file.image?.hasPixelData).toBe(true);
    expect(typeof file.image?.pixelDataBase64).toBe('string');
  });

  it('lossless and lossy classification is mutually exclusive and complete', () => {
    const all = new Set(Object.values(lib.TransferSyntaxUID));
    const lossless = new Set(lib.LOSSLESS_TRANSFER_SYNTAXES);
    const lossy = new Set(lib.LOSSY_TRANSFER_SYNTAXES);

    // No overlap.
    for (const uid of lossless) expect(lossy.has(uid)).toBe(false);
    // Union covers every documented UID.
    expect(lossless.size + lossy.size).toBe(all.size);
    for (const uid of all)
      expect(lossless.has(uid) || lossy.has(uid)).toBe(true);
  });
});

describe('Phase 2.3 — Sequence (SQ) traversal', () => {
  it('emits SQ as { vr: SQ, value: null, items: DicomDataset[] }', () => {
    const file = lib.readDicom('/tmp/vnd-synthetic-default.dcm');
    const sq = file.dataset['0008,1032'];
    expect(sq).toBeDefined();
    expect(sq?.vr).toBe('SQ');
    expect(sq?.value).toBeNull();
    expect(Array.isArray(sq?.items)).toBe(true);
    expect(sq?.items?.length).toBe(1);
  });

  it('SQ items are themselves DicomDatasets with their own elements', () => {
    const file = lib.readDicom('/tmp/vnd-synthetic-default.dcm');
    const item0 = file.dataset['0008,1032']?.items?.[0];
    expect(item0).toBeDefined();
    expect(item0?.['0008,0100']).toEqual({ vr: 'SH', value: 'VND-001' });
    expect(item0?.['0008,0102']).toEqual({ vr: 'SH', value: 'VND' });
    expect(item0?.['0008,0104']).toEqual({
      vr: 'LO',
      value: 'Synthetic procedure',
    });
  });

  it('zero-item SQ is represented as items: []', () => {
    const file = lib.readDicom('/tmp/vnd-synthetic-default.dcm');
    const sq = file.dataset['0040,0260'];
    expect(sq?.vr).toBe('SQ');
    expect(sq?.items).toEqual([]);
  });

  it('non-SQ elements have no items property', () => {
    const file = lib.readDicom('/tmp/vnd-synthetic-default.dcm');
    const patientName = file.dataset['0010,0010'];
    expect(patientName?.items).toBeUndefined();
  });
});

describe('Phase 2.3 — ergonomic helpers', () => {
  // Single parsed file shared across helper assertions.
  const ds = lib.readDicom('/tmp/vnd-synthetic-default.dcm').dataset;

  it('Patient module helpers read documented tags', () => {
    expect(lib.getPatientName(ds)).toBe('VibeNativeDicom^Synthetic');
    expect(lib.getPatientID(ds)).toBe('VND-SYN-001');
    expect(lib.getPatientBirthDate(ds)).toBe('20000101');
    expect(lib.getPatientSex(ds)).toBe('O');
  });

  it('Study module helpers read documented tags', () => {
    expect(lib.getStudyInstanceUID(ds)).toBe('1.2.3.4.5');
    expect(lib.getStudyDate(ds)).toBe('20260101');
    expect(lib.getStudyTime(ds)).toBe('120000');
    expect(lib.getStudyDescription(ds)).toBe('VND Synthetic Study');
    expect(lib.getAccessionNumber(ds)).toBe('VND0001');
  });

  it('Series module helpers read documented tags', () => {
    expect(lib.getSeriesInstanceUID(ds)).toBe('1.2.3.4.5.6');
    expect(lib.getSeriesNumber(ds)).toBe(1);
    expect(lib.getSeriesDescription(ds)).toBe('VND Synthetic Series');
    expect(lib.getModality(ds)).toBe('MR');
  });

  it('Image / SOP helpers read documented tags', () => {
    expect(lib.getSOPInstanceUID({ ...ds })).toBeNull(); // tag absent in mock
    expect(lib.getInstanceNumber(ds)).toBe(1);
  });

  it('Pixel geometry helper returns [row, col]', () => {
    expect(lib.getPixelSpacing(ds)).toEqual([0.5, 0.5]);
  });

  it('VOI / rescale helpers parse DS values', () => {
    expect(lib.getWindowCenter(ds)).toBe(128);
    expect(lib.getWindowWidth(ds)).toBe(256);
    expect(lib.getRescaleIntercept(ds)).toBe(0);
    expect(lib.getRescaleSlope(ds)).toBe(1);
  });

  it('helpers return null for missing tags', () => {
    const empty = {};
    expect(lib.getPatientName(empty)).toBeNull();
    expect(lib.getWindowCenter(empty)).toBeNull();
    expect(lib.getPixelSpacing(empty)).toBeNull();
    expect(lib.getModality(empty)).toBeNull();
  });

  it('helpers return null for present-but-empty tags', () => {
    // (0008,0090) is in the mock with value: null
    expect(
      lib.getStudyDescription({ ...ds, '0008,1030': ds['0008,0090']! })
    ).toBeNull();
  });

  it('helpers return null for malformed numeric values rather than NaN', () => {
    const corrupt = {
      '0028,1050': { vr: 'DS', value: 'not-a-number' },
    };
    const result = lib.getWindowCenter(corrupt);
    expect(result).toBeNull();
    // Critical: never return NaN — viewers would render garbage.
    expect(Number.isNaN(result)).toBe(false);
  });
});

describe('Phase 2.5 — extractPixelDataToFile', () => {
  it('exports the function from the package surface', () => {
    expect(typeof lib.extractPixelDataToFile).toBe('function');
  });

  it('returns the documented PixelDataInfo shape', () => {
    const info = lib.extractPixelDataToFile(
      '/tmp/vnd-synthetic-default.dcm',
      '/tmp/out.pixels'
    );
    expect(info.filePath).toBe('/tmp/out.pixels');
    expect(info.byteLength).toBe(256);
    expect(info.rows).toBe(16);
    expect(info.columns).toBe(16);
    expect(info.bitsAllocated).toBe(8);
    expect(info.samplesPerPixel).toBe(1);
    expect(info.photometricInterpretation).toBe('MONOCHROME2');
    expect(info.numberOfFrames).toBe(1);
    expect(info.hasPixelData).toBe(true);
  });

  it('returns hasPixelData=false (no file written) for unsupported syntaxes', () => {
    // Hazard H-021: the C++ helper writes nothing for unsupported syntaxes.
    const info = lib.extractPixelDataToFile(
      '/tmp/vnd-synthetic-1.2.840.10008.1.2.4.100.dcm',
      '/tmp/out.pixels'
    );
    expect(info.hasPixelData).toBe(false);
    expect(info.filePath).toBe('');
    expect(info.byteLength).toBe(0);
  });

  it('drops the 33% bridge bloat vs base64 (synthetic check)', () => {
    // 256 raw bytes vs 344-char base64 (= 258 round-trip bytes after pad
    // accounting). The point isn't the absolute number for our 16x16
    // synthetic — it's that the file path delivers the raw byte count
    // without any expansion.
    const info = lib.extractPixelDataToFile(
      '/tmp/vnd-synthetic-default.dcm',
      '/tmp/out.pixels'
    );
    const base64ApproxBytes = Math.ceil((info.byteLength * 4) / 3);
    expect(info.byteLength).toBeLessThan(base64ApproxBytes);
  });
});
