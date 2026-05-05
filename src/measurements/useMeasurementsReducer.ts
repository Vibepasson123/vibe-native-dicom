// Measurement state + reducer.
//
// Owns the list of committed measurements and the in-progress draft.
// Exposed as a hook so consumers can share state across the overlay,
// the tool picker, and the measurement list.
//
// Tap-to-place flow:
//   1. selectTool('linear') sets the active tool. No draft yet.
//   2. addPoint({x,y}) accumulates points. When the count for the kind
//      is reached, the draft is committed to `measurements` and the
//      draft is cleared. Tool stays active for the next placement.
//   3. cancelDraft() drops in-progress points (e.g. user toggled tool).
//   4. setTool(null) ends placement mode.

import { useCallback, useMemo, useReducer } from 'react';
import type {
  AngleMeasurement,
  ImagePoint,
  LinearMeasurement,
  Measurement,
  MeasurementToolKind,
  RoiRectMeasurement,
} from './types';

const POINTS_REQUIRED: Record<MeasurementToolKind, number> = {
  'linear': 2,
  'angle': 3,
  'roi-rect': 2,
};

type Draft = {
  kind: MeasurementToolKind;
  points: ImagePoint[];
};

type State = {
  measurements: Measurement[];
  tool: MeasurementToolKind | null;
  draft: Draft | null;
  /** Monotonically increasing counter used for unique IDs. */
  seq: number;
};

type Action =
  | { type: 'select-tool'; tool: MeasurementToolKind | null }
  | { type: 'add-point'; point: ImagePoint }
  | { type: 'cancel-draft' }
  | { type: 'remove'; id: string }
  | { type: 'clear-all' };

const INITIAL: State = {
  measurements: [],
  tool: null,
  draft: null,
  seq: 0,
};

function makeMeasurement(
  kind: MeasurementToolKind,
  points: ImagePoint[],
  id: string
): Measurement {
  switch (kind) {
    case 'linear':
      return {
        id,
        kind: 'linear',
        points: [points[0]!, points[1]!],
      } satisfies LinearMeasurement;
    case 'angle':
      return {
        id,
        kind: 'angle',
        points: [points[0]!, points[1]!, points[2]!],
      } satisfies AngleMeasurement;
    case 'roi-rect':
      return {
        id,
        kind: 'roi-rect',
        points: [points[0]!, points[1]!],
      } satisfies RoiRectMeasurement;
  }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'select-tool': {
      // Switching tools cancels any in-progress draft.
      return { ...state, tool: action.tool, draft: null };
    }
    case 'add-point': {
      if (!state.tool) return state;
      const draft: Draft = state.draft ?? { kind: state.tool, points: [] };
      const points = [...draft.points, action.point];
      const required = POINTS_REQUIRED[draft.kind];
      if (points.length < required) {
        return { ...state, draft: { kind: draft.kind, points } };
      }
      // Commit.
      const id = `m-${state.seq + 1}`;
      const m = makeMeasurement(draft.kind, points, id);
      return {
        ...state,
        measurements: [...state.measurements, m],
        draft: null,
        seq: state.seq + 1,
      };
    }
    case 'cancel-draft':
      return { ...state, draft: null };
    case 'remove':
      return {
        ...state,
        measurements: state.measurements.filter((m) => m.id !== action.id),
      };
    case 'clear-all':
      return { ...state, measurements: [], draft: null };
  }
}

export type UseMeasurementsResult = {
  measurements: Measurement[];
  tool: MeasurementToolKind | null;
  draft: Draft | null;
  selectTool: (tool: MeasurementToolKind | null) => void;
  addPoint: (point: ImagePoint) => void;
  cancelDraft: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
};

export function useMeasurementsReducer(): UseMeasurementsResult {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const selectTool = useCallback(
    (tool: MeasurementToolKind | null) =>
      dispatch({ type: 'select-tool', tool }),
    []
  );
  const addPoint = useCallback(
    (point: ImagePoint) => dispatch({ type: 'add-point', point }),
    []
  );
  const cancelDraft = useCallback(() => dispatch({ type: 'cancel-draft' }), []);
  const remove = useCallback(
    (id: string) => dispatch({ type: 'remove', id }),
    []
  );
  const clearAll = useCallback(() => dispatch({ type: 'clear-all' }), []);
  return useMemo(
    () => ({
      measurements: state.measurements,
      tool: state.tool,
      draft: state.draft,
      selectTool,
      addPoint,
      cancelDraft,
      remove,
      clearAll,
    }),
    [state, selectTool, addPoint, cancelDraft, remove, clearAll]
  );
}
