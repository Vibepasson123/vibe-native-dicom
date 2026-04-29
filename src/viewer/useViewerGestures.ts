// Pan / pinch-zoom / rotate gesture composer for the DICOM viewer.
//
// Returns:
//   - transform: { scale, translateX, translateY, rotation } current state.
//   - composedGesture: pass to <GestureDetector gesture={composedGesture}>.
//   - reset(): snap back to identity.
//
// Implementation notes:
//   - Pan + pinch + rotate compose simultaneously via Gesture.Simultaneous.
//   - Each gesture maintains its own "save state" captured at gesture start
//     (savedScale / savedTx / savedTy / savedRotation). Updates are applied
//     RELATIVE to the saved state so multiple drags accumulate naturally.
//   - We accept gesture-handler 2.20+ which exposes Gesture.* APIs. Older
//     versions had PinchGestureHandler components — explicitly unsupported.

import { useCallback, useRef, useState } from 'react';
import { Gesture, type ComposedGesture } from 'react-native-gesture-handler';

export type ViewerTransform = {
  scale: number;
  translateX: number;
  translateY: number;
  /** Radians. */
  rotation: number;
};

export type UseViewerGesturesResult = {
  transform: ViewerTransform;
  composedGesture: ComposedGesture;
  reset: () => void;
};

const IDENTITY: ViewerTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
  rotation: 0,
};

export function useViewerGestures(opts?: {
  minScale?: number;
  maxScale?: number;
}): UseViewerGesturesResult {
  const minScale = opts?.minScale ?? 0.25;
  const maxScale = opts?.maxScale ?? 16;

  const [transform, setTransform] = useState<ViewerTransform>(IDENTITY);
  // useRef so the gesture closures see the latest committed values
  // without re-creating the composed gesture on every transform change.
  const ref = useRef<ViewerTransform>(IDENTITY);

  // Saved state per-gesture, captured at onBegin / onStart.
  const savedScale = useRef(1);
  const savedTx = useRef(0);
  const savedTy = useRef(0);
  const savedRotation = useRef(0);

  const commit = useCallback((next: ViewerTransform) => {
    ref.current = next;
    setTransform(next);
  }, []);

  const clamp = useCallback(
    (s: number) => Math.min(maxScale, Math.max(minScale, s)),
    [maxScale, minScale]
  );

  const panGesture = Gesture.Pan()
    .onStart(() => {
      savedTx.current = ref.current.translateX;
      savedTy.current = ref.current.translateY;
    })
    .onUpdate((e) => {
      commit({
        ...ref.current,
        translateX: savedTx.current + e.translationX,
        translateY: savedTy.current + e.translationY,
      });
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.current = ref.current.scale;
    })
    .onUpdate((e) => {
      commit({
        ...ref.current,
        scale: clamp(savedScale.current * e.scale),
      });
    });

  const rotateGesture = Gesture.Rotation()
    .onStart(() => {
      savedRotation.current = ref.current.rotation;
    })
    .onUpdate((e) => {
      commit({
        ...ref.current,
        rotation: savedRotation.current + e.rotation,
      });
    });

  const composedGesture = Gesture.Simultaneous(
    panGesture,
    pinchGesture,
    rotateGesture
  );

  const reset = useCallback(() => commit(IDENTITY), [commit]);

  return { transform, composedGesture, reset };
}
