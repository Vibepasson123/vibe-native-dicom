// Phase 8.3 — workflow primitives (hanging protocols).
export {
  applyHangingProtocol,
  findAssignmentAt,
  sortStudiesByDate,
  SINGLE,
  CT_AXIAL_2UP,
  PRIOR_CURRENT,
  PET_CT_FUSION,
  HANGING_PROTOCOLS,
  type StudyDescriptor,
  type ProtocolSlot,
  type HangingProtocol,
  type HangingProtocolName,
  type SlotAssignment,
  type AppliedHangingProtocol,
} from './hangingProtocol';
export {
  useHangingProtocol,
  type UseHangingProtocolOptions,
  type UseHangingProtocolResult,
} from './useHangingProtocol';
