import { describe, it, expect } from '@jest/globals';

import {
  anonymizeDataset,
  anonymizeDicomFile,
  describeAnonymizationActions,
  UidRemapper,
} from '../anonymizeDataset';
import type { DicomDataset, DicomFile } from '../../types';

function richDataset(): DicomDataset {
  return {
    // Patient
    '0010,0010': { vr: 'PN', value: 'DOE^JOHN' },
    '0010,0020': { vr: 'LO', value: 'MRN-12345' },
    '0010,0030': { vr: 'DA', value: '19800101' },
    '0010,0040': { vr: 'CS', value: 'M' },
    '0010,1010': { vr: 'AS', value: '045Y' },
    '0010,1040': { vr: 'LO', value: '1 Sesame St' },
    // Study
    '0020,000D': { vr: 'UI', value: '1.2.3.STUDY' },
    '0008,0020': { vr: 'DA', value: '20260101' },
    '0008,0050': { vr: 'SH', value: 'ACC-001' },
    '0008,0090': { vr: 'PN', value: 'SMITH^REFERRING' },
    '0008,1030': { vr: 'LO', value: 'Chest CT' },
    // Series
    '0020,000E': { vr: 'UI', value: '1.2.3.SERIES' },
    '0008,103E': { vr: 'LO', value: 'Axial 1mm' },
    '0008,1070': { vr: 'PN', value: 'BAR^OPERATOR' },
    // SOP
    '0008,0018': { vr: 'UI', value: '1.2.3.SOP' },
    // Institution
    '0008,0080': { vr: 'LO', value: 'General Hospital' },
    // SQ (Procedure Code) — contains a PN tag that should also be scrubbed.
    '0008,1032': {
      vr: 'SQ',
      value: null,
      items: [
        {
          '0010,0010': { vr: 'PN', value: 'NESTED^DOE' },
          '0008,0050': { vr: 'SH', value: 'NESTED-ACC' },
        },
      ],
    },
    // Unknown tag — should be passed through untouched.
    '7777,7777': { vr: 'LO', value: 'private-marker' },
  };
}

describe('Phase 8.4 — anonymizeDataset', () => {
  it('action X replaces PatientName with the dummy placeholder', () => {
    const out = anonymizeDataset(richDataset());
    expect(out['0010,0010']?.value).toBe('Anonymous');
    expect(out['0010,0020']?.value).toBe('ANON-001');
  });

  it('action Z zeroes Patient Birth Date with the placeholder', () => {
    const out = anonymizeDataset(richDataset());
    expect(out['0010,0030']?.value).toBe('00000000');
  });

  it('action D deletes patient address + referring physician', () => {
    const out = anonymizeDataset(richDataset());
    expect(out['0010,1040']).toBeUndefined();
    expect(out['0008,0090']).toBeUndefined();
    expect(out['0008,0080']).toBeUndefined();
  });

  it('preserves Patient Sex (action K — kept for analytics)', () => {
    const out = anonymizeDataset(richDataset());
    expect(out['0010,0040']?.value).toBe('M');
  });

  it('passes unknown tags through unchanged', () => {
    const out = anonymizeDataset(richDataset());
    expect(out['7777,7777']?.value).toBe('private-marker');
  });

  it('remaps UIDs via the UidRemapper (action U)', () => {
    const remapper = new UidRemapper();
    const out = anonymizeDataset(richDataset(), { uidRemapper: remapper });
    expect(out['0020,000D']?.value).not.toBe('1.2.3.STUDY');
    expect(out['0020,000D']?.value).toEqual(expect.stringMatching(/^2\.25\./));
    // Reference to the same study UID elsewhere returns the same remap.
    expect(remapper.remap('1.2.3.STUDY')).toBe(out['0020,000D']?.value);
  });

  it('keepDescriptions retains study + series descriptions', () => {
    const out = anonymizeDataset(richDataset(), { keepDescriptions: true });
    expect(out['0008,1030']?.value).toBe('Chest CT');
    expect(out['0008,103E']?.value).toBe('Axial 1mm');
  });

  it('recurses into SQ items and scrubs nested PHI', () => {
    const out = anonymizeDataset(richDataset());
    const nestedItem = out['0008,1032']?.items?.[0];
    expect(nestedItem?.['0010,0010']?.value).toBe('Anonymous');
    expect(nestedItem?.['0008,0050']?.value).toBe('');
  });

  it('does not mutate the input dataset', () => {
    const input = richDataset();
    const snapshot = JSON.stringify(input);
    anonymizeDataset(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('customisable dummy placeholders take effect', () => {
    const out = anonymizeDataset(richDataset(), {
      dummyPatientName: 'JANE^DOE',
      dummyPatientId: 'PII-FREE-7',
    });
    expect(out['0010,0010']?.value).toBe('JANE^DOE');
    expect(out['0010,0020']?.value).toBe('PII-FREE-7');
  });
});

describe('Phase 8.4 — anonymizeDicomFile', () => {
  function file(): DicomFile {
    return {
      transferSyntaxUID: '1.2.840.10008.1.2',
      sopClassUID: '1.2.840.10008.5.1.4.1.1.4',
      sopInstanceUID: '1.2.3.SOP',
      dataset: richDataset(),
      image: null,
    };
  }

  it('rewrites sopInstanceUID through the same remapper as the dataset', () => {
    const remapper = new UidRemapper();
    const out = anonymizeDicomFile(file(), { uidRemapper: remapper });
    expect(out.sopInstanceUID).not.toBe('1.2.3.SOP');
    expect(out.sopInstanceUID).toBe(out.dataset['0008,0018']?.value);
  });

  it('keeps sopClassUID intact (storage class identity)', () => {
    const out = anonymizeDicomFile(file());
    expect(out.sopClassUID).toBe('1.2.840.10008.5.1.4.1.1.4');
  });
});

describe('Phase 8.4 — UidRemapper', () => {
  it('returns the same anon UID for repeat calls on the same original', () => {
    const r = new UidRemapper();
    const a = r.remap('1.2.3');
    const b = r.remap('1.2.3');
    expect(a).toBe(b);
  });

  it('returns distinct UIDs for distinct originals', () => {
    const r = new UidRemapper();
    expect(r.remap('a')).not.toBe(r.remap('b'));
  });

  it('uses a DICOM-conformant 2.25 root by default', () => {
    const r = new UidRemapper();
    expect(r.remap('foo')).toMatch(/^2\.25\./);
  });

  it('accepts a custom prefix', () => {
    const r = new UidRemapper('1.2.840.99999');
    expect(r.remap('foo')).toMatch(/^1\.2\.840\.99999\./);
  });

  it('returns the empty string unchanged (defensive against missing UIDs)', () => {
    const r = new UidRemapper();
    expect(r.remap('')).toBe('');
  });

  it('entries() exposes the mapping for audit logs', () => {
    const r = new UidRemapper();
    const x = r.remap('original-1');
    const y = r.remap('original-2');
    expect(r.entries()).toEqual([
      ['original-1', x],
      ['original-2', y],
    ]);
  });
});

describe('Phase 8.4 — describeAnonymizationActions', () => {
  it('reports the action plan for the default options', () => {
    const a = describeAnonymizationActions();
    expect(a['0010,0010']).toBe('X');
    expect(a['0008,1030']).toBe('X');
  });

  it('flips description tags to K when keepDescriptions is true', () => {
    const a = describeAnonymizationActions({ keepDescriptions: true });
    expect(a['0008,1030']).toBe('K');
    expect(a['0008,103E']).toBe('K');
  });
});
