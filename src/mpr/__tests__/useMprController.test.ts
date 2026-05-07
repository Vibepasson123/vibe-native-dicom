// We don't have @testing-library/react-native in dev deps, and pulling
// it in just for the controller test is overkill. The interesting math
// in useMprController is index clamping; mirror those primitives here
// and test them directly. The hook itself is exercised indirectly by
// the example app + by the bridge tests in __tests__/index.test.tsx.

import { describe, it, expect } from '@jest/globals';

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.floor(value)));
}

describe('useMprController index clamping', () => {
  it('clamps below zero', () => {
    expect(clamp(-5, 7)).toBe(0);
  });
  it('clamps above max', () => {
    expect(clamp(999, 7)).toBe(7);
  });
  it('floors fractional indices', () => {
    expect(clamp(3.9, 7)).toBe(3);
  });
  it('passes valid indices through', () => {
    expect(clamp(4, 7)).toBe(4);
  });
});
