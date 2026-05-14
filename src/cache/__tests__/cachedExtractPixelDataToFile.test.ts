import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the native TurboModule so the cache wrapper can call
// extractPixelDataToFile under node without a host.
jest.mock('../../NativeVibeNativeDicom', () => {
  let calls = 0;
  return {
    __esModule: true,
    __getCalls: () => calls,
    __resetCalls: () => {
      calls = 0;
    },
    default: {
      extractPixelDataToFile: (_dicomPath: string, outPath: string) => {
        calls += 1;
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
    },
  };
});

import { cachedExtractPixelDataToFile } from '../cachedExtractPixelDataToFile';
import { PixelDataCache } from '../pixelDataCache';

const native = require('../../NativeVibeNativeDicom') as {
  __getCalls: () => number;
  __resetCalls: () => void;
};

describe('Phase 8.1 — cachedExtractPixelDataToFile', () => {
  beforeEach(() => {
    native.__resetCalls();
  });

  it('first call hits native; second call returns from cache', () => {
    const cache = new PixelDataCache();
    const a = cachedExtractPixelDataToFile('/a.dcm', '/a.pixels', { cache });
    const b = cachedExtractPixelDataToFile('/a.dcm', '/a.pixels', { cache });
    expect(a.byteLength).toBe(256);
    expect(b.byteLength).toBe(256);
    expect(native.__getCalls()).toBe(1);
    expect(cache.stats().hits).toBe(1);
    expect(cache.stats().misses).toBe(1);
  });

  it('different (dicomPath, outPath) tuples each trigger native', () => {
    const cache = new PixelDataCache();
    cachedExtractPixelDataToFile('/a.dcm', '/a.pixels', { cache });
    cachedExtractPixelDataToFile('/b.dcm', '/b.pixels', { cache });
    expect(native.__getCalls()).toBe(2);
    expect(cache.stats().size).toBe(2);
  });

  it('bypassRead=true skips the cache lookup but stores the new value', () => {
    const cache = new PixelDataCache();
    cachedExtractPixelDataToFile('/a.dcm', '/a.pixels', { cache });
    cachedExtractPixelDataToFile('/a.dcm', '/a.pixels', {
      cache,
      bypassRead: true,
    });
    expect(native.__getCalls()).toBe(2);
    // Result is still cached for the next lookup.
    cachedExtractPixelDataToFile('/a.dcm', '/a.pixels', { cache });
    expect(native.__getCalls()).toBe(2);
  });
});
