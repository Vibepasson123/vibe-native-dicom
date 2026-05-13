// Phase 7.3 — DicomSegmentationOverlay.
//
// Renders a base grayscale image with a segmentation label-map blended
// on top. Same SkSL pattern as Phase 7.2's fusion viewer, but the
// "overlay" texture is a single-channel label-map (byte = segment ID)
// and the LUT is a palette indexed by segment ID, not a colormap.
//
// The label-map is passed as a Uint8Array from the consumer rather
// than a file path. Most consumers will receive it from inference
// (AI) or from a future DICOM SEG SOP decoder. Loading it from disk
// is straightforward but isn't this component's concern.

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

import { packPixelsToRgba } from './pixelPack';
import { readBinaryFile } from './platform';
import { buildSegmentPalette, type Segment } from './segmentation';
import { bytesFromLatin1 } from './windowLevel';

/** Base channel — same shape as the Phase 7.2 fusion base. */
export type SegmentationBaseChannel = {
  filePath: string;
  rows: number;
  columns: number;
  /** 8 or 16. */
  bitsAllocated: number;
  pixelRepresentation?: 0 | 1;
  windowCenter: number;
  windowWidth: number;
  rescaleSlope?: number;
  rescaleIntercept?: number;
};

export type DicomSegmentationOverlayProps = {
  base: SegmentationBaseChannel;
  /** Label-map. Must be exactly `base.rows * base.columns` bytes. */
  labelMap: Uint8Array;
  /** Segment palette. Missing IDs render as fully transparent. */
  segments: Segment[];
  /** Global overlay opacity in [0, 1]. Multiplies each segment alpha. */
  overlayOpacity: number;
  /** Sandbox per-file read. Defaults to 64 MiB. */
  maxFileBytes?: number;
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  onReady?: (info: { uploadMs: number }) => void;
  onError?: (err: Error) => void;
};

/**
 * SkSL shader. Three sampler inputs:
 *   base  — grayscale W/L source, R+G*256 packing same as Phase 3.2.
 *   label — single-channel label-map; we read the .r byte as the ID.
 *   pal   — 256×1 RGBA palette indexed by label ID.
 *
 * The label-map is uploaded as RGBA (each byte replicated into R/G/B
 * by packPixelsToRgba) so Skia's standard RGBA8888 textures cover it.
 */
const SEGMENTATION_SKSL = `
uniform shader base;
uniform shader label;
uniform shader pal;
uniform float baseBits;
uniform float baseSigned;
uniform float baseCenter;
uniform float baseWidth;
uniform float baseSlope;
uniform float baseIntercept;
uniform float overlayOpacity;

half4 main(float2 pos) {
  // --- Base channel W/L (verbatim copy of Phase 3.2 math). ---
  half4 baseRaw = base.eval(pos);
  float r8 = baseRaw.r * 255.0;
  float g8 = baseRaw.g * 255.0;
  float stored;
  if (baseBits < 12.0) {
    stored = r8;
  } else {
    stored = r8 + g8 * 256.0;
    if (baseSigned > 0.5 && stored > 32767.0) {
      stored -= 65536.0;
    }
  }
  float value = stored * baseSlope + baseIntercept;
  float lo = baseCenter - 0.5 - (baseWidth - 1.0) / 2.0;
  float hi = baseCenter - 0.5 + (baseWidth - 1.0) / 2.0;
  float bw;
  if (value <= lo) {
    bw = 0.0;
  } else if (value > hi) {
    bw = 1.0;
  } else {
    bw = (value - (baseCenter - 0.5)) / (baseWidth - 1.0) + 0.5;
  }
  bw = clamp(bw, 0.0, 1.0);

  // --- Segmentation label-map lookup. ---
  half4 lab = label.eval(pos);
  // RGBA packing replicates the byte into R/G/B; read .r.
  float segId = lab.r * 255.0;
  // Palette is 256×1; sample at (segId, 0.5).
  half4 segRgba = pal.eval(float2(segId, 0.5));

  float a = clamp(overlayOpacity, 0.0, 1.0) * float(segRgba.a);
  float r = bw * (1.0 - a) + float(segRgba.r) * a;
  float g = bw * (1.0 - a) + float(segRgba.g) * a;
  float b = bw * (1.0 - a) + float(segRgba.b) * a;
  return half4(half(r), half(g), half(b), half(1.0));
}
`;

