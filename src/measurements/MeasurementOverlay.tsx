// MeasurementOverlay — Skia layer that draws committed measurements +
// the in-progress draft on top of a DICOM image.
//
// Measurements live in image-space (pixel coords on the underlying
// DICOM). The overlay receives `imageRect` (the rectangle inside the
// canvas where the image is rendered, post-Skia 'contain' fit) and a
// gesture transform identical to the viewer's, so a finding stays
// pinned to the same anatomy as the user pans / zooms.

import { useMemo } from 'react';
import {
  Canvas,
  Circle,
  Group,
  Line,
  Path,
  Skia,
  Text as SkText,
  matchFont,
  vec,
} from '@shopify/react-native-skia';
import type { SkFont } from '@shopify/react-native-skia';
import { computeResult, formatResult } from './math';
import type {
  AngleMeasurement,
  ImagePoint,
  LinearMeasurement,
  Measurement,
  PixelSpacingMm,
  RoiRectMeasurement,
} from './types';
import type { ViewerTransform } from '../viewer/useViewerGestures';

export type MeasurementOverlayProps = {
  width: number;
  height: number;
  /** Image dimensions in pixels — used to map image-space → canvas-space. */
  imageColumns: number;
  imageRows: number;
  /** Same transform driving the viewer below. */
  transform: ViewerTransform;
  measurements: Measurement[];
  draft?: { kind: Measurement['kind']; points: ImagePoint[] } | null;
  /** Pixel spacing for mm conversion. Null → fall back to px. */
  pixelSpacing?: PixelSpacingMm | null;
  /** Stroke colour. Defaults to bright cyan for visibility on grayscale. */
  color?: string;
  strokeWidth?: number;
};

const DEFAULT_COLOR = '#22d3ee';
const DEFAULT_LABEL_FONT_SIZE = 12;

// Project an image-space point through the same chain the Skia viewer
// uses: 'contain' fit into [0,0,width,height], then the gesture
// transform (pivot-around-center: translate-to-center → rotate → scale
// → translate-back, then user translation in screen space).
function imageToCanvas(
  p: ImagePoint,
  imageColumns: number,
  imageRows: number,
  width: number,
  height: number,
  transform: ViewerTransform
): { x: number; y: number } {
  // 'contain' fit: pick the smaller scale so the image fits in either
  // axis, then centre.
  const fitScale = Math.min(width / imageColumns, height / imageRows);
  const fitW = imageColumns * fitScale;
  const fitH = imageRows * fitScale;
  const offsetX = (width - fitW) / 2;
  const offsetY = (height - fitH) / 2;

  // Image space → canvas (pre-gesture).
  let x = offsetX + p.x * fitScale;
  let y = offsetY + p.y * fitScale;

  // Pivot around centre: translate so centre is origin, rotate+scale,
  // translate back, then apply user translation.
  const cx = width / 2;
  const cy = height / 2;
  let dx = x - cx;
  let dy = y - cy;
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  x = rx * transform.scale + cx + transform.translateX;
  y = ry * transform.scale + cy + transform.translateY;
  return { x, y };
}

function buildArcPath(
  vertex: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius: number
) {
  // Arc from vertex→a direction to vertex→b direction, centred on vertex.
  const ang1 = Math.atan2(a.y - vertex.y, a.x - vertex.x);
  const ang2 = Math.atan2(b.y - vertex.y, b.x - vertex.x);
  const path = Skia.Path.Make();
  // Skia Path.addArc takes a bounding rect + start angle (deg) + sweep.
  let sweep = ((ang2 - ang1) * 180) / Math.PI;
  // Always draw the inner (smaller) arc.
  if (sweep > 180) sweep -= 360;
  if (sweep < -180) sweep += 360;
  const startDeg = (ang1 * 180) / Math.PI;
  path.addArc(
    {
      x: vertex.x - radius,
      y: vertex.y - radius,
      width: radius * 2,
      height: radius * 2,
    },
    startDeg,
    sweep
  );
  return path;
}

function LinearShape({
  m,
  project,
  color,
  strokeWidth,
  label,
  font,
}: {
  m: LinearMeasurement;
  project: (p: ImagePoint) => { x: number; y: number };
  color: string;
  strokeWidth: number;
  label: string;
  font: SkFont | null;
}) {
  const a = project(m.points[0]);
  const b = project(m.points[1]);
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2 - 8;
  return (
    <Group>
      <Line
        p1={vec(a.x, a.y)}
        p2={vec(b.x, b.y)}
        color={color}
        strokeWidth={strokeWidth}
      />
      <Circle cx={a.x} cy={a.y} r={4} color={color} />
      <Circle cx={b.x} cy={b.y} r={4} color={color} />
      {font && (
        <SkText x={midX + 6} y={midY} text={label} font={font} color={color} />
      )}
    </Group>
  );
}

