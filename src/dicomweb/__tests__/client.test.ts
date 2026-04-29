import { describe, it, expect, jest } from '@jest/globals';
import { DicomWebClient } from '../client';
import {
  DicomWebAuthError,
  DicomWebError,
  DicomWebNetworkError,
  DicomWebNotFoundError,
  DicomWebResponseError,
  DicomWebServerError,
  DicomWebTimeoutError,
} from '../errors';
import { encodeMultipartRelated } from '../multipart';

type FetchCall = { url: string; init: RequestInit };

function makeJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/dicom+json' },
    ...init,
  });
}

function makeFetchMock(
  responder: (url: string, init: RequestInit) => Response | Promise<Response>
): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return responder(url, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('DicomWebClient — QIDO-RS', () => {
  it('searchStudies calls /studies with Accept: application/dicom+json', async () => {
    const { fetchImpl, calls } = makeFetchMock(() =>
      makeJsonResponse([{ '00100010': { vr: 'PN', Value: ['Doe^John'] } }])
    );
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    const result = await client.searchStudies();
    expect(result).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://pacs/dw/studies');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.Accept).toBe('application/dicom+json');
  });

  it('searchStudies builds query string from filters + paging', async () => {
    const { fetchImpl, calls } = makeFetchMock(() => makeJsonResponse([]));
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    await client.searchStudies({
      filters: { PatientID: 'P-001', StudyDate: '20260101-20261231' },
      limit: 50,
      offset: 0,
      includefield: 'all',
      fuzzymatching: true,
    });
    const url = calls[0]!.url;
    expect(url).toContain('PatientID=P-001');
    expect(url).toContain('StudyDate=20260101-20261231');
    expect(url).toContain('limit=50');
    expect(url).toContain('includefield=all');
    expect(url).toContain('fuzzymatching=true');
  });

  it('searchSeries scopes to a study', async () => {
    const { fetchImpl, calls } = makeFetchMock(() => makeJsonResponse([]));
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    await client.searchSeries('1.2.3');
    expect(calls[0]?.url).toBe('https://pacs/dw/studies/1.2.3/series');
  });

  it('searchInstances scopes to a series', async () => {
    const { fetchImpl, calls } = makeFetchMock(() => makeJsonResponse([]));
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    await client.searchInstances('1.2.3', '4.5.6');
    expect(calls[0]?.url).toBe(
      'https://pacs/dw/studies/1.2.3/series/4.5.6/instances'
    );
  });

  it('returns [] when the server replies with null body / no JSON', async () => {
    const { fetchImpl } = makeFetchMock(
      () =>
        new Response('null', {
          status: 200,
          headers: { 'content-type': 'application/dicom+json' },
        })
    );
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    const result = await client.searchStudies();
    expect(result).toEqual([]);
  });

  it('throws DicomWebResponseError when JSON is not an array', async () => {
    const { fetchImpl } = makeFetchMock(() =>
      makeJsonResponse({ not: 'array' })
    );
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    await expect(client.searchStudies()).rejects.toBeInstanceOf(
      DicomWebResponseError
    );
  });
});

describe('DicomWebClient — auth', () => {
  it('bearer auth attaches Authorization header', async () => {
    const { fetchImpl, calls } = makeFetchMock(() => makeJsonResponse([]));
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
      auth: { kind: 'bearer', token: 'xyz' },
    });
    await client.searchStudies();
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer xyz');
  });

  it('basic auth base64-encodes user:pass', async () => {
    const { fetchImpl, calls } = makeFetchMock(() => makeJsonResponse([]));
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
      auth: { kind: 'basic', username: 'alice', password: 'secret' },
    });
    await client.searchStudies();
    const headers = calls[0]?.init?.headers as Record<string, string>;
    // 'alice:secret' base64 = 'YWxpY2U6c2VjcmV0'
    expect(headers.Authorization).toBe('Basic YWxpY2U6c2VjcmV0');
  });

  it('custom auth runs the provided async header function', async () => {
    const { fetchImpl, calls } = makeFetchMock(() => makeJsonResponse([]));
    const headerFn = jest.fn(async () => ({ 'X-Custom': 'value' }));
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
      auth: { kind: 'custom', headers: headerFn },
    });
    await client.searchStudies();
    expect(headerFn).toHaveBeenCalled();
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers['X-Custom']).toBe('value');
  });

  it('extraHeaders is applied to every request', async () => {
    const { fetchImpl, calls } = makeFetchMock(() => makeJsonResponse([]));
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
      extraHeaders: { 'X-Tenant': 'octohealth' },
    });
    await client.searchStudies();
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers['X-Tenant']).toBe('octohealth');
  });
});

