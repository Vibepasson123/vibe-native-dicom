// Phase 7.2 — DicomFusionViewSkia.
//
// Composites two grayscale pixel buffers (e.g. CT base + PET overlay)
// in a single fragment shader. The base channel runs through the same
// W/L LUT the Phase 3.2 viewer uses; the overlay channel runs through
// its own W/L and then through a 256-entry colormap LUT (hot / jet /
// gray) sampled as a side texture. The shader composites the overlay
// over the base with a uniform `overlayOpacity` for alpha blending.
//
// Same caveats as DicomImageViewSkia: Skia is an optional peer dep,
// imported lazily. Consumers who never render a fusion view don't
// pay the install cost.

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

import { buildColormapLut, type ColormapName } from './colormaps';
import { packPixelsToRgba } from './pixelPack';
import { bytesFromLatin1 } from './windowLevel';
import { readBinaryFile } from './platform';

/** Per-channel source descriptor. */
export type FusionChannel = {
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

export type DicomFusionViewSkiaProps = {
  base: FusionChannel;
  overlay: FusionChannel;
  /** Overlay alpha in [0, 1]. 0 = base only, 1 = overlay only. */
  overlayOpacity: number;
  /** Colormap applied to the overlay W/L output. Defaults to 'hot'. */
  overlayColormap?: ColormapName;
  /** Sandbox per-file read. Defaults to 64 MiB per channel. */
  maxFileBytes?: number;
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
  onReady?: (info: { uploadMs: number }) => void;
  onError?: (err: Error) => void;
};

/**
 * SkSL shader. Two source channels go through identical W/L math; the
 * overlay is then looked up in a 256-entry colormap texture and
 * alpha-blended over the base. The base channel is always rendered as
 * a grayscale RGB triplet so the colormap can shift the *combined*
 * pixel's hue (vs. the overlay's contribution alone).
 *
 * Uniforms:
 *   base, overlay, lut          — three shaders (textures)
 *   baseBits, baseSigned, ...   — same W/L params as DicomImageViewSkia
 *   overlayBits, overlaySigned, ...
 *   overlayOpacity              — [0, 1] uniform alpha
 *   imgW, imgH                  — shared display dimensions
 */
const FUSION_SKSL = `
uniform shader base;
uniform shader overlay;
uniform shader lut;
uniform float baseBits;
uniform float baseSigned;
uniform float baseCenter;
uniform float baseWidth;
uniform float baseSlope;
uniform float baseIntercept;
uniform float overlayBits;
uniform float overlaySigned;
uniform float overlayCenter;
uniform float overlayWidth;
uniform float overlaySlope;
uniform float overlayIntercept;
uniform float overlayOpacity;
uniform float imgW;
uniform float imgH;

float windowLevel(float r8, float g8, float bits, float signedFlag,
                  float center, float width, float slope, float intercept) {
  float stored;
  if (bits < 12.0) {
    stored = r8;
  } else {
    stored = r8 + g8 * 256.0;
    if (signedFlag > 0.5 && stored > 32767.0) {
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
  return clamp(y, 0.0, 1.0);
}

half4 main(float2 pos) {
  // Base channel: standard W/L → grayscale.
  half4 baseRaw = base.eval(pos);
  float bw = windowLevel(baseRaw.r * 255.0, baseRaw.g * 255.0,
                          baseBits, baseSigned, baseCenter, baseWidth,
                          baseSlope, baseIntercept);

  // Overlay channel: same W/L math, output is the colormap LUT index.
  half4 ovRaw = overlay.eval(pos);
  float ow = windowLevel(ovRaw.r * 255.0, ovRaw.g * 255.0,
                          overlayBits, overlaySigned, overlayCenter,
                          overlayWidth, overlaySlope, overlayIntercept);

  // Sample the 256x1 colormap LUT at (ow*255, 0).
  half4 ovColor = lut.eval(float2(ow * 255.0, 0.5));

  // Alpha-blend overlay over base. Base is a grayscale RGB triplet.
  float a = clamp(overlayOpacity, 0.0, 1.0);
  float r = bw * (1.0 - a) + ovColor.r * a;
  float g = bw * (1.0 - a) + ovColor.g * a;
  float b = bw * (1.0 - a) + ovColor.b * a;
  return half4(half(r), half(g), half(b), half(1.0));
}
`;

function loadChannelImage(channel: FusionChannel, maxFileBytes: number) {
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
  if (!img) {
    throw new Error('Skia.Image.MakeImage returned null');
  }
  return img;
}

export function DicomFusionViewSkia(props: DicomFusionViewSkiaProps) {
  const {
    base,
    overlay,
    overlayOpacity,
    overlayColormap = 'hot',
    maxFileBytes = 64 * 1024 * 1024,
    width,
    height,
    style,
    onReady,
    onError,
  } = props;

  const [baseImg, setBaseImg] = useState<SkImageType | null>(null);
  const [overlayImg, setOverlayImg] = useState<SkImageType | null>(null);

  const fusionEffect = useMemo(() => Skia.RuntimeEffect.Make(FUSION_SKSL), []);

  // Build a fresh 256×1 RGBA LUT whenever the colormap name changes.
  // Cheap (1 KiB), worth re-doing rather than caching across renders.
  const lutImage = useMemo<SkImageType | null>(() => {
    const lut = buildColormapLut(overlayColormap);
    const data = Skia.Data.fromBytes(lut);
    return Skia.Image.MakeImage(
      {
        width: 256,
        height: 1,
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Opaque,
      },
      data,
      256 * 4
    );
  }, [overlayColormap]);

  // Stable ref to callbacks so the upload effect doesn't re-fire on
  // every parent render that passes a new inline function.
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  }, [onReady, onError]);

  // Only re-upload on the identity fields. Listening on the whole
  // `base` / `overlay` objects would re-fire whenever the consumer
  // passed a fresh inline literal even with the same content — that
  // would re-read both files every parent render. W/L values (which
  // can change every slider tick) are uniforms only; no re-upload.
  useEffect(
    () => {
      try {
        const t0 = Date.now();
        const b = loadChannelImage(base, maxFileBytes);
        const o = loadChannelImage(overlay, maxFileBytes);
        setBaseImg(b);
        setOverlayImg(o);
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
      overlay.filePath,
      overlay.rows,
      overlay.columns,
      overlay.bitsAllocated,
      maxFileBytes,
    ]
  );

  if (!baseImg || !overlayImg || !lutImage || !fusionEffect) {
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
    overlayBits: overlay.bitsAllocated,
    overlaySigned:
      overlay.bitsAllocated > 8 && overlay.pixelRepresentation === 1 ? 1 : 0,
    overlayCenter: overlay.windowCenter,
    overlayWidth: Math.max(1, overlay.windowWidth),
    overlaySlope: overlay.rescaleSlope ?? 1,
    overlayIntercept: overlay.rescaleIntercept ?? 0,
    overlayOpacity: Math.max(0, Math.min(1, overlayOpacity)),
    imgW: base.columns,
    imgH: base.rows,
  };

  return (
    <View style={[{ width, height }, style]}>
      <Canvas style={{ width, height }}>
        <Group>
          <Fill>
            <Shader source={fusionEffect} uniforms={uniforms}>
              <ImageShader
                image={baseImg}
                fit="contain"
                rect={{ x: 0, y: 0, width, height }}
              />
              <ImageShader
                image={overlayImg}
                fit="contain"
                rect={{ x: 0, y: 0, width, height }}
              />
              <ImageShader
                image={lutImage}
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
