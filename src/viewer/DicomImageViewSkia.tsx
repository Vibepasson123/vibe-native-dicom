// <DicomImageViewSkia> — GPU-accelerated viewer.
//
// Reads pixel bytes from a file once, uploads them to a GPU texture
// (encoded into RGBA so the 16-bit case fits), and applies window/level
// in an SkSL fragment shader. W/L slider movement only changes uniforms;
// the pixel buffer is uploaded exactly once. This drops Phase 3.1's
// per-frame PNG-encode cost entirely — slider drag stays interactive
// even on 512×512 CT slices.
//
// Skia is an OPTIONAL peer dep. Consumers who don't import this module
// won't pay the install cost. We import it lazily via `require` so the
// JS-only viewer (DicomImageView, Phase 3.1) keeps working when Skia
// isn't installed.

import { useEffect, useMemo, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import {
  AlphaType,
  Canvas,
  ColorType,
  Fill,
  Group,
  Image as SkImage,
  Skia,
  Shader,
  ImageShader,
  type SkImage as SkImageType,
} from '@shopify/react-native-skia';
import { GestureDetector } from 'react-native-gesture-handler';
import { readBinaryFile } from './platform';
import { useViewerGestures, type ViewerTransform } from './useViewerGestures';

export type DicomImageViewSkiaProps = {
  /** Path written by extractPixelDataToFile.filePath. */
  filePath: string;
  rows: number;
  columns: number;
  /** 8 or 16; 16-bit values are encoded as R(low) + G(high) channels. */
  bitsAllocated: number;
  /** 0 unsigned (default), 1 two's-complement signed (16-bit only). */
  pixelRepresentation?: 0 | 1;
  /** "MONOCHROME1" inverts the LUT. Defaults to "MONOCHROME2". */
  photometricInterpretation?: string;
  windowCenter: number;
  windowWidth: number;
  rescaleSlope?: number;
  rescaleIntercept?: number;
  /** Sandbox to keep memory bounded. Defaults to 64 MiB. */
  maxFileBytes?: number;
  /** Display size on screen. Skia handles the scale-up. */
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  onReady?: (info: { uploadMs: number }) => void;
  onError?: (err: Error) => void;
  /**
   * Phase 3.3: enable pinch / pan / rotate gestures. When `true` (default),
   * the component wraps the Skia canvas in a <GestureDetector>. Set to
   * `false` to disable interaction (for thumbnails, multi-frame cine, etc.).
   * Requires react-native-gesture-handler >= 2.20.
   */
  enableGestures?: boolean;
  /** Called after each gesture update with the current transform. */
  onTransformChange?: (transform: ViewerTransform) => void;
  /**
   * Phase 3.4 — multi-frame support. Defaults to 1.
   * extractPixelDataToFile concatenates every frame into a single buffer
   * (frame0_bytes ++ frame1_bytes ++ …). When numberOfFrames > 1 we slice
   * the buffer at frame boundaries; frameIndex picks which slice to upload.
   * The whole buffer is read once and cached; only the SkImage texture is
   * re-built on frame change, so cine playback stays smooth.
   */
  numberOfFrames?: number;
  frameIndex?: number;
};

/**
 * 8-bit case: pack stored gray into all RGB channels.
 * 16-bit case: pack low byte → R, high byte → G, B=0, A=255.
 * The shader recombines (R + G*256) and treats as int16/uint16.
 */
function packPixelsToRgba(
  bytes: Uint8Array,
  bitsAllocated: number,
  numPixels: number
): Uint8Array {
  const rgba = new Uint8Array(numPixels * 4);
  if (bitsAllocated <= 8) {
    for (let i = 0; i < numPixels; i++) {
      const v = bytes[i] ?? 0;
      const o = i * 4;
      rgba[o] = v;
      rgba[o + 1] = v;
      rgba[o + 2] = v;
      rgba[o + 3] = 255;
    }
  } else {
    for (let i = 0; i < numPixels; i++) {
      const lo = bytes[i * 2] ?? 0;
      const hi = bytes[i * 2 + 1] ?? 0;
      const o = i * 4;
      rgba[o] = lo;
      rgba[o + 1] = hi;
      rgba[o + 2] = 0;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

function bytesFromLatin1Local(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    // eslint-disable-next-line no-bitwise
    out[i] = s.charCodeAt(i) & 0xff;
  }
  return out;
}

/**
 * SkSL shader. Samples the source as RGBA, reconstructs the stored pixel
 * value (8-bit: just R; 16-bit: R + G*256, optionally signed-corrected),
 * applies rescale + W/L, and writes a grayscale color. Photometric
 * MONOCHROME1 is handled by inverting after the LUT.
 *
 * Uniforms:
 *   bits        — 8 or 16
 *   signed16    — 1.0 if pixelRepresentation=1 and bits=16, else 0.0
 *   center      — window center (output domain, post rescale)
 *   width       — window width (≥ 1)
 *   slope       — rescale slope
 *   intercept   — rescale intercept
 *   invert      — 1.0 for MONOCHROME1, 0.0 for MONOCHROME2
 *   imgW, imgH  — texture dimensions (pixels)
 */
const WINDOW_LEVEL_SKSL = `
uniform shader src;
uniform float bits;
uniform float signed16;
uniform float center;
uniform float width;
uniform float slope;
uniform float intercept;
uniform float invert;
uniform float imgW;
uniform float imgH;

half4 main(float2 pos) {
  half4 raw = src.eval(pos);
  // RGBA bytes from Skia are in [0,1]; multiply back to [0,255].
  float r8 = raw.r * 255.0;
  float g8 = raw.g * 255.0;

  float stored;
  if (bits < 12.0) {
    stored = r8;
  } else {
    stored = r8 + g8 * 256.0;
    if (signed16 > 0.5 && stored > 32767.0) {
      stored -= 65536.0;
    }
  }
  float value = stored * slope + intercept;

  float lo = center - 0.5 - (width - 1.0) / 2.0;
  float hi = center - 0.5 + (width - 1.0) / 2.0;
  float y;
  if (value <= lo) {
    y = 0.0;
  } else if (value > hi) {
    y = 1.0;
  } else {
    y = (value - (center - 0.5)) / (width - 1.0) + 0.5;
  }
  if (invert > 0.5) y = 1.0 - y;
  y = clamp(y, 0.0, 1.0);
  return half4(half(y), half(y), half(y), half(1.0));
}
`;

export function DicomImageViewSkia(props: DicomImageViewSkiaProps) {
  const {
    filePath,
    rows,
    columns,
    bitsAllocated,
    pixelRepresentation = 0,
    photometricInterpretation = 'MONOCHROME2',
    windowCenter,
    windowWidth,
    rescaleSlope = 1,
    rescaleIntercept = 0,
    maxFileBytes = 64 * 1024 * 1024,
    width,
    height,
    style,
    onReady,
    onError,
    enableGestures = true,
    onTransformChange,
    numberOfFrames = 1,
    frameIndex = 0,
  } = props;

  const totalFrames = Math.max(1, Math.floor(numberOfFrames));
  const safeFrameIndex = Math.max(
    0,
    Math.min(totalFrames - 1, Math.floor(frameIndex))
  );

  const [skImage, setSkImage] = useState<SkImageType | null>(null);
  // Cached raw pixel buffer (full file, all frames). Read once per
  // filePath/geometry change so cine playback doesn't re-hit disk.
  const bufferRef = useRef<Uint8Array | null>(null);
  // Re-render trigger when the cached buffer is replaced — useState is
  // overkill (we don't read the value), so a counter does it.
  const [bufferEpoch, setBufferEpoch] = useState(0);
  const { transform, composedGesture } = useViewerGestures();

  // Notify the consumer whenever gestures change the transform. Effect
  // (rather than calling within render) avoids "setState during render"
  // warnings when consumers update their own state in onTransformChange.
  useEffect(() => {
    onTransformChange?.(transform);
  }, [transform, onTransformChange]);

  // Compile the W/L shader once. It's reused for every frame.
  const wlEffect = useMemo(
    () => Skia.RuntimeEffect.Make(WINDOW_LEVEL_SKSL),
    []
  );

  // Read the file once per `filePath / geometry` change. Bytes are cached
  // in `bufferRef`; the per-frame upload effect below slices into it.
  useEffect(() => {
    let cancelled = false;
    try {
      const t0 = Date.now();
      const latin1 = readBinaryFile(filePath, maxFileBytes);
      const bytes = bytesFromLatin1Local(latin1);
      if (!cancelled) {
        bufferRef.current = bytes;
        setBufferEpoch((e) => e + 1);
        onReady?.({ uploadMs: Date.now() - t0 });
      }
    } catch (err) {
      if (!cancelled) onError?.(err as Error);
    }
    return () => {
      cancelled = true;
    };
  }, [filePath, maxFileBytes, onReady, onError]);

  // Upload the requested frame as a Skia texture. Re-runs whenever
  // bufferEpoch (= file change), frameIndex, or geometry changes. The W/L
  // shader reuses the texture across slider movement; no upload there.
  useEffect(() => {
    const buffer = bufferRef.current;
    if (!buffer) return;
    try {
      const numPixels = rows * columns;
      const bytesPerPixel = bitsAllocated <= 8 ? 1 : 2;
      const frameBytes = numPixels * bytesPerPixel;

      // Bounds check: frameIndex outside the buffer means a corrupt or
      // mis-declared file. Better to surface than to render a torn image.
      const start = safeFrameIndex * frameBytes;
      if (start + frameBytes > buffer.length) {
        throw new Error(
          `frame ${safeFrameIndex} out of range (buffer ${buffer.length}B, ` +
            `expected ${(safeFrameIndex + 1) * frameBytes}B for ` +
            `${totalFrames} frames of ${frameBytes}B each)`
        );
      }
      const slice = buffer.subarray(start, start + frameBytes);

      const rgba = packPixelsToRgba(slice, bitsAllocated, numPixels);
      const data = Skia.Data.fromBytes(rgba);
      const img = Skia.Image.MakeImage(
        {
          width: columns,
          height: rows,
          colorType: ColorType.RGBA_8888,
          alphaType: AlphaType.Opaque,
        },
        data,
        columns * 4
      );
      if (!img) throw new Error('Skia.Image.MakeImage returned null');
      setSkImage(img);
    } catch (err) {
      onError?.(err as Error);
    }
  }, [
    bufferEpoch,
    safeFrameIndex,
    totalFrames,
    rows,
    columns,
    bitsAllocated,
    onError,
  ]);

  if (!skImage || !wlEffect) {
    return <View style={[{ width, height }, style]} />;
  }

  const uniforms = {
    bits: bitsAllocated,
    signed16: bitsAllocated > 8 && pixelRepresentation === 1 ? 1 : 0,
    center: windowCenter,
    width: Math.max(1, windowWidth),
    slope: rescaleSlope,
    intercept: rescaleIntercept,
    invert: photometricInterpretation === 'MONOCHROME1' ? 1 : 0,
    imgW: columns,
    imgH: rows,
  };

  // Build the Skia transform array. We translate to the canvas center,
  // apply rotation + scale around that point, then translate back —
  // standard pivot-around-center pattern. User translation is applied
  // last (in screen space).
  const cx = width / 2;
  const cy = height / 2;
  const skiaTransform = [
    { translateX: transform.translateX + cx },
    { translateY: transform.translateY + cy },
    { rotate: transform.rotation },
    { scale: transform.scale },
    { translateX: -cx },
    { translateY: -cy },
  ];

  const canvas = (
    <Canvas style={{ width, height }}>
      <Group transform={skiaTransform}>
        <Fill>
          <Shader source={wlEffect} uniforms={uniforms}>
            <ImageShader
              image={skImage}
              fit="contain"
              rect={{ x: 0, y: 0, width, height }}
            />
          </Shader>
        </Fill>
      </Group>
    </Canvas>
  );

  return (
    <View style={[{ width, height }, style]}>
      {enableGestures ? (
        <GestureDetector gesture={composedGesture}>{canvas}</GestureDetector>
      ) : (
        canvas
      )}
      {/* The off-screen <Image/> is never rendered — kept here so type
          imports of SkImage stay tree-shakable until used. */}
      {false && <SkImage image={skImage} x={0} y={0} width={0} height={0} />}
    </View>
  );
}
