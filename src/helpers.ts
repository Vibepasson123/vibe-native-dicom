// Ergonomic accessors for the DICOM tags a 2D viewer commonly needs.
//
// Pure TypeScript, no native code. Each helper is a thin read of a single
// well-known tag from a `DicomDataset`. They:
//   - return `null` (not throw) when the tag is missing or the value is
//     empty (DICOM "Type 2" / "Type 3" tags are routinely absent).
//   - parse numeric VRs (DS / IS / US / SS) into `number` / `number[]`.
//     When parsing fails we return null rather than NaN to keep callers
//     from rendering garbage values.
//   - never throw on malformed input — viewers handle "missing required
//     tag" via UI surfaces, not exceptions.
//
// Helpers grouped by which DICOM module they live on (Patient / Study /
// Series / Image / Pixel / VOI). When a viewer needs a tag not listed
// here, it can still index `dataset['GGGG,EEEE']` directly — these are
// conveniences, not gatekeepers.

import type { DicomDataset } from './types';

function readString(ds: DicomDataset, tag: string): string | null {
  const elem = ds[tag];
  if (!elem) return null;
  const v = elem.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.length > 0 ? v : null;
  return null;
}

function readSingleNumber(ds: DicomDataset, tag: string): number | null {
  const s = readString(ds, tag);
  if (s === null) return null;
  // Multi-valued DS / IS use backslash separator; first-only path is fine
  // for these tags because each is canonically single-valued.
  const first = s.split('\\')[0]?.trim() ?? '';
  if (first === '') return null;
  const n = Number(first);
  return Number.isFinite(n) ? n : null;
}

function readNumberPair(
  ds: DicomDataset,
  tag: string
): [number, number] | null {
  const s = readString(ds, tag);
  if (s === null) return null;
  const parts = s.split('\\');
  if (parts.length < 2) return null;
  const a = Number(parts[0]?.trim() ?? '');
  const b = Number(parts[1]?.trim() ?? '');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

// --- Patient module --------------------------------------------------------

export function getPatientName(ds: DicomDataset): string | null {
  return readString(ds, '0010,0010');
}
export function getPatientID(ds: DicomDataset): string | null {
  return readString(ds, '0010,0020');
}
export function getPatientBirthDate(ds: DicomDataset): string | null {
  return readString(ds, '0010,0030');
}
export function getPatientSex(ds: DicomDataset): string | null {
  return readString(ds, '0010,0040');
}

// --- Study module ----------------------------------------------------------

export function getStudyInstanceUID(ds: DicomDataset): string | null {
  return readString(ds, '0020,000D');
}
export function getStudyDate(ds: DicomDataset): string | null {
  return readString(ds, '0008,0020');
}
export function getStudyTime(ds: DicomDataset): string | null {
  return readString(ds, '0008,0030');
}
export function getStudyDescription(ds: DicomDataset): string | null {
  return readString(ds, '0008,1030');
}
export function getAccessionNumber(ds: DicomDataset): string | null {
  return readString(ds, '0008,0050');
}

// --- Series module ---------------------------------------------------------

export function getSeriesInstanceUID(ds: DicomDataset): string | null {
  return readString(ds, '0020,000E');
}
export function getSeriesNumber(ds: DicomDataset): number | null {
  return readSingleNumber(ds, '0020,0011');
}
export function getSeriesDescription(ds: DicomDataset): string | null {
  return readString(ds, '0008,103E');
}
export function getModality(ds: DicomDataset): string | null {
  return readString(ds, '0008,0060');
}

// --- Image / SOP -----------------------------------------------------------

export function getSOPInstanceUID(ds: DicomDataset): string | null {
  return readString(ds, '0008,0018');
}
export function getInstanceNumber(ds: DicomDataset): number | null {
  return readSingleNumber(ds, '0020,0013');
}

// --- Pixel geometry --------------------------------------------------------

/**
 * Pixel Spacing (0028,0030) returned as `[rowMm, colMm]`. DICOM specifies
 * row spacing first (adjacent rows) then column spacing — this helper
 * preserves that order so callers can index by axis without translation.
 */
export function getPixelSpacing(ds: DicomDataset): [number, number] | null {
  return readNumberPair(ds, '0028,0030');
}

// --- VOI (Window/Level) + rescale -----------------------------------------

/**
 * Window Center (0028,1050). May be multi-valued in DICOM — we return the
 * first value only. Callers needing all values should read the raw
 * element. Returned in the *output* domain (post rescale slope/intercept
 * application), per DICOM PS3.3 C.11.2.
 */
export function getWindowCenter(ds: DicomDataset): number | null {
  return readSingleNumber(ds, '0028,1050');
}
export function getWindowWidth(ds: DicomDataset): number | null {
  return readSingleNumber(ds, '0028,1051');
}
export function getRescaleIntercept(ds: DicomDataset): number | null {
  return readSingleNumber(ds, '0028,1052');
}
export function getRescaleSlope(ds: DicomDataset): number | null {
  return readSingleNumber(ds, '0028,1053');
}
