// Phase 7.2 — pixel-pack helper shared between the single-image and
// fusion viewers.
//
// 8-bit case: pack stored gray into all RGB channels.
// 16-bit case: pack low byte → R, high byte → G, B=0, A=255. The
//   shader recombines (R + G*256) and treats as int16/uint16.
// RGBA8 case (samplesPerPixel=4): pass through unchanged.
//
// Lifted out of DicomImageViewSkia in Phase 7.2 so the fusion viewer
// can share the same byte layout without duplicating the loop.

export function packPixelsToRgba(
  bytes: Uint8Array,
  bitsAllocated: number,
  numPixels: number,
  samplesPerPixel: number = 1
): Uint8Array {
  if (samplesPerPixel === 4) {
    const expected = numPixels * 4;
    if (bytes.length === expected) return bytes;
    const out = new Uint8Array(expected);
    out.set(bytes.subarray(0, Math.min(bytes.length, expected)));
    return out;
  }
  const rgba = new Uint8Array(numPixels * 4);
  if (bitsAllocated <= 8) {
    for (let i = 0; i < numPixels; i++) {
      const v = bytes[i] ?? 0;
      const o = i * 4;
      rgba[o] = v;
      rgba[o + 1] = v;
      rgba[o + 2] = v;
      rgba[o + 3] = 255;
    }
  } else {
    for (let i = 0; i < numPixels; i++) {
      const lo = bytes[i * 2] ?? 0;
      const hi = bytes[i * 2 + 1] ?? 0;
      const o = i * 4;
      rgba[o] = lo;
      rgba[o + 1] = hi;
      rgba[o + 2] = 0;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}
