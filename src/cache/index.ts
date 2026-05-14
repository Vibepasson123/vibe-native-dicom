// Phase 8.1 — pixel-data caching barrel.
export {
  PixelDataCache,
  sharedPixelDataCache,
  type PixelDataCacheOptions,
  type PixelDataCacheStats,
} from './pixelDataCache';
export {
  cachedExtractPixelDataToFile,
  type CachedExtractOptions,
} from './cachedExtractPixelDataToFile';
// Phase 8.2 — series prefetcher.
export {
  SeriesPrefetcher,
  prioritizeWindow,
  type PrefetchItem,
  type SeriesPrefetcherOptions,
  type SeriesPrefetcherStats,
} from './seriesPrefetcher';
export {
  useSeriesPrefetch,
  type UseSeriesPrefetchOptions,
  type UseSeriesPrefetchResult,
} from './useSeriesPrefetch';
