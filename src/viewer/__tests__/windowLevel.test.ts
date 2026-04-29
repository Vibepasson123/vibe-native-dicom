import { describe, it, expect } from '@jest/globals';
import { applyWindowLevel, bytesFromLatin1 } from '../windowLevel';

describe('applyWindowLevel — 8-bit MONOCHROME2', () => {
  function gradient256(): Uint8Array {
    const a = new Uint8Array(256);
    for (let i = 0; i < 256; i++) a[i] = i;
    return a;
  }

  it('full range W/L matches the input gradient', () => {
    // center=128, width=256 should map 0→0, 255→255 with linear interior.
    const rgba = applyWindowLevel({
      bytes: gradient256(),
      bitsAllocated: 8,
      pixelRepresentation: 0,
      windowCenter: 128,
      windowWidth: 256,
      photometricInterpretation: 'MONOCHROME2',
    });
    expect(rgba.length).toBe(256 * 4);
    // R channel of pixel 0
    expect(rgba[0]).toBe(0);
    // R channel of pixel 255
    expect(rgba[255 * 4]).toBe(255);
    // Alpha is opaque on all
    for (let i = 3; i < rgba.length; i += 4) expect(rgba[i]).toBe(255);
  });

  it('narrow window saturates to black/white outside the range', () => {
    const rgba = applyWindowLevel({
      bytes: gradient256(),
      bitsAllocated: 8,
      pixelRepresentation: 0,
      windowCenter: 128,
      windowWidth: 10,
      photometricInterpretation: 'MONOCHROME2',
    });
    // Pixel 0 below window → black
    expect(rgba[0]).toBe(0);
    // Pixel 255 above window → white
    expect(rgba[255 * 4]).toBe(255);
    // Pixel 128 sits at the window center; PS3.3's 0.5 offset puts it
    // slightly above mid-gray. Allow [120, 145].
    expect(rgba[128 * 4]).toBeGreaterThan(120);
    expect(rgba[128 * 4]).toBeLessThan(145);
  });

  it('MONOCHROME1 inverts the LUT (low values bright)', () => {
    const rgba = applyWindowLevel({
      bytes: gradient256(),
      bitsAllocated: 8,
      pixelRepresentation: 0,
      windowCenter: 128,
      windowWidth: 256,
      photometricInterpretation: 'MONOCHROME1',
    });
    // 0 → bright, 255 → dark in MONOCHROME1.
    expect(rgba[0]).toBe(255);
    expect(rgba[255 * 4]).toBe(0);
  });

  it('rejects windowWidth < 1', () => {
    expect(() =>
      applyWindowLevel({
        bytes: new Uint8Array(4),
        bitsAllocated: 8,
        pixelRepresentation: 0,
        windowCenter: 0,
        windowWidth: 0,
        photometricInterpretation: 'MONOCHROME2',
      })
    ).toThrow(/windowWidth/);
  });
});

describe('applyWindowLevel — 16-bit signed (CT HU)', () => {
  // Build a 4-pixel int16 little-endian buffer with values
  // [-1024, -100, 40, 800] (typical CT HU range).
  function ctPixels(): Uint8Array {
    const out = new Uint8Array(8);
    const view = new DataView(out.buffer);
    view.setInt16(0, -1024, true);
    view.setInt16(2, -100, true);
    view.setInt16(4, 40, true);
    view.setInt16(6, 800, true);
    return out;
  }

  it('soft-tissue window (W=400, C=40) clamps lung to black, bone to white', () => {
    const rgba = applyWindowLevel({
      bytes: ctPixels(),
      bitsAllocated: 16,
      pixelRepresentation: 1,
      windowCenter: 40,
      windowWidth: 400,
      photometricInterpretation: 'MONOCHROME2',
    });
    // Pixel 0 (-1024 HU, lung) → below window → black
    expect(rgba[0]).toBe(0);
    // Pixel 3 (800 HU, bone-ish) → above window → white
    expect(rgba[12]).toBe(255);
    // Pixel 2 (40 HU, exactly center) → mid-gray (~127-128)
    expect(rgba[8]).toBeGreaterThanOrEqual(120);
    expect(rgba[8]).toBeLessThanOrEqual(135);
  });

  it('rescaleSlope/Intercept transforms stored→output before W/L', () => {
    // Pixels stored as 0..3, slope=1, intercept=-1000 → output -1000..-997.
    // Window centered at -1000 with width 5 should map 0→mid, 3→white-ish.
    const stored = new Uint8Array([0, 0, 1, 0, 2, 0, 3, 0]);
    const rgba = applyWindowLevel({
      bytes: stored,
      bitsAllocated: 16,
      pixelRepresentation: 0,
      windowCenter: -999,
      windowWidth: 4,
      rescaleSlope: 1,
      rescaleIntercept: -1000,
      photometricInterpretation: 'MONOCHROME2',
    });
    // stored=0 → output -1000 → just below center; should be < 128
    expect(rgba[0]).toBeLessThan(128);
    // stored=3 → output -997 → above center; should be >= 128
    expect(rgba[12]).toBeGreaterThanOrEqual(128);
  });
});

describe('bytesFromLatin1', () => {
  it('round-trips arbitrary bytes', () => {
    const original = new Uint8Array([0, 1, 127, 128, 200, 255]);
    let s = '';
    for (const b of original) s += String.fromCharCode(b);
    const decoded = bytesFromLatin1(s);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('caps each byte at 0xFF (defensive)', () => {
    // Construct a string with a code point > 255.
    const s = String.fromCharCode(0x1234);
    const decoded = bytesFromLatin1(s);
    // Low byte (0x34) is what survives the &0xFF mask.
    expect(decoded[0]).toBe(0x34);
  });
});
