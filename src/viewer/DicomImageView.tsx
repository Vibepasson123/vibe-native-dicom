// <DicomImageView> — Phase 3.1 viewer.
//
// Reads pixel bytes from a file (produced by extractPixelDataToFile),
// applies window/level + photometric interpretation handling, encodes a
// PNG in pure JS, and renders it via RN's <Image>. Phase 3.2 replaces
// the pure-JS path with native Skia/Metal rendering for smooth W/L
// interaction on real CT slices.

import { useEffect, useState } from 'react';
import { Image, View, type StyleProp, type ImageStyle } from 'react-native';
import { readBinaryFile } from './platform';
import {
  applyWindowLevel,
  bytesFromLatin1,
  type WindowLevelInput,
} from './windowLevel';
import { encodeRgbaPng, pngBytesToDataUri } from './png';

export type DicomImageViewProps = {
  /** Path written by extractPixelDataToFile.filePath. */
  filePath: string;
  rows: number;
  columns: number;
  bitsAllocated: number;
  /** Defaults to 0 (unsigned). */
  pixelRepresentation?: 0 | 1;
  /** Defaults to "MONOCHROME2". */
  photometricInterpretation?: string;
  windowCenter: number;
  windowWidth: number;
  /** Defaults to 1. */
  rescaleSlope?: number;
  /** Defaults to 0. */
  rescaleIntercept?: number;
  /** Sandbox to keep the PNG decode bounded. Defaults to 64 MiB. */
  maxFileBytes?: number;
  style?: StyleProp<ImageStyle>;
  /** Called once the first frame has rendered, with its render time in ms. */
  onRendered?: (info: { renderMs: number; pngBytes: number }) => void;
  /** Called on any error in the load/encode pipeline. */
  onError?: (err: Error) => void;
};

export function DicomImageView(props: DicomImageViewProps) {
  const {
    filePath,
    rows,
    columns,
    bitsAllocated,
    pixelRepresentation = 0,
    photometricInterpretation = 'MONOCHROME2',
    windowCenter,
    windowWidth,
    rescaleSlope,
    rescaleIntercept,
    maxFileBytes = 64 * 1024 * 1024,
    style,
    onRendered,
    onError,
  } = props;

  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const start = Date.now();
    try {
      const latin1 = readBinaryFile(filePath, maxFileBytes);
      const bytes = bytesFromLatin1(latin1);
      const wlInput: WindowLevelInput = {
        bytes,
        bitsAllocated,
        pixelRepresentation,
        windowCenter,
        windowWidth,
        rescaleSlope,
        rescaleIntercept,
        photometricInterpretation,
      };
      const rgba = applyWindowLevel(wlInput);
      const png = encodeRgbaPng(rgba, columns, rows);
      const dataUri = pngBytesToDataUri(png);
      if (!cancelled) {
        setUri(dataUri);
        onRendered?.({ renderMs: Date.now() - start, pngBytes: png.length });
      }
    } catch (err) {
      if (!cancelled) onError?.(err as Error);
    }
    return () => {
      cancelled = true;
    };
  }, [
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
    maxFileBytes,
    onRendered,
    onError,
  ]);

  if (uri === null) {
    // Pass `style` cast to the View — the consumer-provided ImageStyle is
    // a strict subset of ViewStyle for the layout properties we care about
    // (width / height / margin / etc.).
    return <View style={style as StyleProp<ImageStyle>} />;
  }
  return (
    <Image
      style={style}
      source={{ uri }}
      // Disable default smoothing to keep pixels crisp at high zoom.
      resizeMethod="scale"
      // Image scaling preserves aspect ratio when 'contain' is used.
      resizeMode="contain"
      // Hint to RN that the source dimensions are known — keeps layout
      // stable while reading the file.
      width={columns}
      height={rows}
    />
  );
}