function loadBaseImage(
  channel: SegmentationBaseChannel,
  maxFileBytes: number
): SkImageType {
  const latin1 = readBinaryFile(channel.filePath, maxFileBytes);
  const bytes = bytesFromLatin1(latin1);
  const numPixels = channel.rows * channel.columns;
  const rgba = packPixelsToRgba(bytes, channel.bitsAllocated, numPixels);
  const data = Skia.Data.fromBytes(rgba);
  const img = Skia.Image.MakeImage(
    {
      width: channel.columns,
      height: channel.rows,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Opaque,
    },
    data,
    channel.columns * 4
  );
  if (!img) throw new Error('Skia.Image.MakeImage returned null (base)');
  return img;
}

function makeLabelImage(
  labelMap: Uint8Array,
  rows: number,
  columns: number
): SkImageType {
  if (labelMap.length !== rows * columns) {
    throw new Error(
      `labelMap length ${labelMap.length} != rows*columns (${rows * columns})`
    );
  }
  // Replicate the 1-byte ID into all RGB channels so the shader's .r
  // sample is the segment ID regardless of Skia's internal handling.
  const rgba = packPixelsToRgba(labelMap, 8, labelMap.length);
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
  if (!img) throw new Error('Skia.Image.MakeImage returned null (label)');
  return img;
}

function makePaletteImage(segments: Segment[]): SkImageType {
  const lut = buildSegmentPalette(segments);
  const data = Skia.Data.fromBytes(lut);
  const img = Skia.Image.MakeImage(
    {
      width: 256,
      height: 1,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Premul,
    },
    data,
    256 * 4
  );
  if (!img) throw new Error('Skia.Image.MakeImage returned null (palette)');
  return img;
}

export function DicomSegmentationOverlay(props: DicomSegmentationOverlayProps) {
  const {
    base,
    labelMap,
    segments,
    overlayOpacity,
    maxFileBytes = 64 * 1024 * 1024,
    width,
    height,
    style,
    onReady,
    onError,
  } = props;

  const [baseImg, setBaseImg] = useState<SkImageType | null>(null);
  const [labelImg, setLabelImg] = useState<SkImageType | null>(null);

  const fxEffect = useMemo(
    () => Skia.RuntimeEffect.Make(SEGMENTATION_SKSL),
    []
  );

  // Palette re-builds when the segments list identity changes. The
  // caller is responsible for memoising `segments` if they care about
  // the cost — it's ~1 KiB and only allocs once per change.
  const paletteImg = useMemo<SkImageType | null>(() => {
    try {
      return makePaletteImage(segments);
    } catch {
      return null;
    }
  }, [segments]);

  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  }, [onReady, onError]);

  // Re-upload only on identity changes — see DicomFusionViewSkia for
  // the same rationale.
  useEffect(
    () => {
      try {
        const t0 = Date.now();
        const b = loadBaseImage(base, maxFileBytes);
        const l = makeLabelImage(labelMap, base.rows, base.columns);
        setBaseImg(b);
        setLabelImg(l);
        onReadyRef.current?.({ uploadMs: Date.now() - t0 });
      } catch (err) {
        onErrorRef.current?.(err as Error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      base.filePath,
      base.rows,
      base.columns,
      base.bitsAllocated,
      labelMap,
      maxFileBytes,
    ]
  );

  if (!baseImg || !labelImg || !paletteImg || !fxEffect) {
    return <View style={[{ width, height }, style]} />;
  }

  const uniforms = {
    baseBits: base.bitsAllocated,
    baseSigned:
      base.bitsAllocated > 8 && base.pixelRepresentation === 1 ? 1 : 0,
    baseCenter: base.windowCenter,
    baseWidth: Math.max(1, base.windowWidth),
    baseSlope: base.rescaleSlope ?? 1,
    baseIntercept: base.rescaleIntercept ?? 0,
    overlayOpacity: Math.max(0, Math.min(1, overlayOpacity)),
  };

  return (
    <View style={[{ width, height }, style]}>
      <Canvas style={{ width, height }}>
        <Group>
          <Fill>
            <Shader source={fxEffect} uniforms={uniforms}>
              <ImageShader
                image={baseImg}
                fit="contain"
                rect={{ x: 0, y: 0, width, height }}
              />
              <ImageShader
                image={labelImg}
                fit="contain"
                rect={{ x: 0, y: 0, width, height }}
              />
              <ImageShader
                image={paletteImg}
                fit="none"
                rect={{ x: 0, y: 0, width: 256, height: 1 }}
              />
            </Shader>
          </Fill>
        </Group>
      </Canvas>
      {false && <SkImage image={baseImg} x={0} y={0} width={0} height={0} />}
    </View>
  );
}
