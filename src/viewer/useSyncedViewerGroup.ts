// Phase 7.1 — useSyncedViewerGroup.
//
// Drives N viewers side-by-side with selectable sync axes. When an
// axis (W/L, transform, frame) is "on", every slot reads from one
// shared piece of state and any slot's setter writes back into it;
// when "off", each slot has its own state. Consumers wire each slot
// directly into <DicomImageViewSkia /> props.
//
// This is the entry point for Phase 7's comparison workflow. The
// next sub-phases layer overlay / fusion on top of this — they all
// share the synced cursor.

import { useCallback, useMemo, useState } from 'react';

import type { ViewerTransform } from './useViewerGestures';

const IDENTITY_TRANSFORM: ViewerTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
  rotation: 0,
};

/**
 * Sync axes. Each maps to a piece of viewer state that can be either
 * shared (one value across the group) or independent (per-slot).
 *
 * `wl` — windowCenter + windowWidth.
 * `transform` — pan/zoom/rotation from gestures.
 * `frame` — current frameIndex for multi-frame DICOM.
 */
export type SyncedViewerAxes = {
  wl: boolean;
  transform: boolean;
  frame: boolean;
};

/**
 * Per-axis defaults applied to every slot at hook init. Consumers
 * usually only need to set initialWindowCenter / initialWindowWidth
 * — the rest fall back to safe identity values.
 */
export type SyncedViewerInitialState = {
  windowCenter?: number;
  windowWidth?: number;
  frameIndex?: number;
};

export type UseSyncedViewerGroupOptions = {
  /** Number of viewer slots. Must be ≥ 1. */
  count: number;
  /** Initial sync axes. Each can be toggled later via setAxes. */
  axes?: SyncedViewerAxes;
  /** Per-slot init values. Length must equal `count` (or be omitted). */
  initial?: SyncedViewerInitialState[];
};

/**
 * One viewer slot's state + handlers. Pass these straight into
 * <DicomImageViewSkia /> — `windowCenter`/`windowWidth` go to its
 * eponymous props, `onTransformChange` wires gestures back into the
 * group, `frameIndex` drives multi-frame playback.
 */
export type SyncedViewerSlot = {
  windowCenter: number;
  windowWidth: number;
  transform: ViewerTransform;
  frameIndex: number;
  /** Update this slot's W/L (also writes shared state when wl-sync is on). */
  setWindowCenter: (n: number) => void;
  setWindowWidth: (n: number) => void;
  /** Wire to <DicomImageViewSkia onTransformChange={…}>. */
  onTransformChange: (t: ViewerTransform) => void;
  /** Multi-frame cine. */
  setFrameIndex: (i: number) => void;
};

export type UseSyncedViewerGroupResult = {
  slots: SyncedViewerSlot[];
  axes: SyncedViewerAxes;
  setAxes: (next: SyncedViewerAxes) => void;
};

const DEFAULT_AXES: SyncedViewerAxes = {
  wl: true,
  transform: true,
  frame: true,
};

/**
 * Pure helper: pick the value for slot `i`, choosing shared vs.
 * per-slot based on the axis flag. Exported for tests.
 */
export function pickSlotValue<T>(
  shared: T,
  perSlot: T[],
  i: number,
  syncOn: boolean
): T {
  if (syncOn) return shared;
  return perSlot[i] ?? shared;
}

export function useSyncedViewerGroup(
  options: UseSyncedViewerGroupOptions
): UseSyncedViewerGroupResult {
  const { count, axes: axesInitial = DEFAULT_AXES, initial } = options;
  if (count < 1) {
    throw new Error('useSyncedViewerGroup: count must be ≥ 1');
  }
  if (initial && initial.length !== count) {
    throw new Error(
      `useSyncedViewerGroup: initial.length (${initial.length}) ` +
        `must equal count (${count})`
    );
  }

  const initialWcs = useMemo(
    () =>
      Array.from(
        { length: count },
        (_, i) => initial?.[i]?.windowCenter ?? 128
      ),
    // Initial values are captured exactly once — re-renders with new
    // `initial` props don't reset slot state by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const initialWws = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => initial?.[i]?.windowWidth ?? 256),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const initialFrames = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => initial?.[i]?.frameIndex ?? 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [axes, setAxes] = useState<SyncedViewerAxes>(axesInitial);

  // Shared state for each axis.
  const [sharedWc, setSharedWc] = useState<number>(initialWcs[0]!);
  const [sharedWw, setSharedWw] = useState<number>(initialWws[0]!);
  const [sharedTransform, setSharedTransform] =
    useState<ViewerTransform>(IDENTITY_TRANSFORM);
  const [sharedFrame, setSharedFrame] = useState<number>(initialFrames[0]!);

  // Per-slot state for each axis. Same hook count regardless of `axes`
  // (React requires fixed hook order). The pick logic just chooses
  // which value to surface.
  const [perSlotWc, setPerSlotWc] = useState<number[]>(initialWcs);
  const [perSlotWw, setPerSlotWw] = useState<number[]>(initialWws);
  const [perSlotTransform, setPerSlotTransform] = useState<ViewerTransform[]>(
    () => Array.from({ length: count }, () => IDENTITY_TRANSFORM)
  );
  const [perSlotFrame, setPerSlotFrame] = useState<number[]>(initialFrames);

  const slots: SyncedViewerSlot[] = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const setWindowCenter = (n: number) => {
        if (axes.wl) setSharedWc(n);
        else
          setPerSlotWc((prev) => {
            const next = prev.slice();
            next[i] = n;
            return next;
          });
      };
      const setWindowWidth = (n: number) => {
        if (axes.wl) setSharedWw(n);
        else
          setPerSlotWw((prev) => {
            const next = prev.slice();
            next[i] = n;
            return next;
          });
      };
      const onTransformChange = (t: ViewerTransform) => {
        if (axes.transform) setSharedTransform(t);
        else
          setPerSlotTransform((prev) => {
            const next = prev.slice();
            next[i] = t;
            return next;
          });
      };
      const setFrameIndex = (n: number) => {
        if (axes.frame) setSharedFrame(n);
        else
          setPerSlotFrame((prev) => {
            const next = prev.slice();
            next[i] = n;
            return next;
          });
      };
      return {
        windowCenter: pickSlotValue(sharedWc, perSlotWc, i, axes.wl),
        windowWidth: pickSlotValue(sharedWw, perSlotWw, i, axes.wl),
        transform: pickSlotValue(
          sharedTransform,
          perSlotTransform,
          i,
          axes.transform
        ),
        frameIndex: pickSlotValue(sharedFrame, perSlotFrame, i, axes.frame),
        setWindowCenter,
        setWindowWidth,
        onTransformChange,
        setFrameIndex,
      };
    });
  }, [
    count,
    axes,
    sharedWc,
    sharedWw,
    sharedTransform,
    sharedFrame,
    perSlotWc,
    perSlotWw,
    perSlotTransform,
    perSlotFrame,
  ]);

  const setAxesStable = useCallback(
    (next: SyncedViewerAxes) => setAxes(next),
    []
  );

  return { slots, axes, setAxes: setAxesStable };
}
