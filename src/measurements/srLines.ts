// Pure-TS helper: turn a list of Measurement objects into the
// human-readable lines that go into a Basic Text SR's CONTAINER.
//
// Lives in its own module so tests + non-native consumers can pull it
// without dragging in the TurboModule import chain.

import type { Measurement, PixelSpacingMm } from './types';
import { computeResult, formatResult } from './math';

export function measurementsToSrLines(
  measurements: Measurement[],
  spacing: PixelSpacingMm | null
): string[] {
  return measurements.map((m) => {
    const r = computeResult(m, spacing);
    const formatted = formatResult(r);
    const pts = m.points
      .map((p) => `(${p.x.toFixed(2)},${p.y.toFixed(2)})`)
      .join(' ');
    return `${m.kind}: ${formatted} · pts ${pts}`;
  });
}
