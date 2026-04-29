import { describe, it, expect } from '@jest/globals';
import { encodeRgbaPng, pngBytesToDataUri } from '../png';

describe('encodeRgbaPng', () => {
  it('produces a PNG with the standard signature', () => {
    const rgba = new Uint8Array([255, 0, 0, 255]); // 1×1 red
    const png = encodeRgbaPng(rgba, 1, 1);
    // PNG signature: 89 50 4e 47 0d 0a 1a 0a
    expect(Array.from(png.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });

  it('encodes IHDR with the requested width/height/depth/colorType', () => {
    const rgba = new Uint8Array(2 * 3 * 4); // 2×3 transparent
    const png = encodeRgbaPng(rgba, 2, 3);
    // Skip signature (8 bytes), then IHDR length (4) + type "IHDR" (4),
    // IHDR data starts at offset 16.
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16, false)).toBe(2); // width
    expect(view.getUint32(20, false)).toBe(3); // height
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(6); // color type RGBA
  });

  it('throws when rgba.length does not match width*height*4', () => {
    expect(() => encodeRgbaPng(new Uint8Array(15), 2, 2)).toThrow();
  });

  it('terminates with IEND', () => {
    const rgba = new Uint8Array(4);
    const png = encodeRgbaPng(rgba, 1, 1);
    // IEND chunk is the last 12 bytes: length=0 + "IEND" + crc(4).
    const tail = Array.from(png.subarray(png.length - 12));
    expect(tail.slice(0, 4)).toEqual([0, 0, 0, 0]); // length 0
    expect(tail.slice(4, 8)).toEqual([
      'I'.charCodeAt(0),
      'E'.charCodeAt(0),
      'N'.charCodeAt(0),
      'D'.charCodeAt(0),
    ]);
  });

  it('IHDR CRC validates against an independent CRC32 implementation', () => {
    const rgba = new Uint8Array(4);
    const png = encodeRgbaPng(rgba, 1, 1);
    // IHDR runs from offset 8 (length) — type+data is offsets 12..28 (17 bytes).
    const ihdrTypeAndData = png.subarray(12, 12 + 4 + 13);
    // Naive CRC32 ourselves and compare with the bytes at offset 12+4+13.
    function crc32(b: Uint8Array): number {
      let c = 0xffffffff;
      for (let i = 0; i < b.length; i++) {
        // eslint-disable-next-line no-bitwise
        c ^= b[i] ?? 0;
        for (let k = 0; k < 8; k++) {
          // eslint-disable-next-line no-bitwise
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
      }
      // eslint-disable-next-line no-bitwise
      return (c ^ 0xffffffff) >>> 0;
    }
    const expected = crc32(ihdrTypeAndData);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const actual = view.getUint32(12 + 4 + 13, false);
    expect(actual).toBe(expected);
  });
});

describe('pngBytesToDataUri', () => {
  it('produces an image/png base64 data URI', () => {
    const png = new Uint8Array([1, 2, 3]);
    const uri = pngBytesToDataUri(png);
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
    expect(uri.endsWith('AQID')).toBe(true); // base64 of [1,2,3]
  });

  it('handles single-byte tail (1 byte → ??==)', () => {
    const png = new Uint8Array([0x4d]);
    const uri = pngBytesToDataUri(png);
    expect(uri).toBe('data:image/png;base64,TQ==');
  });

  it('handles two-byte tail (2 bytes → ???=)', () => {
    const png = new Uint8Array([0x4d, 0x61]);
    const uri = pngBytesToDataUri(png);
    expect(uri).toBe('data:image/png;base64,TWE=');
  });
});
