import { describe, it, expect } from '@jest/globals';

import {
  SYNTHETIC_COLUMNS,
  SYNTHETIC_GRADIENT_SHA256,
  SYNTHETIC_PIXEL_COUNT,
  SYNTHETIC_ROWS,
  generateSyntheticGradient,
  hashPixelBuffer,
} from '../__fixtures__/syntheticGradient';

describe('Phase 9.3 — synthetic gradient fixture', () => {
  // The contract under verification is shared by:
  //   - cpp/dicom_write.cpp (writeSyntheticDicom default)
  //   - extractPixelDataToFile native helper
  //   - the example app's "RUN ×10" prefetch + cache demos
  //   - every Phase 7 overlay / fusion panel rendering "the gradient"
  //
  // If any of those change their pixel formula, this hash drifts and
  // we want a single test to flag it, not 20.

  it('reports the documented dimensions', () => {
    expect(SYNTHETIC_ROWS).toBe(16);
    expect(SYNTHETIC_COLUMNS).toBe(16);
    expect(SYNTHETIC_PIXEL_COUNT).toBe(256);
  });

  it('generator returns 256 bytes (1 byte per pixel × 16×16)', () => {
    const buf = generateSyntheticGradient();
    expect(buf).toBeInstanceOf(Uint8Array);
    expect(buf.length).toBe(SYNTHETIC_PIXEL_COUNT);
  });

  it('realises the `pixel[i] = i % 256` contract at the byte level', () => {
    const buf = generateSyntheticGradient();
    for (let i = 0; i < buf.length; i++) {
      expect(buf[i]).toBe(i % 256);
    }
  });

  it('SHA-256 of the buffer matches the frozen reference', () => {
    // Frozen at Phase 9.3 — see fixtures/syntheticGradient.ts header.
    const actual = hashPixelBuffer(generateSyntheticGradient());
    expect(actual).toBe(SYNTHETIC_GRADIENT_SHA256);
  });

  it('two independent generations produce byte-identical output (deterministic)', () => {
    const a = generateSyntheticGradient();
    const b = generateSyntheticGradient();
    expect(hashPixelBuffer(a)).toBe(hashPixelBuffer(b));
  });
});
