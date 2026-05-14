// Phase 8.3 — useHangingProtocol.
//
// Thin wrapper around applyHangingProtocol that re-resolves whenever
// either the studies list or the protocol changes. Pure-TS — useful
// in any React tree; doesn't depend on Skia or the viewer.

import { useMemo, useState } from 'react';

import {
  applyHangingProtocol,
  HANGING_PROTOCOLS,
  type AppliedHangingProtocol,
  type HangingProtocol,
  type HangingProtocolName,
  type StudyDescriptor,
} from './hangingProtocol';

export type UseHangingProtocolOptions = {
  /** Initial protocol name. Defaults to 'single'. */
  initialProtocol?: HangingProtocolName;
};

export type UseHangingProtocolResult = {
  /** Currently selected protocol name (bundled key). */
  protocolName: HangingProtocolName;
  /** Switch the active protocol. */
  setProtocolName: (name: HangingProtocolName) => void;
  /** Resolved layout + slot assignments. */
  applied: AppliedHangingProtocol;
  /** The HangingProtocol record currently in effect. */
  protocol: HangingProtocol;
};

export function useHangingProtocol(
  studies: StudyDescriptor[],
  options: UseHangingProtocolOptions = {}
): UseHangingProtocolResult {
  const [protocolName, setProtocolName] = useState<HangingProtocolName>(
    options.initialProtocol ?? 'single'
  );

  const protocol = HANGING_PROTOCOLS[protocolName];

  const applied = useMemo(
    () => applyHangingProtocol(studies, protocol),
    [studies, protocol]
  );

  return { protocolName, setProtocolName, applied, protocol };
}
