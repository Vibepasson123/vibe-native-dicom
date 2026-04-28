import { describe, it, expect, jest } from '@jest/globals';

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
      writeSyntheticDicom: (uid: string) => {
        if (uid && !SUPPORTED_UIDS.has(uid)) {
          throw new Error(
            `writeSyntheticDicom: unsupported transfer syntax UID: ${uid}`
          );
        }
        return `/tmp/vnd-synthetic-${uid || 'default'}.dcm`;
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
            '0010,0010': { vr: 'PN', value: 'VibeNativeDicom^Synthetic' },
            '0028,0010': { vr: 'US', value: '16' },
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

describe('@viveksah/vibe-native-dicom — public surface', () => {
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
