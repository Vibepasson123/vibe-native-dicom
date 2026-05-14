import { describe, it, expect } from '@jest/globals';

import {
  applyHangingProtocol,
  findAssignmentAt,
  sortStudiesByDate,
  CT_AXIAL_2UP,
  HANGING_PROTOCOLS,
  PET_CT_FUSION,
  PRIOR_CURRENT,
  SINGLE,
  type HangingProtocol,
  type StudyDescriptor,
} from '../hangingProtocol';

function s(
  partial: Partial<StudyDescriptor> & { id: string; modality: string }
): StudyDescriptor {
  return { plane: 'axial', ...partial };
}

describe('Phase 8.3 — applyHangingProtocol', () => {
  it('SINGLE assigns any study to the only slot', () => {
    const studies = [s({ id: 'a', modality: 'CT' })];
    const r = applyHangingProtocol(studies, SINGLE);
    expect(r.assignments).toHaveLength(1);
    expect(r.assignments[0]?.study?.id).toBe('a');
  });

  it('CT_AXIAL_2UP picks the first two axial CT studies', () => {
    const studies = [
      s({ id: 'ct1', modality: 'CT' }),
      s({ id: 'ct2', modality: 'CT' }),
      s({ id: 'mr', modality: 'MR' }),
    ];
    const r = applyHangingProtocol(studies, CT_AXIAL_2UP);
    expect(r.assignments[0]?.study?.id).toBe('ct1');
    expect(r.assignments[1]?.study?.id).toBe('ct2');
  });

  it('CT_AXIAL_2UP right slot is empty when only one CT is available', () => {
    const studies = [s({ id: 'ct1', modality: 'CT' })];
    const r = applyHangingProtocol(studies, CT_AXIAL_2UP);
    expect(r.assignments[0]?.study?.id).toBe('ct1');
    expect(r.assignments[1]?.study).toBeNull();
  });

  it('PRIOR_CURRENT places oldest left and newest right when sorted ascending', () => {
    const studies = sortStudiesByDate([
      s({ id: 'new', modality: 'CT', studyDate: '20260101' }),
      s({ id: 'old', modality: 'CT', studyDate: '20200101' }),
    ]);
    const r = applyHangingProtocol(studies, PRIOR_CURRENT);
    expect(r.assignments[0]?.study?.id).toBe('old');
    expect(r.assignments[1]?.study?.id).toBe('new');
  });

  it('PET_CT_FUSION binds CT to left and PET to right', () => {
    const studies = [
      s({ id: 'pet', modality: 'PT' }),
      s({ id: 'ct', modality: 'CT' }),
    ];
    const r = applyHangingProtocol(studies, PET_CT_FUSION);
    expect(r.assignments[0]?.study?.id).toBe('ct');
    expect(r.assignments[1]?.study?.id).toBe('pet');
  });

  it('PET_CT_FUSION accepts both "PT" and "PET" modality codes', () => {
    const r = applyHangingProtocol(
      [s({ id: 'ct', modality: 'CT' }), s({ id: 'pet', modality: 'PET' })],
      PET_CT_FUSION
    );
    expect(r.assignments[1]?.study?.id).toBe('pet');
  });

  it('selectIndex=-1 picks the LAST matching study', () => {
    const protocol: HangingProtocol = {
      id: 'last-ct',
      label: 'last CT',
      layout: { rows: 1, cols: 1 },
      slots: [
        {
          row: 0,
          col: 0,
          match: (st) => st.modality === 'CT',
          selectIndex: -1,
        },
      ],
    };
    const r = applyHangingProtocol(
      [
        s({ id: 'ct1', modality: 'CT' }),
        s({ id: 'ct2', modality: 'CT' }),
        s({ id: 'ct3', modality: 'CT' }),
      ],
      protocol
    );
    expect(r.assignments[0]?.study?.id).toBe('ct3');
  });

  it('every bundled preset resolves cleanly against an empty study list (no crash)', () => {
    for (const proto of Object.values(HANGING_PROTOCOLS)) {
      const r = applyHangingProtocol([], proto);
      expect(r.assignments).toHaveLength(proto.slots.length);
      for (const a of r.assignments) {
        expect(a.study).toBeNull();
      }
    }
  });
});

describe('Phase 8.3 — findAssignmentAt', () => {
  it('returns the assignment for (row, col)', () => {
    const r = applyHangingProtocol(
      [s({ id: 'a', modality: 'CT' })],
      CT_AXIAL_2UP
    );
    expect(findAssignmentAt(r, 0, 0)?.study?.id).toBe('a');
    expect(findAssignmentAt(r, 0, 1)?.study).toBeNull();
  });

  it('returns undefined when no slot is placed at (row, col)', () => {
    const r = applyHangingProtocol([], SINGLE);
    expect(findAssignmentAt(r, 5, 5)).toBeUndefined();
  });
});

describe('Phase 8.3 — sortStudiesByDate', () => {
  it('sorts ascending by studyDate', () => {
    const out = sortStudiesByDate([
      s({ id: 'b', modality: 'CT', studyDate: '20220101' }),
      s({ id: 'a', modality: 'CT', studyDate: '20200101' }),
      s({ id: 'c', modality: 'CT', studyDate: '20240101' }),
    ]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('places studies without a date at the front (treated as oldest)', () => {
    const out = sortStudiesByDate([
      s({ id: 'dated', modality: 'CT', studyDate: '20220101' }),
      s({ id: 'undated', modality: 'CT' }),
    ]);
    expect(out[0]?.id).toBe('undated');
  });

  it('does not mutate the input array', () => {
    const input = [
      s({ id: 'b', modality: 'CT', studyDate: '20220101' }),
      s({ id: 'a', modality: 'CT', studyDate: '20200101' }),
    ];
    const before = input.map((x) => x.id);
    sortStudiesByDate(input);
    expect(input.map((x) => x.id)).toEqual(before);
  });
});