describe('DicomWebClient — error classification', () => {
  function clientWithStatus(status: number): DicomWebClient {
    const { fetchImpl } = makeFetchMock(
      () => new Response('error body', { status })
    );
    return new DicomWebClient({ baseUrl: 'https://pacs/dw', fetchImpl });
  }

  it('401 → DicomWebAuthError', async () => {
    await expect(clientWithStatus(401).searchStudies()).rejects.toBeInstanceOf(
      DicomWebAuthError
    );
  });

  it('403 → DicomWebAuthError', async () => {
    await expect(clientWithStatus(403).searchStudies()).rejects.toBeInstanceOf(
      DicomWebAuthError
    );
  });

  it('404 → DicomWebNotFoundError', async () => {
    await expect(clientWithStatus(404).searchStudies()).rejects.toBeInstanceOf(
      DicomWebNotFoundError
    );
  });

  it('500 → DicomWebServerError', async () => {
    await expect(clientWithStatus(503).searchStudies()).rejects.toBeInstanceOf(
      DicomWebServerError
    );
  });

  it('429 → generic DicomWebError', async () => {
    const err = await clientWithStatus(429)
      .searchStudies()
      .catch((e) => e);
    expect(err).toBeInstanceOf(DicomWebError);
    expect(err).not.toBeInstanceOf(DicomWebAuthError);
    expect(err).not.toBeInstanceOf(DicomWebServerError);
  });

  it('thrown errors carry status, url, and response body', async () => {
    const err = await clientWithStatus(404)
      .searchStudies()
      .catch((e) => e);
    expect(err).toBeInstanceOf(DicomWebNotFoundError);
    expect((err as DicomWebError).status).toBe(404);
    expect((err as DicomWebError).url).toContain('/studies');
    expect((err as DicomWebError).responseBody).toBe('error body');
  });

  it('fetch rejection → DicomWebNetworkError', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    await expect(client.searchStudies()).rejects.toBeInstanceOf(
      DicomWebNetworkError
    );
  });

  it('AbortError → DicomWebTimeoutError', async () => {
    const fetchImpl = (async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }) as unknown as typeof fetch;
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
      timeoutMs: 100,
    });
    const err = await client.searchStudies().catch((e) => e);
    expect(err).toBeInstanceOf(DicomWebTimeoutError);
    expect((err as DicomWebTimeoutError).timeoutMs).toBe(100);
  });
});

