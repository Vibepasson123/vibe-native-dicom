// DicomWebClient — public surface for the QIDO / WADO / STOW triad.
//
// All methods are async and throw typed errors from ./errors. URL
// construction lives in ./url; HTTP layer in ./http; multipart en/decoding
// in ./multipart.

import { DicomWebNotFoundError, DicomWebResponseError } from './errors';
import { dicomWebFetch, readJsonArray, readJsonObject } from './http';
import {
  decodeMultipartRelated,
  encodeMultipartRelated,
  extractBoundary,
} from './multipart';
import type {
  DicomJsonInstance,
  DicomWebConfig,
  InstanceRef,
  QidoQueryParams,
  SeriesRef,
  StowResult,
  StudyRef,
} from './types';
import {
  encodeQueryString,
  framesUrl,
  instanceUrl,
  metadataUrl,
  seriesUrl,
  studiesUrl,
  studyUrl,
} from './url';

const APPLICATION_DICOM_JSON = 'application/dicom+json';
const APPLICATION_DICOM = 'application/dicom';
const MULTIPART_DICOM = `multipart/related; type="${APPLICATION_DICOM}"`;

function buildQidoQuery(p: QidoQueryParams | undefined): string {
  if (!p) return '';
  const params: Record<string, string | number | boolean | undefined> = {
    ...(p.filters ?? {}),
    limit: p.limit,
    offset: p.offset,
    includefield: p.includefield,
    fuzzymatching: p.fuzzymatching,
  };
  const qs = encodeQueryString(params);
  return qs.length > 0 ? `?${qs}` : '';
}

export class DicomWebClient {
  private readonly config: DicomWebConfig;

  constructor(config: DicomWebConfig) {
    this.config = config;
  }

  // ------------------------------- QIDO-RS -------------------------------

  /** PS3.18 §10.6: search for studies. */
  async searchStudies(params?: QidoQueryParams): Promise<DicomJsonInstance[]> {
    const url = `${studiesUrl(this.config.baseUrl)}${buildQidoQuery(params)}`;
    const response = await dicomWebFetch(this.config, {
      method: 'GET',
      url,
      accept: APPLICATION_DICOM_JSON,
    });
    return readJsonArray<DicomJsonInstance>(response, url);
  }

  /** PS3.18 §10.6: search for series within a study. */
  async searchSeries(
    studyInstanceUID: string,
    params?: QidoQueryParams
  ): Promise<DicomJsonInstance[]> {
    const url = `${seriesUrl(this.config.baseUrl, studyInstanceUID)}${buildQidoQuery(params)}`;
    const response = await dicomWebFetch(this.config, {
      method: 'GET',
      url,
      accept: APPLICATION_DICOM_JSON,
    });
    return readJsonArray<DicomJsonInstance>(response, url);
  }

  /** PS3.18 §10.6: search for instances within a series. */
  async searchInstances(
    studyInstanceUID: string,
    seriesInstanceUID: string,
    params?: QidoQueryParams
  ): Promise<DicomJsonInstance[]> {
    const url = `${instanceUrl(this.config.baseUrl, studyInstanceUID, seriesInstanceUID)}${buildQidoQuery(params)}`;
    const response = await dicomWebFetch(this.config, {
      method: 'GET',
      url,
      accept: APPLICATION_DICOM_JSON,
    });
    return readJsonArray<DicomJsonInstance>(response, url);
  }

  // ------------------------------- WADO-RS -------------------------------

  /**
   * PS3.18 §10.4.1.1.5: retrieve study metadata as DICOM JSON. Returned
   * array contains one object per instance in the study.
   */
  async retrieveStudyMetadata(ref: StudyRef): Promise<DicomJsonInstance[]> {
    const url = metadataUrl(
      studyUrl(this.config.baseUrl, ref.studyInstanceUID)
    );
    const response = await dicomWebFetch(this.config, {
      method: 'GET',
      url,
      accept: APPLICATION_DICOM_JSON,
    });
    return readJsonArray<DicomJsonInstance>(response, url);
  }

  /** PS3.18 §10.4.1.1.5: retrieve series metadata. */
  async retrieveSeriesMetadata(ref: SeriesRef): Promise<DicomJsonInstance[]> {
    const url = metadataUrl(
      seriesUrl(
        this.config.baseUrl,
        ref.studyInstanceUID,
        ref.seriesInstanceUID
      )
    );
    const response = await dicomWebFetch(this.config, {
      method: 'GET',
      url,
      accept: APPLICATION_DICOM_JSON,
    });
    return readJsonArray<DicomJsonInstance>(response, url);
  }

  /** PS3.18 §10.4.1.1.5: retrieve a single instance's metadata. */
  async retrieveInstanceMetadata(ref: InstanceRef): Promise<DicomJsonInstance> {
    const url = metadataUrl(
      instanceUrl(
        this.config.baseUrl,
        ref.studyInstanceUID,
        ref.seriesInstanceUID,
        ref.sopInstanceUID
      )
    );
    const response = await dicomWebFetch(this.config, {
      method: 'GET',
      url,
      accept: APPLICATION_DICOM_JSON,
    });
    const arr = await readJsonArray<DicomJsonInstance>(response, url);
    if (arr.length === 0) {
      throw new DicomWebNotFoundError(
        `WADO-RS metadata for instance ${ref.sopInstanceUID} returned an empty array`,
        { url }
      );
    }
    // Some PACS return [obj] for instance-level metadata; first is canonical.
    return arr[0]!;
  }

