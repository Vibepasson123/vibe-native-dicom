// Measurement math.
//
// All distances are computed in IMAGE SPACE (DICOM pixel coords), then
// converted to mm via PixelSpacing (0028,0030). When pixel spacing is
// missing the result falls back to pixels (unit: 'px') — viewers should
// surface this so users know the calibration is not present, but we
// never fail the measurement.

import type {
  AngleMeasurement,
  BidirectionalMeasurement,
  CobbMeasurement,
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

/** Narrow result types — returned by individual computers below. */
export type LengthResult = { kind: 'length'; value: number; unit: 'mm' | 'px' };
export type AngleResult = { kind: 'angle'; value: number; unit: 'deg' };
export type AreaResult = {
  kind: 'area';
  value: number;
  unit: 'mm²' | 'px²';
};
export type BidirectionalResult = {
  kind: 'bidirectional';
  longAxis: number;
  shortAxis: number;
  unit: 'mm' | 'px';
  perpendicularityError: number;
};

/**
 * Linear measurement → length in mm if spacing is available, else px.
 */
export function linearResult(
  m: LinearMeasurement,
  spacing: PixelSpacingMm | null
): LengthResult {
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
export function angleResult(m: AngleMeasurement): AngleResult {
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
): AreaResult {
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

/**
 * Bidirectional (RECIST): long-axis length, short-axis length, and the
 * deviation of the second line from perpendicular to the first.
 * `perpendicularityError = 90 - |angle between the two lines|`.
 */
export function bidirectionalResult(
  m: BidirectionalMeasurement,
  spacing: PixelSpacingMm | null
): BidirectionalResult {
  const [la, lb, sa, sb] = m.points;
  const longLen = spacing ? distanceMm(la, lb, spacing) : pixelDistance(la, lb);
  const shortLen = spacing
    ? distanceMm(sa, sb, spacing)
    : pixelDistance(sa, sb);
  // Angle between the two lines: use vectors v1, v2 and atan2 of
  // cross/dot — but the line-angle is min(θ, 180-θ) so we take the
  // smaller of the two.
  const v1x = lb.x - la.x;
  const v1y = lb.y - la.y;
  const v2x = sb.x - sa.x;
  const v2y = sb.y - sa.y;
  const cross = v1x * v2y - v1y * v2x;
  const dot = v1x * v2x + v1y * v2y;
  let degrees = (Math.abs(Math.atan2(cross, dot)) * 180) / Math.PI;
  if (degrees > 90) degrees = 180 - degrees;
  const perpendicularityError = 90 - degrees;
  return {
    kind: 'bidirectional',
    longAxis: longLen,
    shortAxis: shortLen,
    unit: spacing ? 'mm' : 'px',
    perpendicularityError,
  };
}

/**
 * Cobb angle: angle between two lines defined by two endpoint pairs.
 * Reported in [0, 90]°.
 */
export function cobbResult(m: CobbMeasurement): AngleResult {
  const [a1, a2, b1, b2] = m.points;
  const v1x = a2.x - a1.x;
  const v1y = a2.y - a1.y;
  const v2x = b2.x - b1.x;
  const v2y = b2.y - b1.y;
  const cross = v1x * v2y - v1y * v2x;
  const dot = v1x * v2x + v1y * v2y;
  let degrees = (Math.abs(Math.atan2(cross, dot)) * 180) / Math.PI;
  if (degrees > 90) degrees = 180 - degrees;
  return { kind: 'angle', value: degrees, unit: 'deg' };
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
    case 'bidirectional':
      return bidirectionalResult(m, spacing);
    case 'cobb':
      return cobbResult(m);
  }
}

/** Format a single value with 3 significant figures. */
function formatValue(value: number, unit: string): string {
  if (value === 0) return `0 ${unit}`;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const decimals = Math.max(0, 2 - magnitude);
  return `${value.toFixed(decimals)} ${unit}`;
}

/** Format a result for display. Three significant figures by default. */
export function formatResult(result: MeasurementResult): string {
  if (result.kind === 'bidirectional') {
    const { longAxis, shortAxis, unit, perpendicularityError } = result;
    const long = formatValue(longAxis, unit);
    const short = formatValue(shortAxis, unit);
    // Flag when the user's two axes are visibly off from perpendicular.
    // 5° is the rule-of-thumb threshold radiologists use.
    const flag =
      Math.abs(perpendicularityError) > 5
        ? ` (⚠ ${perpendicularityError.toFixed(0)}° off perpendicular)`
        : '';
    return `${long} × ${short}${flag}`;
  }
  const { value, unit } = result;
  // For angles, integer degrees are conventional in clinical viewers.
  if (unit === 'deg') return `${value.toFixed(1)} ${unit}`;
  return formatValue(value, unit);
}
