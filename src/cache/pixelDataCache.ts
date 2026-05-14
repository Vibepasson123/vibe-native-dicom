// Phase 8.1 — LRU cache for extracted pixel-data metadata.
//
// Caches the result of extractPixelDataToFile so the next request for
// the same DICOM (e.g. cine playback, prior-current toggle, hanging
// protocol layout swap) returns immediately without re-decoding. The
// native extractor writes pixel bytes to disk; the cache tracks the
// path + dimensions, NOT the bytes themselves — those stay on disk
// where the viewer can mmap them.
//
// Eviction: standard LRU on a doubly-linked list (via Map's iteration
// order — re-insert on access moves the key to the tail). Two-axis
// budget: max bytes (default 256 MiB) and max entries (default 512).
// When either is exceeded, evict from the head (least-recently-used)
// until both are under budget.
//
// The cache is NOT a strong reference on disk files — if a consumer
// deletes the file, the next get() will still report a hit and the
// viewer will error on read. Use invalidate() when overwriting paths.

import type { PixelDataInfo } from '../types';

export type PixelDataCacheOptions = {
  /** Max total byteLength across cached entries. Default 256 MiB. */
  maxBytes?: number;
  /** Max number of cached entries. Default 512. */
  maxEntries?: number;
};

export type PixelDataCacheStats = {
  /** Number of currently cached entries. */
  size: number;
  /** Sum of byteLength across cached entries. */
  bytes: number;
  /** Successful get() lookups (cumulative since construction). */
  hits: number;
  /** get() lookups that returned undefined (cumulative). */
  misses: number;
  /** Evictions triggered by put() exceeding either budget (cumulative). */
  evictions: number;
};

const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 512;

/**
 * In-process LRU cache keyed by (dicomPath, outPath). Storing the
 * outPath in the key avoids collisions when the same source is
 * extracted into multiple sandboxes (e.g. multi-tenant apps).
 */
export class PixelDataCache {
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  // Map preserves insertion order — we re-insert on access to keep
  // most-recent at the tail; iteration order = LRU order.
  private readonly entries = new Map<string, PixelDataInfo>();
  private currentBytes = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: PixelDataCacheOptions = {}) {
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    if (this.maxBytes <= 0 || this.maxEntries <= 0) {
      throw new Error('PixelDataCache: maxBytes and maxEntries must be > 0');
    }
  }

  static makeKey(dicomPath: string, outPath: string): string {
    return `${dicomPath}::${outPath}`;
  }

  /**
   * Look up a cached entry. On hit, mark as most-recently-used by
   * re-inserting. Returns undefined on miss.
   */
  get(dicomPath: string, outPath: string): PixelDataInfo | undefined {
    const key = PixelDataCache.makeKey(dicomPath, outPath);
    const hit = this.entries.get(key);
    if (!hit) {
      this.misses += 1;
      return undefined;
    }
    // Move-to-end: delete + re-insert; Map iteration order updates.
    this.entries.delete(key);
    this.entries.set(key, hit);
    this.hits += 1;
    return hit;
  }

  /**
   * Insert (or replace) an entry. Always counts toward the byte
   * budget — if the same key already exists, the old entry's bytes
   * are subtracted before adding the new one.
   *
   * Entries with hasPixelData=false (no PixelData) are still cached —
   * the consumer still benefits from skipping the native decode on
   * the next call.
   */
  put(dicomPath: string, outPath: string, info: PixelDataInfo): void {
    const key = PixelDataCache.makeKey(dicomPath, outPath);
    const prev = this.entries.get(key);
    if (prev) {
      this.currentBytes -= prev.byteLength;
      this.entries.delete(key);
    }
    this.entries.set(key, info);
    this.currentBytes += info.byteLength;
    this.evictIfOverBudget();
  }

  /**
   * Drop one specific entry. Returns true if it existed, false
   * otherwise. Use this before overwriting the pixel file on disk.
   */
  invalidate(dicomPath: string, outPath: string): boolean {
    const key = PixelDataCache.makeKey(dicomPath, outPath);
    const prev = this.entries.get(key);
    if (!prev) return false;
    this.entries.delete(key);
    this.currentBytes -= prev.byteLength;
    return true;
  }

  /** Wipe the cache. Counters are NOT reset — see resetStats(). */
  clear(): void {
    this.entries.clear();
    this.currentBytes = 0;
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  stats(): PixelDataCacheStats {
    return {
      size: this.entries.size,
      bytes: this.currentBytes,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }

  /**
   * Drop entries from the LRU head until both budgets are satisfied.
   * Internal; callers use put()/invalidate(). Idempotent.
   */
  private evictIfOverBudget(): void {
    while (
      this.entries.size > this.maxEntries ||
      this.currentBytes > this.maxBytes
    ) {
      // Map iteration yields oldest first. We need just the first key.
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) break; // defensive: shouldn't happen
      const oldest = this.entries.get(oldestKey)!;
      this.entries.delete(oldestKey);
      this.currentBytes -= oldest.byteLength;
      this.evictions += 1;
    }
  }
}

/**
 * Module-level shared cache for callers that don't want to thread an
 * instance through their tree. Consumers needing isolation (tests,
 * multi-tenant) instantiate their own PixelDataCache.
 */
export const sharedPixelDataCache = new PixelDataCache();
