import { describe, it, expect } from '@jest/globals';
import {
  decodeMultipartRelated,
  encodeMultipartRelated,
  extractBoundary,
} from '../multipart';

// TextEncoder / TextDecoder are global at runtime in node + browser; the
// React Native default TS lib doesn't include them, so we declare them.
declare const TextEncoder: { new (): { encode: (s: string) => Uint8Array } };
declare const TextDecoder: {
  new (): { decode: (b: Uint8Array) => string };
};

describe('extractBoundary', () => {
  it('reads the boundary from a Content-Type with quotes', () => {
    expect(
      extractBoundary(
        'multipart/related; type="application/dicom"; boundary="abc"'
      )
    ).toBe('abc');
  });

  it('reads the boundary without quotes', () => {
    expect(
      extractBoundary('multipart/related; type=application/dicom; boundary=xyz')
    ).toBe('xyz');
  });

  it('returns null when no boundary is present', () => {
    expect(extractBoundary('application/dicom+json')).toBeNull();
  });
});

describe('encodeMultipartRelated + decodeMultipartRelated round trip', () => {
  it('preserves binary bytes through round trip', () => {
    const part1 = new Uint8Array([0x44, 0x49, 0x43, 0x4d, 0x00, 0x01, 0xff]); // DICM\0\1\xff
    const part2 = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const { body, boundary } = encodeMultipartRelated([
      { contentType: 'application/dicom', bytes: part1 },
      { contentType: 'application/dicom', bytes: part2 },
    ]);

    const decoded = decodeMultipartRelated(body, boundary);
    expect(decoded).toHaveLength(2);
    expect(decoded[0]?.contentType).toBe('application/dicom');
    expect(Array.from(decoded[0]!.bytes)).toEqual(Array.from(part1));
    expect(Array.from(decoded[1]!.bytes)).toEqual(Array.from(part2));
  });

  it('uses the provided boundary verbatim', () => {
    const part = new Uint8Array([1, 2, 3]);
    const { body, boundary } = encodeMultipartRelated(
      [{ contentType: 'application/dicom', bytes: part }],
      'fixed-boundary'
    );
    expect(boundary).toBe('fixed-boundary');
    expect(new TextDecoder().decode(body)).toContain('--fixed-boundary');
  });

  it('decodes a single-part body', () => {
    const part = new Uint8Array([0x10, 0x20, 0x30]);
    const { body, boundary } = encodeMultipartRelated([
      { contentType: 'application/dicom', bytes: part },
    ]);
    const decoded = decodeMultipartRelated(body, boundary);
    expect(decoded).toHaveLength(1);
    expect(Array.from(decoded[0]!.bytes)).toEqual([0x10, 0x20, 0x30]);
  });

  it('returns empty array for a body with no parts', () => {
    const empty = new TextEncoder().encode('--nope--\r\n');
    expect(decodeMultipartRelated(empty, 'real-boundary')).toEqual([]);
  });
});
