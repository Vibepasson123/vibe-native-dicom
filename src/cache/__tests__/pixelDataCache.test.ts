import { describe, it, expect } from '@jest/globals';

import { PixelDataCache } from '../pixelDataCache';
import type { PixelDataInfo } from '../../types';

function info(
  bytes: number,
  filePath: string = '/tmp/x.pixels'
): PixelDataInfo {
  return {
    filePath,
    byteLength: bytes,
    rows: 16,
    columns: 16,
    bitsAllocated: 8,
    samplesPerPixel: 1,
    photometricInterpretation: 'MONOCHROME2',
    numberOfFrames: 1,
    hasPixelData: true,
  };
}

describe('Phase 8.1 — PixelDataCache', () => {
  it('returns undefined on miss and increments the miss counter', () => {
    const c = new PixelDataCache();
    expect(c.get('/a.dcm', '/a.pixels')).toBeUndefined();
    expect(c.stats().misses).toBe(1);
    expect(c.stats().hits).toBe(0);
  });

  it('round-trips a put → get and increments hits', () => {
    const c = new PixelDataCache();
    c.put('/a.dcm', '/a.pixels', info(100));
    const hit = c.get('/a.dcm', '/a.pixels');
    expect(hit?.byteLength).toBe(100);
    expect(c.stats().hits).toBe(1);
    expect(c.stats().bytes).toBe(100);
    expect(c.stats().size).toBe(1);
  });

  it('keys on the (dicomPath, outPath) tuple — different outPaths do not collide', () => {
    const c = new PixelDataCache();
    c.put('/a.dcm', '/a.pixels', info(100));
    c.put('/a.dcm', '/b.pixels', info(200));
    expect(c.get('/a.dcm', '/a.pixels')?.byteLength).toBe(100);
    expect(c.get('/a.dcm', '/b.pixels')?.byteLength).toBe(200);
    expect(c.stats().size).toBe(2);
    expect(c.stats().bytes).toBe(300);
  });

  it('replacing a key updates bytes (no double-counting)', () => {
    const c = new PixelDataCache();
    c.put('/a.dcm', '/a.pixels', info(100));
    c.put('/a.dcm', '/a.pixels', info(50));
    expect(c.stats().bytes).toBe(50);
    expect(c.stats().size).toBe(1);
  });

  it('evicts oldest first when count budget is exceeded', () => {
    const c = new PixelDataCache({ maxEntries: 2, maxBytes: 1024 });
    c.put('/a', '/a', info(10));
    c.put('/b', '/b', info(10));
    c.put('/c', '/c', info(10));
    expect(c.get('/a', '/a')).toBeUndefined(); // evicted
    expect(c.get('/b', '/b')?.byteLength).toBe(10);
    expect(c.get('/c', '/c')?.byteLength).toBe(10);
    expect(c.stats().evictions).toBe(1);
  });

  it('evicts when byte budget is exceeded', () => {
    const c = new PixelDataCache({ maxEntries: 1024, maxBytes: 50 });
    c.put('/a', '/a', info(30));
    c.put('/b', '/b', info(30)); // total 60 > 50 → evict /a
    expect(c.get('/a', '/a')).toBeUndefined();
    expect(c.get('/b', '/b')?.byteLength).toBe(30);
    expect(c.stats().evictions).toBe(1);
    expect(c.stats().bytes).toBe(30);
  });

  it('move-to-front on get protects recently-used entries from eviction', () => {
    const c = new PixelDataCache({ maxEntries: 2, maxBytes: 1024 });
    c.put('/a', '/a', info(10));
    c.put('/b', '/b', info(10));
    // Touching /a makes it most-recently-used; /b is now oldest.
    c.get('/a', '/a');
    c.put('/c', '/c', info(10));
    expect(c.get('/a', '/a')?.byteLength).toBe(10);
    expect(c.get('/b', '/b')).toBeUndefined(); // /b evicted, not /a
    expect(c.get('/c', '/c')?.byteLength).toBe(10);
  });

  it('invalidate() removes one entry and updates bytes', () => {
    const c = new PixelDataCache();
    c.put('/a', '/a', info(100));
    c.put('/b', '/b', info(50));
    expect(c.invalidate('/a', '/a')).toBe(true);
    expect(c.invalidate('/a', '/a')).toBe(false); // already gone
    expect(c.get('/a', '/a')).toBeUndefined();
    expect(c.stats().bytes).toBe(50);
  });

  it('clear() wipes entries but preserves counters until resetStats()', () => {
    const c = new PixelDataCache();
    c.put('/a', '/a', info(100));
    c.get('/a', '/a'); // hit
    c.clear();
    expect(c.stats().size).toBe(0);
    expect(c.stats().bytes).toBe(0);
    expect(c.stats().hits).toBe(1); // preserved
    c.resetStats();
    expect(c.stats().hits).toBe(0);
  });

  it('caches hasPixelData=false entries (still avoids re-decode)', () => {
    const c = new PixelDataCache();
    const negative: PixelDataInfo = {
      ...info(0),
      hasPixelData: false,
      filePath: '',
    };
    c.put('/x.dcm', '/x.pixels', negative);
    const hit = c.get('/x.dcm', '/x.pixels');
    expect(hit?.hasPixelData).toBe(false);
    expect(c.stats().size).toBe(1);
  });

  it('rejects non-positive budgets at construction time', () => {
    expect(() => new PixelDataCache({ maxBytes: 0 })).toThrow();
    expect(() => new PixelDataCache({ maxEntries: 0 })).toThrow();
    expect(() => new PixelDataCache({ maxBytes: -1 })).toThrow();
  });
});
