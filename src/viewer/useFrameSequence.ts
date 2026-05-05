// useFrameSequence — cine playback controller for multi-frame DICOMs.
//
// Returns:
//   - frame: current frame index (0-based)
//   - isPlaying: boolean
//   - play(), pause(), togglePlay()
//   - seek(idx) — jumps to a specific frame
//   - next(), prev() — single-step
//
// Implementation: setInterval-driven advance. Keeps callbacks stable
// across renders so the consumer's <DicomImageViewSkia frameIndex={...}>
// re-renders on every tick without re-creating the timer.

import { useCallback, useEffect, useRef, useState } from 'react';

export type FrameSequenceOptions = {
  numberOfFrames: number;
  /** Frames per second. Defaults to 10 (typical cardiac/cine cadence). */
  fps?: number;
  /** Loop when the last frame is reached. Defaults to true. */
  loop?: boolean;
};

export type FrameSequenceState = {
  frame: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (idx: number) => void;
  next: () => void;
  prev: () => void;
};

export function useFrameSequence(
  opts: FrameSequenceOptions
): FrameSequenceState {
  const { numberOfFrames, fps = 10, loop = true } = opts;
  const total = Math.max(1, Math.floor(numberOfFrames));
  const periodMs = Math.max(1, Math.round(1000 / Math.max(1, fps)));

  const [frame, setFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Latest frame value, accessed inside the interval callback to avoid
  // re-creating the timer on every tick.
  const frameRef = useRef(0);
  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  // Clamp on numberOfFrames change (e.g. switching files).
  useEffect(() => {
    if (frame >= total) {
      setFrame(0);
    }
  }, [total, frame]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      const cur = frameRef.current;
      if (cur + 1 >= total) {
        if (loop) {
          setFrame(0);
        } else {
          setIsPlaying(false);
        }
        return;
      }
      setFrame(cur + 1);
    }, periodMs);
    return () => clearInterval(id);
  }, [isPlaying, periodMs, total, loop]);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);
  const seek = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(total - 1, Math.floor(idx)));
      setFrame(clamped);
    },
    [total]
  );
  const next = useCallback(() => seek(frameRef.current + 1), [seek]);
  const prev = useCallback(() => seek(frameRef.current - 1), [seek]);

  return { frame, isPlaying, play, pause, togglePlay, seek, next, prev };
}
