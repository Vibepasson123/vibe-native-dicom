import { describe, it, expect, jest } from '@jest/globals';

// Stub the TurboModule before importing the library, so the native-resolved
// implementations (multiply.native.tsx / getGdcmVersion.native.tsx) can run
// in node without a host. This validates the JS-side bridge wiring; the
// real cross-platform parity check is performed by launching the example
// app on iOS and Android (see docs/regulatory/62304-verification-protocol.md).
jest.mock('../NativeVibeNativeDicom', () => ({
  __esModule: true,
  default: {
    multiply: (a: number, b: number) => a * b,
    getGdcmVersion: () => '3.2.5',
  },
}));

const lib = require('../index') as typeof import('../index');

describe('@viveksah/vibe-native-dicom — public surface', () => {
  it('exports multiply and getGdcmVersion', () => {
    expect(typeof lib.multiply).toBe('function');
    expect(typeof lib.getGdcmVersion).toBe('function');
  });

  it('multiply delegates to the native module and returns the product', () => {
    expect(lib.multiply(3, 7)).toBe(21);
    expect(lib.multiply(0, 100)).toBe(0);
    expect(lib.multiply(-2, 3)).toBe(-6);
  });

  it('getGdcmVersion delegates to the native module and returns a string', () => {
    expect(lib.getGdcmVersion()).toBe('3.2.5');
  });
});