  /**
   * PS3.18 §10.4: retrieve a single instance as multipart/related DICOM
   * bytes. Returns the raw DICOM bytes of the first part. Callers can pipe
   * those bytes into readDicom() (Phase 2.1) by writing them to disk first.
   */
  async retrieveInstance(ref: InstanceRef): Promise<Uint8Array> {
    const url = instanceUrl(
      this.config.baseUrl,
      ref.studyInstanceUID,
      ref.seriesInstanceUID,
      ref.sopInstanceUID
    );
    const response = await dicomWebFetch(this.config, {
      method: 'GET',
      url,
      accept: MULTIPART_DICOM,
    });

    const respCT = response.headers.get('content-type') ?? '';
    const boundary = extractBoundary(respCT);
    if (!boundary) {
      throw new DicomWebResponseError(
        `WADO-RS response missing multipart boundary (got Content-Type: ${respCT})`,
        { url }
      );
    }
    const buf = new Uint8Array(await response.arrayBuffer());
    const parts = decodeMultipartRelated(buf, boundary);
    if (parts.length === 0 || parts[0] === undefined) {
      throw new DicomWebResponseError('WADO-RS response had no DICOM parts', {
        url,
      });
    }
    return parts[0].bytes;
  }

  /** PS3.18 §10.4.1.1.4: retrieve uncompressed pixel frames. */
  async retrieveFrames(
    ref: InstanceRef,
    frameNumbers: number[]
  ): Promise<Uint8Array[]> {
    const url = framesUrl(
      this.config.baseUrl,
      ref.studyInstanceUID,
      ref.seriesInstanceUID,
      ref.sopInstanceUID,
      frameNumbers
    );
    const response = await dicomWebFetch(this.config, {
      method: 'GET',
      url,
      // The Accept header drives transcoding on the server. We ask for raw
      // octet-stream (uncompressed PixelData); callers needing compressed
      // pixels can issue a manual fetch with a different Accept.
      accept: 'multipart/related; type="application/octet-stream"',
    });
    const respCT = response.headers.get('content-type') ?? '';
    const boundary = extractBoundary(respCT);
    if (!boundary) {
      throw new DicomWebResponseError(
        `WADO-RS frames response missing multipart boundary (got: ${respCT})`,
        { url }
      );
    }
    const buf = new Uint8Array(await response.arrayBuffer());
    const parts = decodeMultipartRelated(buf, boundary);
    return parts.map((p) => p.bytes);
  }

  // ------------------------------- STOW-RS -------------------------------

  /**
   * PS3.18 §6.6.1 / §10.5: store one or more DICOM instances. Instances
   * are sent as a single multipart/related request. Each `instance` is
   * the raw DICOM file bytes (preamble + DICM magic + dataset).
   */
  async storeInstances(
    instances: Uint8Array[],
    studyInstanceUID?: string
  ): Promise<StowResult> {
    if (instances.length === 0) {
      return {
        storedCount: 0,
        failedCount: 0,
        failedSopInstanceUIDs: [],
        raw: null,
      };
    }
    const url = studyInstanceUID
      ? studyUrl(this.config.baseUrl, studyInstanceUID)
      : studiesUrl(this.config.baseUrl);

    const { body, boundary } = encodeMultipartRelated(
      instances.map((bytes) => ({
        contentType: APPLICATION_DICOM,
        bytes,
      }))
    );

    const response = await dicomWebFetch(this.config, {
      method: 'POST',
      url,
      accept: APPLICATION_DICOM_JSON,
      body,
      bodyContentType: `multipart/related; type="${APPLICATION_DICOM}"; boundary=${boundary}`,
    });

    const raw = await readJsonObject<DicomJsonInstance>(response, url);
    return parseStowResponse(raw, instances.length);
  }
}

/**
 * PS3.18 §6.6.1.4: a STOW-RS response is a DICOM JSON object with
 * `(0008,1199) ReferencedSOPSequence` for stored, `(0008,1198)
 * FailedSOPSequence` for failures. We tolerate servers that return
 * a 200 with no body at all — treated as "all stored, no detail".
 */
export function parseStowResponse(
  raw: DicomJsonInstance | null,
  totalSent: number
): StowResult {
  if (raw === null) {
    return {
      storedCount: totalSent,
      failedCount: 0,
      failedSopInstanceUIDs: [],
      raw: null,
    };
  }
  const stored = sopUidsFromSequence(raw['00081199']);
  const failed = sopUidsFromSequence(raw['00081198']);
  return {
    storedCount: stored.length,
    failedCount: failed.length,
    failedSopInstanceUIDs: failed,
    raw,
  };
}

function sopUidsFromSequence(elem: unknown): string[] {
  if (!elem || typeof elem !== 'object') return [];
  const e = elem as { Value?: unknown[] };
  if (!Array.isArray(e.Value)) return [];
  const out: string[] = [];
  for (const item of e.Value) {
    if (!item || typeof item !== 'object') continue;
    const sopUidElem =
      (item as Record<string, unknown>)['00081155'] ??
      (item as Record<string, unknown>)['00081150']; // ReferencedSOPInstanceUID
    if (!sopUidElem || typeof sopUidElem !== 'object') continue;
    const value = (sopUidElem as { Value?: unknown[] }).Value;
    if (Array.isArray(value) && typeof value[0] === 'string') {
      out.push(value[0]);
    }
  }
  return out;
}
