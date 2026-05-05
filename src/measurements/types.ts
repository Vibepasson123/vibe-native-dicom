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

export type Measurement =
  | LinearMeasurement
  | AngleMeasurement
  | RoiRectMeasurement;

export type MeasurementToolKind = Measurement['kind'];

/** Pixel spacing in mm: [rowSpacing, columnSpacing] from (0028,0030). */
export type PixelSpacingMm = readonly [number, number];

/** Result of a length / area / angle computation. */
export type MeasurementResult =
  | { kind: 'length'; value: number; unit: 'mm' | 'px' }
  | { kind: 'angle'; value: number; unit: 'deg' }
  | { kind: 'area'; value: number; unit: 'mm²' | 'px²' };
