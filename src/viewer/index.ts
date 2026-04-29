export { DicomImageView, type DicomImageViewProps } from './DicomImageView';
// Phase 3.2 — GPU-accelerated viewer. Imports @shopify/react-native-skia
// (optional peer dep). Consumers who don't render anything won't pull
// it in; the lazy export keeps the JS-only DicomImageView usable on its
// own.
export {
  DicomImageViewSkia,
  type DicomImageViewSkiaProps,
} from './DicomImageViewSkia';
// Phase 3.3 — gesture composer. Pure TS hook on top of
// react-native-gesture-handler (optional peer dep). Reusable for
// consumers building their own viewer.
export {
  useViewerGestures,
  type ViewerTransform,
  type UseViewerGesturesResult,
} from './useViewerGestures';
export {
  applyWindowLevel,
  bytesFromLatin1,
  type WindowLevelInput,
} from './windowLevel';
export { encodeRgbaPng, pngBytesToDataUri } from './png';
