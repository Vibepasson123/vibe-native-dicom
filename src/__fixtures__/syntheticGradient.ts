/* eslint-disable no-bitwise -- inline SHA-256 needs bitwise ops by definition */
// Phase 9.3 — frozen reference fixture for the synthetic gradient
// that the native C++ side emits when consumers call
// `writeSyntheticDicom()` + `extractPixelDataToFile()`.
//
// The C++ writer (cpp/dicom_write.cpp) lays out a 16×16 8-bit
// MONOCHROME2 image where the stored value of pixel index `i` is
// `i % 256`. That's the exact buffer extractPixelDataToFile returns
// for the default 1-frame synthetic. Anywhere we accept "the
// synthetic gradient" — example app, MPR fixtures, V&V bundles —
// must agree on this contract, so we pin it here.
//
// The companion test (`src/__tests__/syntheticGradientFixture.test.ts`)
// hashes the reference buffer and compares against a frozen SHA-256.
// Any drift in either this generator or the native contract fails CI;
// auditors reading a V&V bundle see "the byte-level reference fixture
// is the same in commit X as it was in commit X-100".
//
// Lives under `src/__fixtures__/` rather than `src/__tests__/` so
// Jest's default discovery pattern (which globs every file under
// `__tests__/`) doesn't try to execute it as a test suite.

// Tiny SHA-256 (pure JS, no node:crypto types needed under the
// project's tsconfig). The fixture buffer is 256 bytes — a textbook
// SHA-256 over a single block is fine here, and avoids adding
// @types/node just for the test-only fixture.

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function sha256Hex(bytes: Uint8Array): string {
  // Pad: append 0x80, then zeros, then 64-bit length in bits, big-endian.
  const bitLen = bytes.length * 8;
  // Total block-aligned length = bytes + 1 (0x80) + 8 (length); round
  // up to multiple of 64.
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  // Write bit length as 64-bit big-endian. Our inputs are < 2^32 bits,
  // so the high 32 bits are 0.
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a;
  let h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const wt15 = w[t - 15]!;
      const wt2 = w[t - 2]!;
      const s0 = rotr(wt15, 7) ^ rotr(wt15, 18) ^ (wt15 >>> 3);
      const s1 = rotr(wt2, 17) ^ rotr(wt2, 19) ^ (wt2 >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      hv = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hv + S1 + ch + K[t]! + w[t]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hv = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + hv) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

export const SYNTHETIC_ROWS = 16;
export const SYNTHETIC_COLUMNS = 16;
export const SYNTHETIC_PIXEL_COUNT = SYNTHETIC_ROWS * SYNTHETIC_COLUMNS;

/**
 * SHA-256 hex digest of the canonical 16×16 8-bit gradient. Pinned at
 * Phase 9.3 freeze. If you change the C++ writer's pixel formula, you
 * must (a) deliberately update this constant, (b) commit it in the
 * same change as the C++ edit so blame attribution stays clean, and
 * (c) note the drift in `docs/regulatory/anomaly-list.md`.
 */
export const SYNTHETIC_GRADIENT_SHA256 =
  '40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880';

/**
 * Generate the canonical reference buffer. Pure function — no I/O, no
 * Skia, no native. The contract is `pixel[i] = i % 256` over 16×16.
 */
export function generateSyntheticGradient(): Uint8Array {
  const out = new Uint8Array(SYNTHETIC_PIXEL_COUNT);
  for (let i = 0; i < out.length; i++) {
    out[i] = i % 256;
  }
  return out;
}

/**
 * Hash a pixel buffer. Exposed so test reporters can render the hash
 * of an unknown-good run alongside the frozen reference — makes the
 * failure mode "expected X, got Y" instead of just "mismatch".
 */
export function hashPixelBuffer(buf: Uint8Array): string {
  return sha256Hex(buf);
}
