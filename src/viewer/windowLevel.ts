// Window/Level (DICOM PS3.3 §C.11.2) — maps stored pixel intensities to
// 8-bit display values via a piecewise-linear LUT.
//
// `output_value = 255 * (input - (center - 0.5)) / (width - 1) + 0.5`
// clamped to [0, 255]. The standard form supports a "rescale slope/
// intercept" (1052/1053) that converts stored pixels to a physical unit
// (HU for CT) before W/L; we apply that here too.

export type WindowLevelInput = {
  /** Raw stored bytes from extractPixelDataToFile. */
  bytes: Uint8Array;
  /** From dataset (0028,0100) — 8 or 16 today. */
  bitsAllocated: number;
  /** From dataset (0028,0103) — 0 unsigned, 1 two's-complement signed. */
  pixelRepresentation: 0 | 1;
  /** From dataset (0028,1050). Center, in *output* (post-rescale) domain. */
  windowCenter: number;
  /** From dataset (0028,1051). Width, must be ≥ 1 per PS3.3. */
  windowWidth: number;
  /** Optional rescale slope (0028,1053). Defaults to 1. */
  rescaleSlope?: number;
  /** Optional rescale intercept (0028,1052). Defaults to 0. */
  rescaleIntercept?: number;
  /** From dataset (0028,0004). Used to invert MONOCHROME1. */
  photometricInterpretation: string;
};

/**
 * Apply window/level to `bytes` and return RGBA8 pixels (4 bytes/pixel).
 * The output buffer is alpha-opaque; R=G=B since we render grayscale.
 *
 * Phase 3.1 supports 8-bit and 16-bit MONOCHROME1 / MONOCHROME2. Color
 * (RGB / YBR_FULL_422) and signed-12-bit-stored-in-16 fall through with
 * reasonable defaults; full coverage in Phase 3.2 with the Skia/Metal
 * renderer.
 */
export function applyWindowLevel(input: WindowLevelInput): Uint8Array {
  const {
    bytes,
    bitsAllocated,
    pixelRepresentation,
    windowCenter,
    windowWidth,
    rescaleSlope = 1,
    rescaleIntercept = 0,
    photometricInterpretation,
  } = input;

  if (windowWidth < 1) {
    throw new Error(
      `applyWindowLevel: windowWidth must be >= 1 (got ${windowWidth})`
    );
  }

  const bytesPerPixel = bitsAllocated <= 8 ? 1 : 2;
  const numPixels = Math.floor(bytes.length / bytesPerPixel);
  const rgba = new Uint8Array(numPixels * 4);

  // PS3.3 §C.11.2 LUT formula (Linear Window):
  //   if (x <= c - 0.5 - (w - 1) / 2)  → ymin
  //   if (x >  c - 0.5 + (w - 1) / 2)  → ymax
  //   else  y = ((x - (c - 0.5)) / (w - 1) + 0.5) * (ymax - ymin) + ymin
  const c = windowCenter;
  const w = windowWidth;
  const lo = c - 0.5 - (w - 1) / 2;
  const hi = c - 0.5 + (w - 1) / 2;
  const invRange = 1 / (w - 1);

  // MONOCHROME1: low pixel values are bright (e.g. radiographs). Invert.
  const invert = photometricInterpretation === 'MONOCHROME1';

  // 16-bit pixels are little-endian by DICOM convention for the supported
  // transfer syntaxes (Implicit/Explicit VR LE + the JPEG family at
  // pixel-stream level). bytesPerPixel === 2 case: read as int16/uint16.
  const signed = pixelRepresentation === 1;

  for (let i = 0; i < numPixels; i++) {
    let stored: number;
    if (bytesPerPixel === 1) {
      stored = bytes[i] ?? 0;
      if (signed) stored = stored > 127 ? stored - 256 : stored;
    } else {
      const lowByte = bytes[i * 2] ?? 0;
      const highByte = bytes[i * 2 + 1] ?? 0;
      // eslint-disable-next-line no-bitwise
      stored = (highByte << 8) | lowByte;
      if (signed && stored > 32767) stored -= 65536;
    }
    // Apply rescale (stored → output domain, e.g. HU for CT).
    const value = stored * rescaleSlope + rescaleIntercept;
    let y8: number;
    if (value <= lo) {
      y8 = invert ? 255 : 0;
    } else if (value > hi) {
      y8 = invert ? 0 : 255;
    } else {
      const norm = (value - (c - 0.5)) * invRange + 0.5;
      const v = Math.max(0, Math.min(255, Math.round(norm * 255)));
      y8 = invert ? 255 - v : v;
    }
    const o = i * 4;
    rgba[o] = y8;
    rgba[o + 1] = y8;
    rgba[o + 2] = y8;
    rgba[o + 3] = 255;
  }
  return rgba;
}

/**
 * Decode a Latin-1 byte-string returned by readBinaryFile() into a
 * Uint8Array. Each char must have code point in [0, 255].
 */
export function bytesFromLatin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    // eslint-disable-next-line no-bitwise
    out[i] = s.charCodeAt(i) & 0xff;
  }
  return out;
}
