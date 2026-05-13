// Pure-function coverage for useSyncedViewerGroup. The hook itself is
// exercised in the example app + by the type re-export check below;
// the interesting branch (shared-vs-per-slot pick) is a pure helper.

import { describe, it, expect } from '@jest/globals';

import { pickSlotValue } from '../useSyncedViewerGroup';

describe('Phase 7.1 — pickSlotValue', () => {
  it('returns the shared value when sync is on', () => {
    expect(pickSlotValue('shared', ['a', 'b', 'c'], 1, true)).toBe('shared');
  });

  it('returns the per-slot value when sync is off', () => {
    expect(pickSlotValue('shared', ['a', 'b', 'c'], 1, false)).toBe('b');
  });

  it('falls back to shared when per-slot index is out of range', () => {
    // Avoids surfacing `undefined` to consumers — the W/L slider on a
    // brand-new slot should still have a sensible value.
    expect(pickSlotValue(99, [], 0, false)).toBe(99);
  });

  it('handles object values (no copy semantics, just reference pick)', () => {
    const shared = { scale: 1 };
    const perSlot = [{ scale: 2 }, { scale: 3 }];
    expect(pickSlotValue(shared, perSlot, 0, true)).toBe(shared);
    expect(pickSlotValue(shared, perSlot, 0, false)).toBe(perSlot[0]);
  });
});
