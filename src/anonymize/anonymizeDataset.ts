// Phase 8.4 — DICOM anonymization (de-identification).
//
// Pure JS-side transform of a parsed DicomDataset / DicomFile, modelled
// on DICOM PS3.15 §E.1 "Basic Application Confidentiality Profile" but
// scoped to a pragmatic subset: the tags every clinical viewer must
// scrub before sharing a study off-site.
//
// PS3.15 actions implemented:
//   D — delete the element.
//   Z — set value to zero (empty string for VR=PN/LO/SH, "00000000" for DA).
//   X — set to a dummy placeholder ("Anonymous", "ANON-001", "00000000").
//   U — replace with a freshly generated UID (deterministic per UidRemapper).
//   K — keep (no action; documented for completeness).
//
// Not yet implemented: pixel-data burnt-in PHI scrubbing (deep image
// inspection / OCR — separate sub-phase), Curve / Overlay scrubbing,
// nested-SQ recursion beyond one level (we walk one level; deeper SR
// trees need explicit testing before promoting that).
//
// The transform is intentionally non-cryptographic. Consumers handling
// data under HIPAA Safe-Harbor should layer their own UID-mapping audit
// trail on top of UidRemapper.

import type { DicomDataset, DicomElement, DicomFile } from '../types';

/** PS3.15 action verbs. */
export type AnonymizationAction = 'D' | 'Z' | 'X' | 'U' | 'K';

export type AnonymizationOptions = {
  /** Placeholder name to substitute where action = X. Default "Anonymous". */
  dummyPatientName?: string;
  /** Placeholder ID. Default "ANON-001". */
  dummyPatientId?: string;
  /** Keep descriptive fields (study/series description). Default false. */
  keepDescriptions?: boolean;
  /**
   * Remapper that returns a stable anonymous UID for each original UID
   * within this session. Pass an instance shared across calls so SR /
   * SEG cross-references stay consistent across a whole study set.
   */
  uidRemapper?: UidRemapper;
};

/**
 * Per-tag action table. Keys are uppercase "GGGG,EEEE". Values come
 * from PS3.15 §E.1 with our pragmatic mods.
 *
 * Tags marked `K` are listed for clarity even when no-op — auditors
 * reading the table want to see "we considered this and chose to keep".
 */
const BASE_ACTIONS: Record<string, AnonymizationAction> = {
  // Patient module
  '0010,0010': 'X', // Patient Name
  '0010,0020': 'X', // Patient ID
  '0010,0030': 'Z', // Patient Birth Date
  '0010,0040': 'K', // Patient Sex (kept for analytics — debatable)
  '0010,1010': 'D', // Patient Age
  '0010,1040': 'D', // Patient Address
  '0010,2160': 'D', // Ethnic Group
  '0010,21B0': 'D', // Additional Patient History
  // Study module
  '0008,0020': 'Z', // Study Date
  '0008,0030': 'Z', // Study Time
  '0008,0050': 'Z', // Accession Number
  '0008,0090': 'D', // Referring Physician Name
  '0008,1030': 'X', // Study Description (toggled by keepDescriptions)
  // Series module
  '0008,103E': 'X', // Series Description (toggled by keepDescriptions)
  '0008,1050': 'D', // Performing Physician Name
  '0008,1060': 'D', // Name of Physician Reading Study
  '0008,1070': 'D', // Operators Name
  // Institution
  '0008,0080': 'D', // Institution Name
  '0008,0081': 'D', // Institution Address
  '0008,1010': 'D', // Station Name
  // UIDs — handled separately via uidRemapper (action 'U')
  '0020,000D': 'U', // Study Instance UID
  '0020,000E': 'U', // Series Instance UID
  '0008,0018': 'U', // SOP Instance UID
  '0008,0014': 'U', // Instance Creator UID
  '0002,0003': 'U', // Media Storage SOP Instance UID
};

/**
 * Stable original→anonymous UID mapping for a single session. The
 * first time `remap(uid)` is called for a given UID it mints a fresh
 * one and caches it; subsequent calls return the cache.
 *
 * The output is a DICOM-conformant UID rooted under 2.25 (the
 * "registered local" private root) so the result validates against
 * the same UID rules as the original.
 */
export class UidRemapper {
  private readonly cache = new Map<string, string>();
  private readonly base: string;
  private counter = 0;

  constructor(customPrefix?: string) {
    // 2.25.<128-bit-int> is DICOM-conformant; we use a small int seeded
    // from the current ms-epoch so different sessions don't collide.
    this.base = customPrefix ?? `2.25.${Date.now()}`;
  }

