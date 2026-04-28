import { describe, it, expect, jest } from '@jest/globals';

// Stub the TurboModule before importing the library, so the native-resolved
// implementations (multiply.native.tsx / getGdcmVersion.native.tsx /
// readDicom.native.tsx) can run in node without a host. This validates the
// JS-side bridge wiring; the real cross-platform parity check is performed
// by launching the example app on iOS and Android (see
// docs/regulatory/62304-verification-protocol.md).
jest.mock('../NativeVibeNativeDicom', () => ({
  __esModule: true,
  default: {
    multiply: (a: number, b: number) => a * b,
    getGdcmVersion: () => '3.2.5',
    writeSyntheticDicom: () => '/tmp/vnd-synthetic.dcm',
    readDicom: (_path: string) => ({
      transferSyntaxUID: '1.2.840.10008.1.2',
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
        pixelDataBase64: 'gICAgICAgICAgICAgICAgA==',
      },
    }),
  },
}));

const lib = require('../index') as typeof import('../index');

describe('@viveksah/vibe-native-dicom — public surface', () => {
  it('exports the Phase 1 + Phase 2.1 functions', () => {
    expect(typeof lib.multiply).toBe('function');
    expect(typeof lib.getGdcmVersion).toBe('function');
    expect(typeof lib.writeSyntheticDicom).toBe('function');
    expect(typeof lib.readDicom).toBe('function');
  });

  it('multiply returns the product', () => {
    expect(lib.multiply(3, 7)).toBe(21);
  });

  it('getGdcmVersion returns a version string', () => {
    expect(lib.getGdcmVersion()).toBe('3.2.5');
  });

  it('writeSyntheticDicom returns a non-empty path', () => {
    const p = lib.writeSyntheticDicom();
    expect(typeof p).toBe('string');
    expect(p.length).toBeGreaterThan(0);
  });

  it('readDicom returns a DicomFile with the documented shape', () => {
    const file = lib.readDicom('/tmp/vnd-synthetic.dcm');

    expect(file.transferSyntaxUID).toBe('1.2.840.10008.1.2');
    expect(file.sopClassUID).toBe('1.2.840.10008.5.1.4.1.1.4');
    expect(typeof file.sopInstanceUID).toBe('string');

    expect(file.dataset).toBeDefined();
    expect(file.dataset['0010,0010']).toEqual({
      vr: 'PN',
      value: 'VibeNativeDicom^Synthetic',
    });

    expect(file.image).not.toBeNull();
    if (file.image) {
      expect(file.image.rows).toBe(16);
      expect(file.image.columns).toBe(16);
      expect(file.image.bitsAllocated).toBe(8);
      expect(file.image.photometricInterpretation).toBe('MONOCHROME2');
      expect(file.image.hasPixelData).toBe(true);
      expect(typeof file.image.pixelDataBase64).toBe('string');
    }
  });
});
