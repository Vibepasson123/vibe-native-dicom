// Minimal multipart/related encoder + decoder tuned for DicomWeb.
//
// PS3.18 §6.2 mandates multipart/related with type="application/dicom" for
// DICOM-bytes transport on STOW and WADO/instance. Each part has its own
// Content-Type header followed by the raw DICOM bytes. We don't attempt
// to be a general RFC 2387 implementation — just enough to interoperate
// with dcm4chee, Orthanc, Google Cloud Healthcare, and AWS HealthImaging.

const CRLF = '\r\n';

function bytesToString(bytes: Uint8Array): string {
  // Latin-1 round-trips byte-for-byte through String — used to find the
  // boundary in a binary buffer without touching the actual DICOM bytes.
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]!);
  }
  return s;
}

function stringToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    // eslint-disable-next-line no-bitwise
    out[i] = s.charCodeAt(i) & 0xff;
  }
  return out;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * Encode a list of binary parts into a multipart/related body.
 * Returns the assembled body and the boundary string (caller embeds the
 * boundary in the Content-Type header).
 */
export function encodeMultipartRelated(
  parts: { contentType: string; bytes: Uint8Array }[],
  boundary?: string
): { body: Uint8Array; boundary: string } {
  const b = boundary ?? `vnd-boundary-${Date.now().toString(36)}`;
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    chunks.push(
      stringToBytes(
        `--${b}${CRLF}Content-Type: ${part.contentType}${CRLF}${CRLF}`
      )
    );
    chunks.push(part.bytes);
    chunks.push(stringToBytes(CRLF));
  }
  chunks.push(stringToBytes(`--${b}--${CRLF}`));
  return { body: concatBytes(chunks), boundary: b };
}

/**
 * Decode a multipart/related body. We accept the boundary either via the
 * `boundary` argument (extracted from the response Content-Type) or by
 * parsing the first `--<boundary>` line in the body.
 */
export function decodeMultipartRelated(
  bytes: Uint8Array,
  boundary: string
): { contentType: string; bytes: Uint8Array }[] {
  const text = bytesToString(bytes);
  const dashBoundary = `--${boundary}`;
  const parts: { contentType: string; bytes: Uint8Array }[] = [];

  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf(dashBoundary, cursor);
    if (start === -1) break;
    let lineEnd = start + dashBoundary.length;
    // Closing boundary "--<b>--" terminates parsing.
    if (text[lineEnd] === '-' && text[lineEnd + 1] === '-') {
      break;
    }
    // Skip CRLF after the boundary line.
    if (text.substr(lineEnd, 2) === CRLF) lineEnd += 2;

    // Read part headers until a blank line.
    const headerEnd = text.indexOf(`${CRLF}${CRLF}`, lineEnd);
    if (headerEnd === -1) break;
    const headerBlock = text.substring(lineEnd, headerEnd);
    const contentType = parseHeaderValue(headerBlock, 'Content-Type');

    // Body extends to the next boundary marker, minus the trailing CRLF.
    const bodyStart = headerEnd + 4;
    const nextBoundary = text.indexOf(`${CRLF}${dashBoundary}`, bodyStart);
    if (nextBoundary === -1) break;
    const bodyBytes = bytes.subarray(bodyStart, nextBoundary);
    parts.push({
      contentType: contentType ?? 'application/octet-stream',
      bytes: bodyBytes,
    });

    cursor = nextBoundary + CRLF.length;
  }

  return parts;
}

function parseHeaderValue(headerBlock: string, name: string): string | null {
  const lines = headerBlock.split(CRLF);
  const lower = name.toLowerCase() + ':';
  for (const line of lines) {
    if (line.toLowerCase().startsWith(lower)) {
      return line.substring(lower.length).trim();
    }
  }
  return null;
}

/**
 * Extract the boundary from a Content-Type header value such as:
 *   `multipart/related; type="application/dicom"; boundary=foo`
 * Returns null if the header is malformed or not multipart.
 */
export function extractBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=("?)([^";]+)\1/i);
  return match?.[2] ?? null;
}
