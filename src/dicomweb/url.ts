// URL building for DicomWeb endpoints (PS3.18 §6).
//
// PS3.18 strictly orders the path segments: /studies/{su}/series/{seu}/
// instances/{iu}/frames/{f1,f2,...}. We build them programmatically rather
// than via string interpolation so a missing UID is a typecheck error, not
// a 404 at runtime.

export function joinUrl(base: string, ...segments: string[]): string {
  const trimmedBase = base.replace(/\/+$/, '');
  const cleaned = segments
    .filter((s) => s != null && s.length > 0)
    .map((s) => s.replace(/^\/+|\/+$/g, ''));
  return [trimmedBase, ...cleaned].join('/');
}

/**
 * Encode a query parameter map to a URL-encoded string. Skips undefined,
 * passes through values verbatim (DicomWeb tag-based filters use raw
 * tag-equals-value form, not deeply URL-encoded).
 */
export function encodeQueryString(
  params: Record<string, string | number | boolean | undefined>
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    );
  }
  return parts.join('&');
}

export function studiesUrl(base: string): string {
  return joinUrl(base, 'studies');
}

export function studyUrl(base: string, studyInstanceUID: string): string {
  return joinUrl(base, 'studies', studyInstanceUID);
}

export function seriesUrl(
  base: string,
  studyInstanceUID: string,
  seriesInstanceUID?: string
): string {
  return seriesInstanceUID
    ? joinUrl(base, 'studies', studyInstanceUID, 'series', seriesInstanceUID)
    : joinUrl(base, 'studies', studyInstanceUID, 'series');
}

export function instanceUrl(
  base: string,
  studyInstanceUID: string,
  seriesInstanceUID: string,
  sopInstanceUID?: string
): string {
  return sopInstanceUID
    ? joinUrl(
        base,
        'studies',
        studyInstanceUID,
        'series',
        seriesInstanceUID,
        'instances',
        sopInstanceUID
      )
    : joinUrl(
        base,
        'studies',
        studyInstanceUID,
        'series',
        seriesInstanceUID,
        'instances'
      );
}

export function metadataUrl(resourceUrl: string): string {
  return joinUrl(resourceUrl, 'metadata');
}

export function framesUrl(
  base: string,
  studyInstanceUID: string,
  seriesInstanceUID: string,
  sopInstanceUID: string,
  frameNumbers: number[]
): string {
  if (frameNumbers.length === 0) {
    throw new Error('framesUrl requires at least one frame number');
  }
  // PS3.18 §10.4.1.1.1: 1-based frame indices, comma-separated.
  return joinUrl(
    base,
    'studies',
    studyInstanceUID,
    'series',
    seriesInstanceUID,
    'instances',
    sopInstanceUID,
    'frames',
    frameNumbers.join(',')
  );
}