function AngleShape({
  m,
  project,
  color,
  strokeWidth,
  label,
  font,
}: {
  m: AngleMeasurement;
  project: (p: ImagePoint) => { x: number; y: number };
  color: string;
  strokeWidth: number;
  label: string;
  font: SkFont | null;
}) {
  const a = project(m.points[0]);
  const v = project(m.points[1]);
  const b = project(m.points[2]);
  const arc = useMemo(() => buildArcPath(v, a, b, 18), [v, a, b]);
  return (
    <Group>
      <Line
        p1={vec(a.x, a.y)}
        p2={vec(v.x, v.y)}
        color={color}
        strokeWidth={strokeWidth}
      />
      <Line
        p1={vec(v.x, v.y)}
        p2={vec(b.x, b.y)}
        color={color}
        strokeWidth={strokeWidth}
      />
      <Path path={arc} style="stroke" color={color} strokeWidth={strokeWidth} />
      <Circle cx={a.x} cy={a.y} r={4} color={color} />
      <Circle cx={v.x} cy={v.y} r={4} color={color} />
      <Circle cx={b.x} cy={b.y} r={4} color={color} />
      {font && (
        <SkText
          x={v.x + 12}
          y={v.y - 12}
          text={label}
          font={font}
          color={color}
        />
      )}
    </Group>
  );
}

function RoiRectShape({
  m,
  project,
  color,
  strokeWidth,
  label,
  font,
}: {
  m: RoiRectMeasurement;
  project: (p: ImagePoint) => { x: number; y: number };
  color: string;
  strokeWidth: number;
  label: string;
  font: SkFont | null;
}) {
  const a = project(m.points[0]);
  const b = project(m.points[1]);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  const path = useMemo(() => {
    const p = Skia.Path.Make();
    p.addRect({ x, y, width: w, height: h });
    return p;
  }, [x, y, w, h]);
  return (
    <Group>
      <Path
        path={path}
        style="stroke"
        color={color}
        strokeWidth={strokeWidth}
      />
      {font && (
        <SkText x={x + 4} y={y - 6} text={label} font={font} color={color} />
      )}
    </Group>
  );
}

export function MeasurementOverlay(props: MeasurementOverlayProps) {
  const {
    width,
    height,
    imageColumns,
    imageRows,
    transform,
    measurements,
    draft,
    pixelSpacing = null,
    color = DEFAULT_COLOR,
    strokeWidth = 1.5,
  } = props;

  // Skia text needs a loaded font. We use a system fallback that exists
  // on every platform — we don't ship a font asset.
  const font: SkFont | null = useMemo(() => {
    try {
      return matchFont({
        fontFamily: 'system',
        fontSize: DEFAULT_LABEL_FONT_SIZE,
        fontWeight: '600',
      });
    } catch {
      return null;
    }
  }, []);

  const project = useMemo(
    () => (p: ImagePoint) =>
      imageToCanvas(p, imageColumns, imageRows, width, height, transform),
    [imageColumns, imageRows, width, height, transform]
  );

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      {measurements.map((m) => {
        const result = computeResult(m, pixelSpacing);
        const label = m.label ?? formatResult(result);
        switch (m.kind) {
          case 'linear':
            return (
              <LinearShape
                key={m.id}
                m={m}
                project={project}
                color={color}
                strokeWidth={strokeWidth}
                label={label}
                font={font}
              />
            );
          case 'angle':
            return (
              <AngleShape
                key={m.id}
                m={m}
                project={project}
                color={color}
                strokeWidth={strokeWidth}
                label={label}
                font={font}
              />
            );
          case 'roi-rect':
            return (
              <RoiRectShape
                key={m.id}
                m={m}
                project={project}
                color={color}
                strokeWidth={strokeWidth}
                label={label}
                font={font}
              />
            );
        }
      })}

      {/* Draft: in-progress placement. Render the partial points + a
          hint line where applicable. */}
      {draft &&
        draft.points.map((p, i) => {
          const c = project(p);
          return <Circle key={`d${i}`} cx={c.x} cy={c.y} r={4} color={color} />;
        })}
      {draft && draft.points.length >= 2 && (
        <Group>
          {Array.from({ length: draft.points.length - 1 }, (_, i) => {
            const a = project(draft.points[i]!);
            const b = project(draft.points[i + 1]!);
            return (
              <Line
                key={`dl${i}`}
                p1={vec(a.x, a.y)}
                p2={vec(b.x, b.y)}
                color={color}
                strokeWidth={strokeWidth}
              />
            );
          })}
        </Group>
      )}
    </Canvas>
  );
}