  remap(originalUid: string): string {
    if (!originalUid) return originalUid;
    const cached = this.cache.get(originalUid);
    if (cached) return cached;
    this.counter += 1;
    const next = `${this.base}.${this.counter}`;
    this.cache.set(originalUid, next);
    return next;
  }

  /** Read-only view of the mapping table — useful for audit logs. */
  entries(): Array<[string, string]> {
    return Array.from(this.cache.entries());
  }
}

const PLACEHOLDER_DATE = '00000000';

function applyAction(
  element: DicomElement,
  action: AnonymizationAction,
  options: AnonymizationOptions,
  uidRemapper: UidRemapper
): DicomElement | null {
  if (action === 'K') return element;
  if (action === 'D') return null;
  if (action === 'Z') {
    return { ...element, value: element.vr === 'DA' ? PLACEHOLDER_DATE : '' };
  }
  if (action === 'X') {
    // VR-specific placeholders so the result still validates against
    // the VR's character set / length rules.
    if (element.vr === 'PN') {
      return {
        ...element,
        value: options.dummyPatientName ?? 'Anonymous',
      };
    }
    if (element.vr === 'LO' || element.vr === 'SH') {
      return {
        ...element,
        value: options.dummyPatientId ?? 'ANON-001',
      };
    }
    if (element.vr === 'DA') {
      return { ...element, value: PLACEHOLDER_DATE };
    }
    return { ...element, value: '' };
  }
  // action === 'U'
  if (typeof element.value !== 'string') return element;
  return { ...element, value: uidRemapper.remap(element.value) };
}

/**
 * Pure transform: returns a new dataset with PHI tags scrubbed.
 *
 * Walks the top level and one level of SQ items. Deeper SQ nesting
 * (rare outside SR documents) is preserved as-is — callers handling
 * SR PHI should pass the SR's content tree through their own walker.
 */
export function anonymizeDataset(
  ds: DicomDataset,
  options: AnonymizationOptions = {}
): DicomDataset {
  const uidRemapper = options.uidRemapper ?? new UidRemapper();
  // Allow `keepDescriptions` to flip description actions to K.
  const actions: Record<string, AnonymizationAction> = { ...BASE_ACTIONS };
  if (options.keepDescriptions) {
    actions['0008,1030'] = 'K';
    actions['0008,103E'] = 'K';
  }

  const out: DicomDataset = {};
  for (const [tag, element] of Object.entries(ds)) {
    const action = actions[tag.toUpperCase()];
    if (action == null) {
      // Tag not in our table — keep unchanged. (Safer default than
      // dropping unknowns; a private-tag burnt-in PHI scrubber needs
      // an opt-in pixel pass instead.)
      out[tag] = recurseIntoSqIfPresent(element, options, uidRemapper);
      continue;
    }
    const result = applyAction(element, action, options, uidRemapper);
    if (result !== null) {
      out[tag] = recurseIntoSqIfPresent(result, options, uidRemapper);
    }
  }
  return out;
}

function recurseIntoSqIfPresent(
  element: DicomElement,
  options: AnonymizationOptions,
  uidRemapper: UidRemapper
): DicomElement {
  if (!element.items) return element;
  return {
    ...element,
    items: element.items.map((item) =>
      anonymizeDataset(item, { ...options, uidRemapper })
    ),
  };
}

/**
 * Anonymise a parsed DicomFile in one shot — scrubs the dataset AND
 * remaps the file-level sopInstanceUID/sopClassUID via the same
 * remapper so cross-references stay consistent. Pure: returns a new
 * file; the input is not mutated.
 */
export function anonymizeDicomFile(
  file: DicomFile,
  options: AnonymizationOptions = {}
): DicomFile {
  const uidRemapper = options.uidRemapper ?? new UidRemapper();
  const dataset = anonymizeDataset(file.dataset, { ...options, uidRemapper });
  return {
    ...file,
    sopInstanceUID: uidRemapper.remap(file.sopInstanceUID),
    // sopClassUID is intentionally NOT remapped — it identifies the
    // storage class (e.g. "CT Image Storage"), which is registry-
    // assigned, not study-specific. Replacing it would break the
    // file's identity as a CT image.
    dataset,
  };
}

/**
 * The action plan in effect for a given options bag. Exposed so
 * callers building audit logs can show "what would happen if I
 * anonymise with these options" without actually running it.
 */
export function describeAnonymizationActions(
  options: AnonymizationOptions = {}
): Record<string, AnonymizationAction> {
  const actions = { ...BASE_ACTIONS };
  if (options.keepDescriptions) {
    actions['0008,1030'] = 'K';
    actions['0008,103E'] = 'K';
  }
  return actions;
}
