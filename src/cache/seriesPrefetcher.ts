// Phase 8.2 — Series prefetcher.
//
// Walks a list of DICOM paths and pre-runs cachedExtractPixelDataToFile
// on each so the next viewer read is a cache hit. Two patterns the
// prefetcher is designed around:
//
//   - Cine playback: scroll forward through a 200-slice CT. We want
//     slices N+1..N+K pre-decoded so the next-frame transition is
//     instant, with N-1..N-K also warm in case the user scrubs back.
//
//   - Hanging protocol layout swap: load the prior + current studies
//     up front so toggling between them doesn't re-decode.
//
// The prefetcher does NOT own its cache — pass an instance (defaults
// to sharedPixelDataCache). Concurrency = number of native-decode
// workers running in parallel; CPU-bound, so 2 is the sweet spot.
//
// Cancellation: stop() flips a flag; in-flight extracts run to
// completion (they're synchronous on the JS thread anyway), but no
// new work is started. Re-start() resumes from the queue head.

import { cachedExtractPixelDataToFile } from './cachedExtractPixelDataToFile';
import { PixelDataCache, sharedPixelDataCache } from './pixelDataCache';

export type PrefetchItem = {
  dicomPath: string;
  outPath: string;
};

export type SeriesPrefetcherOptions = {
  /** Cache to populate. Defaults to sharedPixelDataCache. */
  cache?: PixelDataCache;
  /**
   * Number of concurrent workers. Higher values don't help — native
   * decode is CPU-bound. Defaults to 2 so one worker can always make
   * progress while another is blocked on a slow JPEG-Lossless slice.
   */
  concurrency?: number;
  /**
   * Per-item callback. Errors are silenced by default (the prefetcher
   * is opportunistic — a failed prefetch shouldn't crash anything).
   * Hook here to record telemetry / retry policy.
   */
  onItemError?: (item: PrefetchItem, error: Error) => void;
};

export type SeriesPrefetcherStats = {
  /** Items queued but not yet processed. */
  pending: number;
  /** Items successfully prefetched (cache populated). */
  completed: number;
  /** Items that threw during extract. */
  failed: number;
  /** Workers currently running. */
  inFlight: number;
  /** Total items ever enqueued (including duplicates). */
  enqueued: number;
};

const DEFAULT_CONCURRENCY = 2;

/**
 * Order items by proximity to `activeIndex` — closest first, then
 * alternating forward/back. Useful when the user is scrolling through
 * a CT series: slices N+1, N-1, N+2, N-2, … get prefetched in turn.
 *
 * Exposed as a pure function for tests.
 */
export function prioritizeWindow<T>(items: T[], activeIndex: number): T[] {
  const len = items.length;
  if (len === 0) return [];
  const out: T[] = [];
  const i = Math.max(0, Math.min(len - 1, Math.floor(activeIndex)));
  out.push(items[i]!);
  let f = i + 1;
  let b = i - 1;
  while (f < len || b >= 0) {
    if (f < len) out.push(items[f]!);
    if (b >= 0) out.push(items[b]!);
    f += 1;
    b -= 1;
  }
  return out;
}

export class SeriesPrefetcher {
  private readonly cache: PixelDataCache;
  private readonly concurrency: number;
  private readonly onItemError?: (item: PrefetchItem, error: Error) => void;
  private queue: PrefetchItem[] = [];
  private running = false;
  private inFlight = 0;
  private completed = 0;
  private failed = 0;
  private enqueued = 0;
  // Resolves when the queue drains AND no worker is in flight. New
  // each time the queue transitions from non-empty to empty.
  private idlePromise: Promise<void> | null = null;
  private idleResolve: (() => void) | null = null;

  constructor(options: SeriesPrefetcherOptions = {}) {
    this.cache = options.cache ?? sharedPixelDataCache;
    this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
    this.onItemError = options.onItemError;
  }

  /**
   * Append items to the queue. Items already cache-hit are skipped at
   * dequeue time (not at enqueue time) so the caller doesn't need to
   * filter — and so a later invalidate() can re-warm them.
   */
  enqueue(items: PrefetchItem[]): void {
    this.queue.push(...items);
    this.enqueued += items.length;
    if (this.running) this.pumpWorkers();
  }

  /**
   * Replace the queue with a freshly-prioritised list (window around
   * `activeIndex`). Items already cache-hit will be skipped at
   * dequeue time. Use this on every active-frame change in a cine.
   */
  setOrderedItems(items: PrefetchItem[], activeIndex: number): void {
    this.queue = prioritizeWindow(items, activeIndex);
    this.enqueued += items.length;
    if (this.running) this.pumpWorkers();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.pumpWorkers();
  }

  /**
   * Stop dispatching new work. In-flight workers finish their current
   * item — call idle() afterwards if you need to wait for them.
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Resolves once no work is in flight AND either the queue is empty
   * OR the prefetcher is stopped (= nothing else is going to drain
   * the queue). Useful in tests; not normally needed in app code.
   */
  idle(): Promise<void> {
    if (this.inFlight === 0 && (!this.running || this.queue.length === 0)) {
      return Promise.resolve();
    }
    if (!this.idlePromise) {
      this.idlePromise = new Promise((resolve) => {
        this.idleResolve = resolve;
      });
    }
    return this.idlePromise;
  }

  clear(): void {
    this.queue = [];
  }

  stats(): SeriesPrefetcherStats {
    return {
      pending: this.queue.length,
      completed: this.completed,
      failed: this.failed,
      inFlight: this.inFlight,
      enqueued: this.enqueued,
    };
  }

  /**
   * Top up workers to `concurrency`. Each worker is a simple async
   * loop that pulls one item, processes it, and recurses. The JS
   * single-thread + synchronous native bridge means the workers are
   * effectively a cooperative event-loop pool; concurrency > 1 only
   * helps when other tasks (gestures, render) interleave between
   * extracts via microtasks.
   */
  private pumpWorkers(): void {
    while (
      this.running &&
      this.inFlight < this.concurrency &&
      this.queue.length > 0
    ) {
      this.spawnWorker();
    }
  }

  private spawnWorker(): void {
    const item = this.queue.shift();
    if (!item) return;
    this.inFlight += 1;
    // Yield once via the microtask queue between extracts so
    // gestures / renders can interleave. Promise.resolve().then keeps
    // us off setTimeout (~4ms RN throttle) without needing the
    // ES2021 queueMicrotask global.
    Promise.resolve().then(() => {
      try {
        cachedExtractPixelDataToFile(item.dicomPath, item.outPath, {
          cache: this.cache,
        });
        this.completed += 1;
      } catch (err) {
        this.failed += 1;
        this.onItemError?.(item, err as Error);
      } finally {
        this.inFlight -= 1;
        if (this.inFlight === 0 && (!this.running || this.queue.length === 0)) {
          // Drained — resolve any waiter and reset the promise so a
          // subsequent enqueue/idle() cycle works. "Drained" here
          // means "nothing currently running"; if the queue still
          // has items but we're stopped, idle() should still fire.
          const resolve = this.idleResolve;
          this.idleResolve = null;
          this.idlePromise = null;
          resolve?.();
        }
        if (this.running) this.pumpWorkers();
      }
    });
  }
}
