// Phase 8.1 — Cache-wrapped extractPixelDataToFile.
//
// Drop-in replacement for `extractPixelDataToFile` that consults a
// PixelDataCache before calling the native bridge. Useful for cine
// playback, prior-current toggles, and hanging protocol layouts
// where the same DICOM is "extracted" repeatedly per session.
//
// The wrapper is intentionally thin — no I/O, no string mangling, no
// extra error handling. It just turns one of the most expensive
// per-call costs (native decode of a JPEG-Lossless slice) into a Map
// lookup on the second hit.

import { extractPixelDataToFile } from '../readDicom';
import type { PixelDataInfo } from '../types';

import { PixelDataCache, sharedPixelDataCache } from './pixelDataCache';

export type CachedExtractOptions = {
  /** Cache to consult. Defaults to the shared module-level cache. */
  cache?: PixelDataCache;
  /**
   * Skip the cache lookup (always re-decode) but still store the
   * result. Useful when the caller knows the source file changed
   * but didn't track it themselves.
   */
  bypassRead?: boolean;
};

/**
 * Cache-wrapped extractPixelDataToFile. On hit: returns the cached
 * PixelDataInfo without touching the native bridge. On miss: calls
 * extractPixelDataToFile, stores the result, returns it.
 *
 * Same return shape as the underlying function, so this can be
 * dropped into existing call sites by swapping the import.
 */
export function cachedExtractPixelDataToFile(
  dicomPath: string,
  outPath: string,
  options: CachedExtractOptions = {}
): PixelDataInfo {
  const cache = options.cache ?? sharedPixelDataCache;
  if (!options.bypassRead) {
    const hit = cache.get(dicomPath, outPath);
    if (hit) return hit;
  }
  const info = extractPixelDataToFile(dicomPath, outPath);
  cache.put(dicomPath, outPath, info);
  return info;
}
