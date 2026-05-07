// Measurement core types.
//
// Measurements are stored in IMAGE SPACE (pixel coordinates on the
// underlying DICOM, NOT screen pixels). The overlay applies the same
// pan/zoom/rotate transform the viewer uses, so a measurement attached
// to a finding stays attached even as the user scrolls and zooms.
//
// Each measurement carries an immutable `id` (so consumers can persist
// them) and a `label` for the UI. The numeric `result` is computed at
// render time from the points + pixel spacing — we don't store derived
// values, otherwise out-of-date numbers diverge from the geometry.

export type ImagePoint = {
  /** Column (X) in image-space pixels. */
  x: number;
  /** Row (Y) in image-space pixels. */
  y: number;
};

export type LinearMeasurement = {
  id: string;
  kind: 'linear';
  /** Two endpoints. */
  points: [ImagePoint, ImagePoint];
  /** Optional human label; defaults to a tool-default at render time. */
  label?: string;
};

export type AngleMeasurement = {
  id: string;
  kind: 'angle';
  /** Three points: [endpoint, vertex, endpoint]. The angle is at points[1]. */
  points: [ImagePoint, ImagePoint, ImagePoint];
  label?: string;
};

export type RoiRectMeasurement = {
  id: string;
  kind: 'roi-rect';
  /** Two opposing corners. Width/height derived; sign-agnostic. */
  points: [ImagePoint, ImagePoint];
  label?: string;
};

/**
 * Bidirectional (RECIST 1.1): two perpendicular lines through a target
 * lesion. Stored as 4 points in the order:
 *   [longA, longB, shortA, shortB]
 * The long-axis is the longest in-plane diameter; the short-axis is
 * the longest perpendicular diameter. We don't auto-orthogonalise —
 * the result reports the deviation from 90° so the user can correct.
 */
export type BidirectionalMeasurement = {
  id: string;
  kind: 'bidirectional';
  points: [ImagePoint, ImagePoint, ImagePoint, ImagePoint];
  label?: string;
};

/**
 * Cobb angle (spinal curvature): two lines defined by two endpoint
 * pairs. The angle is between the two LINES (not rays from a shared
 * vertex), reported in [0, 90]°.
 *   [line1A, line1B, line2A, line2B]
 */
export type CobbMeasurement = {
  id: string;
  kind: 'cobb';
  points: [ImagePoint, ImagePoint, ImagePoint, ImagePoint];
  label?: string;
};

export type Measurement =
  | LinearMeasurement
  | AngleMeasurement
  | RoiRectMeasurement
  | BidirectionalMeasurement
  | CobbMeasurement;

export type MeasurementToolKind = Measurement['kind'];

/** Pixel spacing in mm: [rowSpacing, columnSpacing] from (0028,0030). */
export type PixelSpacingMm = readonly [number, number];

/** Result of a length / area / angle computation. */
export type MeasurementResult =
  | { kind: 'length'; value: number; unit: 'mm' | 'px' }
  | { kind: 'angle'; value: number; unit: 'deg' }
  | { kind: 'area'; value: number; unit: 'mm²' | 'px²' }
  | {
      kind: 'bidirectional';
      longAxis: number;
      shortAxis: number;
      unit: 'mm' | 'px';
      /** Deviation of the short axis from perpendicular to the long axis,
       *  in degrees. Ideally 0; |perpendicularityError| > a few degrees
       *  indicates the user should adjust. */
      perpendicularityError: number;
    };
