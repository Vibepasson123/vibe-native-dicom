import VibeNativeDicom from './NativeVibeNativeDicom';
import type { DicomFile } from './types';

export function readDicom(path: string): DicomFile {
  // The native module returns an UnsafeObject on the JSI side — we trust the
  // C++ helper to emit the DicomFile shape. No runtime validation here in
  // Phase 2.1; Phase 2.3 wires Zod parsing for the boundary.
  return VibeNativeDicom.readDicom(path) as DicomFile;
}

export function writeSyntheticDicom(): string {
  return VibeNativeDicom.writeSyntheticDicom();
}
