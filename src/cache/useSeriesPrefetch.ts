// Phase 8.2 — useSeriesPrefetch.
//
// Drives a SeriesPrefetcher from React state. Re-prioritises the
// queue around `activeIndex` on every change and auto-starts on
// mount. Returns the prefetcher's live stats for UI display.
//
// Common use: cine playback where `activeIndex` is the current frame
// — slices N+1, N-1, N+2, N-2, … are prefetched in turn so scrubbing
// in either direction is instant.

import { useEffect, useMemo, useRef, useState } from 'react';

import { PixelDataCache } from './pixelDataCache';
import {
  SeriesPrefetcher,
  type PrefetchItem,
  type SeriesPrefetcherStats,
} from './seriesPrefetcher';

export type UseSeriesPrefetchOptions = {
  /** Cache to populate. Defaults to sharedPixelDataCache (via prefetcher). */
  cache?: PixelDataCache;
  /** Workers in flight. Default 2. */
  concurrency?: number;
  /**
   * Sampling interval in ms for the stats snapshot. Default 200 —
   * fast enough to feel live, slow enough to not re-render the world.
   */
  statsIntervalMs?: number;
  /** Per-item error callback (silenced by default). */
  onItemError?: (item: PrefetchItem, error: Error) => void;
};

export type UseSeriesPrefetchResult = {
  stats: SeriesPrefetcherStats;
  /** Manually stop; auto-resumes if `items`/`activeIndex` change. */
  stop: () => void;
  start: () => void;
};

const DEFAULT_STATS_INTERVAL_MS = 200;

export function useSeriesPrefetch(
  items: PrefetchItem[],
  activeIndex: number,
  options: UseSeriesPrefetchOptions = {}
): UseSeriesPrefetchResult {
  const {
    cache,
    concurrency,
    statsIntervalMs = DEFAULT_STATS_INTERVAL_MS,
    onItemError,
  } = options;

  // One prefetcher per hook lifetime. Re-creating it on every render
  // would reset stats and lose in-flight work; we want it stable.
  // The ref is initialised on first render and reused.
  const prefetcherRef = useRef<SeriesPrefetcher | null>(null);
  if (prefetcherRef.current === null) {
    prefetcherRef.current = new SeriesPrefetcher({
      cache,
      concurrency,
      onItemError,
    });
  }
  const prefetcher = prefetcherRef.current;

  // Re-prioritise + auto-start on items/activeIndex change.
  useEffect(() => {
    prefetcher.setOrderedItems(items, activeIndex);
    prefetcher.start();
  }, [items, activeIndex, prefetcher]);

  // Poll stats so the consumer sees live progress. Cheap snapshot —
  // a plain object — and we throttle to statsIntervalMs.
  const [stats, setStats] = useState<SeriesPrefetcherStats>(() =>
    prefetcher.stats()
  );
  useEffect(() => {
    const t = setInterval(() => {
      setStats(prefetcher.stats());
    }, statsIntervalMs);
    return () => clearInterval(t);
  }, [prefetcher, statsIntervalMs]);

  // Stop on unmount so a dismissed cine doesn't keep decoding.
  useEffect(() => {
    return () => {
      prefetcher.stop();
      prefetcher.clear();
    };
  }, [prefetcher]);

  return useMemo(
    () => ({
      stats,
      stop: () => prefetcher.stop(),
      start: () => prefetcher.start(),
    }),
    [stats, prefetcher]
  );
}
