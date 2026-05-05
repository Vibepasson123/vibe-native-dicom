// Inverse of the image→canvas projection used by MeasurementOverlay.
//
// Given a tap in canvas coordinates (relative to the viewer's top-left)
// + the image dimensions + the gesture transform, returns the
// image-space pixel coordinate that was hit. Used by the tap-to-place
// flow to convert touch events into measurement points.

import type { ImagePoint } from './types';
import type { ViewerTransform } from '../viewer/useViewerGestures';

export function canvasToImage(
  canvasX: number,
  canvasY: number,
  imageColumns: number,
  imageRows: number,
  width: number,
  height: number,
  transform: ViewerTransform
): ImagePoint {
  // Reverse the user translation, then the pivot-around-centre rotate +
  // scale, then the 'contain' fit.
  const cx = width / 2;
  const cy = height / 2;
  const x1 = canvasX - transform.translateX - cx;
  const y1 = canvasY - transform.translateY - cy;
  const safeScale = transform.scale === 0 ? 1 : transform.scale;
  const x2 = x1 / safeScale;
  const y2 = y1 / safeScale;
  const cos = Math.cos(-transform.rotation);
  const sin = Math.sin(-transform.rotation);
  const x3 = x2 * cos - y2 * sin + cx;
  const y3 = x2 * sin + y2 * cos + cy;

  // 'contain' fit inverse.
  const fitScale = Math.min(width / imageColumns, height / imageRows);
  const fitW = imageColumns * fitScale;
  const fitH = imageRows * fitScale;
  const offsetX = (width - fitW) / 2;
  const offsetY = (height - fitH) / 2;
  return {
    x: (x3 - offsetX) / fitScale,
    y: (y3 - offsetY) / fitScale,
  };
}
