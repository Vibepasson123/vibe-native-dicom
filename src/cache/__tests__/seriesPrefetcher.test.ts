import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the native module so the cache wrapper can call into it under
// node. Track call order so we can assert the prefetcher's priority
// math drives the right sequence of decodes.
jest.mock('../../NativeVibeNativeDicom', () => {
  const calls: string[] = [];
  return {
    __esModule: true,
    __getCalls: () => calls,
    __resetCalls: () => {
      calls.length = 0;
    },
    default: {
      extractPixelDataToFile: (dicomPath: string, outPath: string) => {
        calls.push(dicomPath);
        return {
          filePath: outPath,
          byteLength: 64,
          rows: 8,
          columns: 8,
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

import {
  prioritizeWindow,
  SeriesPrefetcher,
  type PrefetchItem,
} from '../seriesPrefetcher';
import { PixelDataCache } from '../pixelDataCache';

const native = require('../../NativeVibeNativeDicom') as {
  __getCalls: () => string[];
  __resetCalls: () => void;
};

function items(count: number): PrefetchItem[] {
  return Array.from({ length: count }, (_, i) => ({
    dicomPath: `/dcm/${i}.dcm`,
    outPath: `/tmp/${i}.pixels`,
  }));
}

describe('Phase 8.2 — prioritizeWindow', () => {
  it('returns the active item first, then alternating forward/back', () => {
    const xs = [0, 1, 2, 3, 4, 5];
    expect(prioritizeWindow(xs, 2)).toEqual([2, 3, 1, 4, 0, 5]);
  });

  it('clamps activeIndex below 0', () => {
    expect(prioritizeWindow([0, 1, 2], -10)).toEqual([0, 1, 2]);
  });

  it('clamps activeIndex above length', () => {
    expect(prioritizeWindow([0, 1, 2], 99)).toEqual([2, 1, 0]);
  });

  it('floors fractional activeIndex', () => {
    expect(prioritizeWindow([0, 1, 2, 3], 1.9)).toEqual([1, 2, 0, 3]);
  });

  it('returns an empty array for an empty input', () => {
    expect(prioritizeWindow([], 0)).toEqual([]);
  });
});

describe('Phase 8.2 — SeriesPrefetcher', () => {
  beforeEach(() => {
    native.__resetCalls();
  });

  it('idle() resolves immediately when nothing is queued', async () => {
    const p = new SeriesPrefetcher({ cache: new PixelDataCache() });
    await p.idle();
    expect(p.stats().pending).toBe(0);
    expect(p.stats().inFlight).toBe(0);
  });

  it('processes every enqueued item exactly once', async () => {
    const cache = new PixelDataCache();
    const p = new SeriesPrefetcher({ cache });
    p.enqueue(items(5));
    p.start();
    await p.idle();
    expect(p.stats().completed).toBe(5);
    expect(p.stats().failed).toBe(0);
    expect(p.stats().pending).toBe(0);
    expect(native.__getCalls()).toHaveLength(5);
  });

  it('respects the window priority on setOrderedItems', async () => {
    // Use concurrency=1 so the call order matches the queue order
    // exactly — concurrency >1 interleaves on microtasks.
    const cache = new PixelDataCache();
    const p = new SeriesPrefetcher({ cache, concurrency: 1 });
    p.setOrderedItems(items(5), 2);
    p.start();
    await p.idle();
    expect(native.__getCalls()).toEqual([
      '/dcm/2.dcm',
      '/dcm/3.dcm',
      '/dcm/1.dcm',
      '/dcm/4.dcm',
      '/dcm/0.dcm',
    ]);
  });

  it('skips already-cached items (no second decode)', async () => {
    const cache = new PixelDataCache();
    const p = new SeriesPrefetcher({ cache });
    p.enqueue(items(3));
    p.start();
    await p.idle();
    native.__resetCalls();
    // Re-enqueueing the same items should be no-op decodes — the
    // cached wrapper hits cache and returns without going native.
    p.enqueue(items(3));
    p.start();
    await p.idle();
    expect(native.__getCalls()).toHaveLength(0);
  });

  it('stop() halts new dispatches; start() resumes from the head', async () => {
    const cache = new PixelDataCache();
    const p = new SeriesPrefetcher({ cache, concurrency: 1 });
    p.enqueue(items(4));
    p.start();
    p.stop();
    // Yield once for any microtask-queued worker; concurrency=1
    // means at most one item is in flight when we stop.
    await Promise.resolve();
    await p.idle();
    const partial = native.__getCalls().length;
    expect(partial).toBeGreaterThanOrEqual(0);
    expect(partial).toBeLessThanOrEqual(1);
    p.start();
    await p.idle();
    expect(native.__getCalls()).toHaveLength(4);
  });

  it('captures per-item errors via onItemError and keeps draining', async () => {
    const errors: string[] = [];
    // One item path is special-cased to throw in our mock.
    jest
      .spyOn(
        require('../cachedExtractPixelDataToFile'),
        'cachedExtractPixelDataToFile'
      )
      .mockImplementationOnce(() => {
        throw new Error('synthetic decode failure');
      });
    const p = new SeriesPrefetcher({
      cache: new PixelDataCache(),
      concurrency: 1,
      onItemError: (item) => errors.push(item.dicomPath),
    });
    p.enqueue(items(3));
    p.start();
    await p.idle();
    expect(errors).toEqual(['/dcm/0.dcm']);
    expect(p.stats().failed).toBe(1);
    expect(p.stats().completed).toBe(2);
  });
});
