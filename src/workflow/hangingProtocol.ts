// Phase 8.3 — Hanging protocols.
//
// A hanging protocol is a declarative layout spec: how many viewports,
// and what kind of study/series goes in each. Consumers feed in the
// available studies and a protocol, and get back a matrix of (slot,
// study|null) assignments their UI can render directly.
//
// The matching engine is intentionally simple — boolean predicates on
// a small `StudyDescriptor` shape (modality, body part, series
// description regex, modality+date for prior/current). Anything more
// elaborate (orientation-aware, AI-derived hints) layers on top by
// supplying a custom `match` function.
//
// This is a pure module — no React, no native, no I/O. The
// useHangingProtocol hook in the same directory drives it from React.

/**
 * Minimal description of a study/series that the matchers operate on.
 * Consumers map their own DICOM models into this shape. Anything not
 * relevant to layout (patient demographics, etc.) is excluded — keep
 * the matcher surface small and testable.
 */
export type StudyDescriptor = {
  /** Stable identifier (StudyInstanceUID + SeriesInstanceUID is fine). */
  id: string;
  modality: string;
  bodyPartExamined?: string;
  seriesDescription?: string;
  /** ISO-ish date string used by prior/current matchers. */
  studyDate?: string;
  /** Optional reformat / orientation hint. */
  plane?: 'axial' | 'sagittal' | 'coronal' | 'oblique';
};

/**
 * One viewport in the grid. `row`/`col` are 0-indexed. `match` runs
 * over each study; the first study that passes wins the slot. Set
 * `selectIndex` to disambiguate when multiple studies match: 0 = first
 * match, -1 = last match (e.g. most recent).
 */
export type ProtocolSlot = {
  row: number;
  col: number;
  match: (study: StudyDescriptor) => boolean;
  /** Default 0 = first match. -1 = last match. */
  selectIndex?: number;
  /** Human-readable label for empty-slot placeholder. */
  label?: string;
};

export type HangingProtocol = {
  id: string;
  label: string;
  layout: { rows: number; cols: number };
  slots: ProtocolSlot[];
};

export type SlotAssignment = {
  slot: ProtocolSlot;
  study: StudyDescriptor | null;
};

export type AppliedHangingProtocol = {
  protocol: HangingProtocol;
  assignments: SlotAssignment[];
};

/**
 * Resolve a hanging protocol against a list of studies. Pure function:
 * the same inputs always produce the same output. A study may be
 * assigned to multiple slots if their matchers all accept it; this
 * mirrors PACS workstation behaviour where the same series might
 * appear in two viewports (e.g. axial + reformatted).
 *
 * Slots with no matching study get `study: null` — the consumer
 * renders a placeholder rather than crashing.
 */
export function applyHangingProtocol(
  studies: StudyDescriptor[],
  protocol: HangingProtocol
): AppliedHangingProtocol {
  const assignments: SlotAssignment[] = protocol.slots.map((slot) => {
    const matches = studies.filter(slot.match);
    if (matches.length === 0) return { slot, study: null };
    const idx = slot.selectIndex ?? 0;
    // Negative indices count from the end (Pythonic). -1 = last match.
    const pick = idx < 0 ? matches[matches.length + idx] : matches[idx];
    return { slot, study: pick ?? null };
  });
  return { protocol, assignments };
}

/**
 * Lookup helper: returns the assignment for a (row, col) cell or
 * undefined if the protocol doesn't place a viewport there. Useful for
 * grid renderers that iterate cells instead of slots.
 */
export function findAssignmentAt(
  applied: AppliedHangingProtocol,
  row: number,
  col: number
): SlotAssignment | undefined {
  return applied.assignments.find(
    (a) => a.slot.row === row && a.slot.col === col
  );
}

// ---------------------------------------------------------------------
// Bundled presets.
// ---------------------------------------------------------------------

/** 1×1 — single viewport, accepts any study. */
export const SINGLE: HangingProtocol = {
  id: 'single',
  label: 'Single viewport',
  layout: { rows: 1, cols: 1 },
  slots: [{ row: 0, col: 0, match: () => true, label: 'Primary' }],
};

/** 1×2 — both viewports axial CT. */
export const CT_AXIAL_2UP: HangingProtocol = {
  id: 'ct-axial-2up',
  label: 'CT axial · 2-up',
  layout: { rows: 1, cols: 2 },
  slots: [
    {
      row: 0,
      col: 0,
      match: (s) => s.modality === 'CT' && (s.plane ?? 'axial') === 'axial',
      label: 'CT axial (left)',
    },
    {
      row: 0,
      col: 1,
      match: (s) => s.modality === 'CT' && (s.plane ?? 'axial') === 'axial',
      // Pick the *second* CT axial when present.
      selectIndex: 1,
      label: 'CT axial (right)',
    },
  ],
};

/** 1×2 — prior on the left, current (most recent) on the right. */
export const PRIOR_CURRENT: HangingProtocol = {
  id: 'prior-current',
  label: 'Prior / current',
  layout: { rows: 1, cols: 2 },
  slots: [
    {
      // The "prior" slot — first match in study-date order, which we
      // assume the caller sorts ascending. selectIndex: 0 is explicit
      // for documentation.
      row: 0,
      col: 0,
      match: () => true,
      selectIndex: 0,
      label: 'Prior',
    },
    {
      row: 0,
      col: 1,
      match: () => true,
      selectIndex: -1,
      label: 'Current',
    },
  ],
};

/** 1×2 — CT (left) + PET (right) for fusion review. */
export const PET_CT_FUSION: HangingProtocol = {
  id: 'pet-ct-fusion',
  label: 'PET-CT fusion',
  layout: { rows: 1, cols: 2 },
  slots: [
    {
      row: 0,
      col: 0,
      match: (s) => s.modality === 'CT',
      label: 'CT',
    },
    {
      row: 0,
      col: 1,
      match: (s) => s.modality === 'PT' || s.modality === 'PET',
      label: 'PET',
    },
  ],
};

export const HANGING_PROTOCOLS = {
  'single': SINGLE,
  'ct-axial-2up': CT_AXIAL_2UP,
  'prior-current': PRIOR_CURRENT,
  'pet-ct-fusion': PET_CT_FUSION,
} as const;

export type HangingProtocolName = keyof typeof HANGING_PROTOCOLS;

/**
 * Sort studies by date ascending (oldest first). Most prior/current
 * protocols assume this ordering — the helper avoids callers
 * forgetting and ending up with the prior in the "current" slot.
 */
export function sortStudiesByDate(
  studies: StudyDescriptor[]
): StudyDescriptor[] {
  return [...studies].sort((a, b) => {
    if (!a.studyDate && !b.studyDate) return 0;
    if (!a.studyDate) return -1;
    if (!b.studyDate) return 1;
    return a.studyDate.localeCompare(b.studyDate);
  });
}
