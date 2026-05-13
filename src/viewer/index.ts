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
// Phase 3.4 — multi-frame cine controller. Pure TS, no peer deps.
export {
  useFrameSequence,
  type FrameSequenceOptions,
  type FrameSequenceState,
} from './useFrameSequence';
// Phase 7.1 — synced side-by-side viewer group (comparison workflow).
export {
  useSyncedViewerGroup,
  pickSlotValue,
  type SyncedViewerAxes,
  type SyncedViewerInitialState,
  type SyncedViewerSlot,
  type UseSyncedViewerGroupOptions,
  type UseSyncedViewerGroupResult,
} from './useSyncedViewerGroup';
export {
  applyWindowLevel,
  bytesFromLatin1,
  type WindowLevelInput,
} from './windowLevel';
export { encodeRgbaPng, pngBytesToDataUri } from './png';
