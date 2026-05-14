// Phase 7.4 — DicomRtStructOverlay.
//
// Renders contour polylines on top of an existing DicomImageViewSkia.
// We layer two views: the existing viewer at the bottom (handles W/L,
// gestures, etc.) and a second Skia <Canvas> on top that draws each
// structure as a stroked path. Both layers share width/height so the
// pixelToScreen math lines up exactly.
//
// Why a separate canvas instead of an SkSL shader: contours are
// sparse line geometry, not per-fragment data. Skia's Path API is
// the right tool — anti-aliased strokes, GPU-rasterised, no shader
// needed.

import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  Canvas,
  Group,
  Path,
  Skia,
  type SkPath,
} from '@shopify/react-native-skia';

import { DicomImageViewSkia } from './DicomImageViewSkia';
import { pixelToScreen, type Structure } from './rtStruct';

export type DicomRtStructOverlayProps = {
  filePath: string;
  rows: number;
  columns: number;
  bitsAllocated: number;
  pixelRepresentation?: 0 | 1;
  photometricInterpretation?: string;
  windowCenter: number;
  windowWidth: number;
  rescaleSlope?: number;
  rescaleIntercept?: number;
  /** Structures to draw on the current slice. */
  structures: Structure[];
  /** Global stroke opacity; multiplied per-structure. */
  overlayOpacity: number;
  /** Optional fill (alpha-blended over the base). Defaults to false. */
  fill?: boolean;
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Build a single Skia path covering all contours of a structure.
 * Avoids one Path component per polyline — caller passes one Path per
 * structure to Skia, which the GPU rasterises in a single draw call.
 */
function buildStructurePath(
  structure: Structure,
  mapper: typeof pixelToScreen,
  imageCols: number,
  imageRows: number,
  canvasW: number,
  canvasH: number
): SkPath | null {
  if (structure.contours.length === 0) return null;
  const path = Skia.Path.Make();
  const closed = structure.closed ?? true;
  for (const contour of structure.contours) {
    if (contour.length === 0) continue;
    const first = contour[0]!;
    const p0 = mapper(first.x, first.y, imageCols, imageRows, canvasW, canvasH);
    path.moveTo(p0.x, p0.y);
    for (let i = 1; i < contour.length; i++) {
      const p = contour[i]!;
      const s = mapper(p.x, p.y, imageCols, imageRows, canvasW, canvasH);
      path.lineTo(s.x, s.y);
    }
    if (closed) path.close();
  }
  return path;
}

export function DicomRtStructOverlay(props: DicomRtStructOverlayProps) {
  const {
    filePath,
    rows,
    columns,
    bitsAllocated,
    pixelRepresentation,
    photometricInterpretation,
    windowCenter,
    windowWidth,
    rescaleSlope,
    rescaleIntercept,
    structures,
    overlayOpacity,
    fill = false,
    width,
    height,
    style,
  } = props;

  // Build one Skia path per structure. Re-compute whenever the
  // contours or canvas geometry change; mid-frame mutations on a
  // single SkPath would not trigger Skia's render.
  const paths = useMemo(
    () =>
      structures.map((s) => ({
        structure: s,
        path: buildStructurePath(
          s,
          pixelToScreen,
          columns,
          rows,
          width,
          height
        ),
      })),
    [structures, columns, rows, width, height]
  );

  const globalA = Math.max(0, Math.min(1, overlayOpacity));

  return (
    <View style={[{ width, height }, style]}>
      <DicomImageViewSkia
        filePath={filePath}
        rows={rows}
        columns={columns}
        bitsAllocated={bitsAllocated}
        pixelRepresentation={pixelRepresentation}
        photometricInterpretation={photometricInterpretation}
        windowCenter={windowCenter}
        windowWidth={windowWidth}
        rescaleSlope={rescaleSlope}
        rescaleIntercept={rescaleIntercept}
        width={width}
        height={height}
        enableGestures={false}
      />
      <Canvas style={[StyleSheet.absoluteFill, { width, height }]}>
        <Group>
          {paths.map(({ structure, path }, i) => {
            if (!path) return null;
            const a =
              globalA * Math.max(0, Math.min(1, structure.opacity ?? 1));
            const stroke = structure.strokeWidth ?? 1.5;
            return (
              <Group key={`${structure.id}-${i}`}>
                {fill && (
                  // Filled polygons go first (under the stroke) so the
                  // outline reads on top of the fill.
                  <Path
                    path={path}
                    color={`rgba(${Math.round(structure.r * 255)},${Math.round(structure.g * 255)},${Math.round(structure.b * 255)},${a * 0.35})`}
                    style="fill"
                  />
                )}
                <Path
                  path={path}
                  color={`rgba(${Math.round(structure.r * 255)},${Math.round(structure.g * 255)},${Math.round(structure.b * 255)},${a})`}
                  style="stroke"
                  strokeWidth={stroke}
                />
              </Group>
            );
          })}
        </Group>
      </Canvas>
    </View>
  );
}