describe('DicomWebClient — WADO-RS', () => {
  it('retrieveStudyMetadata returns the JSON array', async () => {
    const meta = [{ '00100010': { vr: 'PN', Value: ['Doe^John'] } }];
    const { fetchImpl, calls } = makeFetchMock(() => makeJsonResponse(meta));
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    const result = await client.retrieveStudyMetadata({
      studyInstanceUID: '1.2.3',
    });
    expect(result).toEqual(meta);
    expect(calls[0]?.url).toBe('https://pacs/dw/studies/1.2.3/metadata');
  });

  it('retrieveInstanceMetadata returns the first object', async () => {
    const inst = { '00080018': { vr: 'UI', Value: ['7.8.9'] } };
    const { fetchImpl } = makeFetchMock(() => makeJsonResponse([inst]));
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    const result = await client.retrieveInstanceMetadata({
      studyInstanceUID: '1.2.3',
      seriesInstanceUID: '4.5.6',
      sopInstanceUID: '7.8.9',
    });
    expect(result).toEqual(inst);
  });

  it('retrieveInstanceMetadata throws NotFound on empty array', async () => {
    const { fetchImpl } = makeFetchMock(() => makeJsonResponse([]));
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    await expect(
      client.retrieveInstanceMetadata({
        studyInstanceUID: '1.2.3',
        seriesInstanceUID: '4.5.6',
        sopInstanceUID: '7.8.9',
      })
    ).rejects.toBeInstanceOf(DicomWebNotFoundError);
  });

  it('retrieveInstance decodes the multipart DICOM body', async () => {
    const dicomBytes = new Uint8Array([0x44, 0x49, 0x43, 0x4d, 0x42, 0x43]); // DICMBC
    const { body, boundary } = encodeMultipartRelated([
      { contentType: 'application/dicom', bytes: dicomBytes },
    ]);
    const { fetchImpl } = makeFetchMock(
      () =>
        new Response(body, {
          status: 200,
          headers: {
            'content-type': `multipart/related; type="application/dicom"; boundary=${boundary}`,
          },
        })
    );
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    const result = await client.retrieveInstance({
      studyInstanceUID: '1.2.3',
      seriesInstanceUID: '4.5.6',
      sopInstanceUID: '7.8.9',
    });
    expect(Array.from(result)).toEqual(Array.from(dicomBytes));
  });

  it('retrieveInstance throws when boundary is missing', async () => {
    const { fetchImpl } = makeFetchMock(
      () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'application/dicom' },
        })
    );
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    await expect(
      client.retrieveInstance({
        studyInstanceUID: '1.2.3',
        seriesInstanceUID: '4.5.6',
        sopInstanceUID: '7.8.9',
      })
    ).rejects.toBeInstanceOf(DicomWebResponseError);
  });

  it('retrieveFrames returns one byte array per frame', async () => {
    const f1 = new Uint8Array([1, 2, 3]);
    const f2 = new Uint8Array([4, 5, 6, 7]);
    const { body, boundary } = encodeMultipartRelated([
      { contentType: 'application/octet-stream', bytes: f1 },
      { contentType: 'application/octet-stream', bytes: f2 },
    ]);
    const { fetchImpl, calls } = makeFetchMock(
      () =>
        new Response(body, {
          status: 200,
          headers: {
            'content-type': `multipart/related; boundary=${boundary}`,
          },
        })
    );
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    const frames = await client.retrieveFrames(
      {
        studyInstanceUID: '1.2.3',
        seriesInstanceUID: '4.5.6',
        sopInstanceUID: '7.8.9',
      },
      [1, 2]
    );
    expect(frames).toHaveLength(2);
    expect(Array.from(frames[0]!)).toEqual([1, 2, 3]);
    expect(Array.from(frames[1]!)).toEqual([4, 5, 6, 7]);
    expect(calls[0]?.url).toContain('/frames/1,2');
  });
});

describe('DicomWebClient — STOW-RS', () => {
  it('storeInstances POSTs multipart body to /studies', async () => {
    const { fetchImpl, calls } = makeFetchMock(
      () =>
        // Empty body — the "no JSON detail" path of parseStowResponse,
        // which assumes all-stored when the server gives no info.
        new Response('', {
          status: 200,
          headers: { 'content-type': 'application/dicom+json' },
        })
    );
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    const result = await client.storeInstances([
      new Uint8Array([0x44, 0x49, 0x43, 0x4d]),
      new Uint8Array([0x44, 0x49, 0x43, 0x4d]),
    ]);
    expect(result.storedCount).toBe(2); // server returned no detail → assume all stored
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.url).toBe('https://pacs/dw/studies');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toContain('multipart/related');
    expect(headers['Content-Type']).toContain('boundary=');
  });

  it('storeInstances scopes POST to a study UID when given', async () => {
    const { fetchImpl, calls } = makeFetchMock(
      () =>
        new Response('', {
          status: 200,
          headers: { 'content-type': 'application/dicom+json' },
        })
    );
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    await client.storeInstances([new Uint8Array([1])], '1.2.3');
    expect(calls[0]?.url).toBe('https://pacs/dw/studies/1.2.3');
  });

  it('storeInstances parses ReferencedSOPSequence + FailedSOPSequence', async () => {
    const stowResponse = {
      '00081199': {
        vr: 'SQ',
        Value: [
          { '00081155': { vr: 'UI', Value: ['stored-1'] } },
          { '00081155': { vr: 'UI', Value: ['stored-2'] } },
        ],
      },
      '00081198': {
        vr: 'SQ',
        Value: [{ '00081155': { vr: 'UI', Value: ['failed-1'] } }],
      },
    };
    const { fetchImpl } = makeFetchMock(
      () =>
        new Response(JSON.stringify(stowResponse), {
          status: 200,
          headers: { 'content-type': 'application/dicom+json' },
        })
    );
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    const result = await client.storeInstances([
      new Uint8Array([1]),
      new Uint8Array([2]),
      new Uint8Array([3]),
    ]);
    expect(result.storedCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.failedSopInstanceUIDs).toEqual(['failed-1']);
    expect(result.raw).toEqual(stowResponse);
  });

  it('storeInstances short-circuits on empty array', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const client = new DicomWebClient({
      baseUrl: 'https://pacs/dw',
      fetchImpl,
    });
    const result = await client.storeInstances([]);
    expect(result.storedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
