// Measurement math.
//
// All distances are computed in IMAGE SPACE (DICOM pixel coords), then
// converted to mm via PixelSpacing (0028,0030). When pixel spacing is
// missing the result falls back to pixels (unit: 'px') — viewers should
// surface this so users know the calibration is not present, but we
// never fail the measurement.

import type {
  AngleMeasurement,
  ImagePoint,
  LinearMeasurement,
  Measurement,
  MeasurementResult,
  PixelSpacingMm,
  RoiRectMeasurement,
} from './types';

/** Euclidean distance between two image points in pixels. */
export function pixelDistance(a: ImagePoint, b: ImagePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Distance in mm. PixelSpacing in DICOM is [rowSpacing, colSpacing] —
 * row spacing applies to the Y axis, column spacing to X. We convert
 * each axis independently before taking the Euclidean distance, which
 * is correct for non-square pixels (e.g. some MR sequences).
 */
export function distanceMm(
  a: ImagePoint,
  b: ImagePoint,
  spacing: PixelSpacingMm
): number {
  const dxMm = (b.x - a.x) * spacing[1];
  const dyMm = (b.y - a.y) * spacing[0];
  return Math.sqrt(dxMm * dxMm + dyMm * dyMm);
}

/**
 * Linear measurement → length in mm if spacing is available, else px.
 */
export function linearResult(
  m: LinearMeasurement,
  spacing: PixelSpacingMm | null
): MeasurementResult {
  if (spacing) {
    return {
      kind: 'length',
      value: distanceMm(m.points[0], m.points[1], spacing),
      unit: 'mm',
    };
  }
  return {
    kind: 'length',
    value: pixelDistance(m.points[0], m.points[1]),
    unit: 'px',
  };
}

/**
 * Angle at the vertex (points[1]) in degrees, between vectors v0 and v2.
 * Uses atan2 of the cross + dot products — robust against axis-aligned
 * vectors and zero-length edges.
 */
export function angleResult(m: AngleMeasurement): MeasurementResult {
  const [p0, p1, p2] = m.points;
  const v1x = p0.x - p1.x;
  const v1y = p0.y - p1.y;
  const v2x = p2.x - p1.x;
  const v2y = p2.y - p1.y;
  const cross = v1x * v2y - v1y * v2x;
  const dot = v1x * v2x + v1y * v2y;
  const radians = Math.abs(Math.atan2(cross, dot));
  const degrees = (radians * 180) / Math.PI;
  return { kind: 'angle', value: degrees, unit: 'deg' };
}

/**
 * Rectangle area in mm² (or px²). The two stored points may be in any
 * corner order — we always normalise to width × height.
 */
export function roiRectResult(
  m: RoiRectMeasurement,
  spacing: PixelSpacingMm | null
): MeasurementResult {
  const dx = Math.abs(m.points[1].x - m.points[0].x);
  const dy = Math.abs(m.points[1].y - m.points[0].y);
  if (spacing) {
    return {
      kind: 'area',
      value: dx * spacing[1] * (dy * spacing[0]),
      unit: 'mm²',
    };
  }
  return { kind: 'area', value: dx * dy, unit: 'px²' };
}

/** Polymorphic dispatcher — returns the correct result for any kind. */
export function computeResult(
  m: Measurement,
  spacing: PixelSpacingMm | null
): MeasurementResult {
  switch (m.kind) {
    case 'linear':
      return linearResult(m, spacing);
    case 'angle':
      return angleResult(m);
    case 'roi-rect':
      return roiRectResult(m, spacing);
  }
}

/** Format a result for display. Three significant figures by default. */
export function formatResult(result: MeasurementResult): string {
  const { value, unit } = result;
  // For angles, integer degrees are conventional in clinical viewers.
  if (unit === 'deg') return `${value.toFixed(1)} ${unit}`;
  // 3 sig-figs for everything else, with a fallback for zero/very-small.
  if (value === 0) return `0 ${unit}`;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const decimals = Math.max(0, 2 - magnitude);
  return `${value.toFixed(decimals)} ${unit}`;
}
