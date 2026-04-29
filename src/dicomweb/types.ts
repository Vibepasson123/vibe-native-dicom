// DicomWeb (DICOM PS3.18) public type surface.
//
// We deliberately model only what real PACS deployments use today: the
// QIDO-RS / WADO-RS / STOW-RS triad over HTTPS with bearer-token auth.
// JSON is the wire format for QIDO and WADO/metadata; multipart/related
// (with `application/dicom` parts) is the wire format for WADO/instance
// and STOW.

/** Levels at which DicomWeb operates. */
export type QueryLevel = 'studies' | 'series' | 'instances';

/**
 * DICOM JSON Model (PS3.18 §F) data element. Each element keys by the
 * standard 8-hex-digit tag form (e.g. "00100010") with a Value Representation
 * and a `Value` array (some VRs use `BulkDataURI` or `InlineBinary` instead).
 */
export type DicomJsonElement = {
  vr: string;
  Value?: unknown[];
  BulkDataURI?: string;
  InlineBinary?: string;
};

/** A QIDO-RS / WADO-RS metadata response is an array of these. */
export type DicomJsonInstance = {
  [tagHex: string]: DicomJsonElement;
};

/** Auth strategies a consumer can plug in. */
export type AuthProvider =
  | { kind: 'none' }
  | { kind: 'bearer'; token: string }
  | { kind: 'basic'; username: string; password: string }
  | {
      // Custom header injector — the consumer's own integration layer
      // (refresh logic, mTLS, etc.) returns headers per request.
      kind: 'custom';
      headers: () => Record<string, string> | Promise<Record<string, string>>;
    };

export type DicomWebConfig = {
  /** Base URL of the DicomWeb service. Trailing slash is tolerated. */
  baseUrl: string;
  /** Auth strategy. Defaults to 'none'. */
  auth?: AuthProvider;
  /** Per-request timeout in milliseconds. Defaults to 30s. */
  timeoutMs?: number;
  /** Optional fetch override (tests, custom interceptors). */
  fetchImpl?: typeof fetch;
  /** Optional extra headers applied to every request. */
  extraHeaders?: Record<string, string>;
};

/** Query parameters accepted by QIDO-RS. */
export type QidoQueryParams = {
  /** DICOM tag → required match value (e.g. PatientID). */
  filters?: Record<string, string>;
  /** Limit + offset. */
  limit?: number;
  offset?: number;
  /** Comma-separated `includefield` list, or `all`. */
  includefield?: string | 'all';
  /** Fuzzymatching toggle (PS3.18 §6.7.1.2.1.1). */
  fuzzymatching?: boolean;
};

/** Reference identifying a study / series / instance. */
export type StudyRef = { studyInstanceUID: string };
export type SeriesRef = StudyRef & { seriesInstanceUID: string };
export type InstanceRef = SeriesRef & { sopInstanceUID: string };

/**
 * Result of a STOW-RS store request. PACS responses include per-instance
 * status; we surface counts and the list of failures so callers can retry
 * just the failed instances.
 */
export type StowResult = {
  storedCount: number;
  failedCount: number;
  /** SOP Instance UIDs of instances the server rejected. */
  failedSopInstanceUIDs: string[];
  /** Raw PS3.18 §6.6.1.4 status response, for callers that want it. */
  raw: DicomJsonInstance | null;
};
