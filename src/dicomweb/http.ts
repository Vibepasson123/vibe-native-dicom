// Low-level HTTP layer used by every DicomWeb call.
//
// Wraps fetch() with: timeout via AbortController, auth header injection,
// classification of HTTP failures into the typed error hierarchy, and a
// small JSON / multipart parser.

import {
  classifyHttpError,
  DicomWebNetworkError,
  DicomWebResponseError,
  DicomWebTimeoutError,
} from './errors';
import type { AuthProvider, DicomWebConfig } from './types';

// fetch's BodyInit type isn't on the React Native default lib. We only need
// it for the request body slot, where the runtime accepts Uint8Array, string,
// FormData, etc. — let TS treat it as `any` here.

type FetchBodyInit = any;
declare const btoa: ((s: string) => string) | undefined;
declare const Buffer:
  | { from: (s: string, enc: string) => { toString: (enc: string) => string } }
  | undefined;

const DEFAULT_TIMEOUT_MS = 30_000;

async function authHeaders(
  auth: AuthProvider | undefined
): Promise<Record<string, string>> {
  if (!auth || auth.kind === 'none') return {};
  if (auth.kind === 'bearer') return { Authorization: `Bearer ${auth.token}` };
  if (auth.kind === 'basic') {
    const encoded = base64Encode(`${auth.username}:${auth.password}`);
    return { Authorization: `Basic ${encoded}` };
  }
  return await auth.headers();
}

function base64Encode(s: string): string {
  // RN's environment ships btoa for ASCII strings; user/pass with non-ASCII
  // is already a configuration smell. We don't try to handle UTF-8.
  if (typeof btoa === 'function') return btoa(s);
  // Node fallback for tests.
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(s, 'utf-8').toString('base64');
  }
  throw new Error('No base64 encoder available (no btoa, no Buffer)');
}

export type HttpRequest = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  accept: string;
  body?: FetchBodyInit;
  bodyContentType?: string;
};

/** Performs the request and returns the raw Response. Throws typed errors. */
export async function dicomWebFetch(
  config: DicomWebConfig,
  req: HttpRequest
): Promise<Response> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    Accept: req.accept,
    ...(config.extraHeaders ?? {}),
    ...(await authHeaders(config.auth)),
  };
  if (req.bodyContentType) headers['Content-Type'] = req.bodyContentType;

  let response: Response;
  try {
    response = await fetchImpl(req.url, {
      method: req.method,
      headers,
      body: req.body,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new DicomWebTimeoutError(timeoutMs, req.url);
    }
    throw new DicomWebNetworkError(
      `DicomWeb network error: ${(err as Error).message}`,
      { url: req.url }
    );
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const body = await safeReadText(response);
    throw classifyHttpError(response.status, req.url, body);
  }
  return response;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/** Reads a JSON body and ensures it's an array (DicomWeb collection
 * responses are arrays of DICOM JSON Model objects). */
export async function readJsonArray<T = unknown>(
  response: Response,
  url: string
): Promise<T[]> {
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (err) {
    throw new DicomWebResponseError(
      `DicomWeb response was not valid JSON: ${(err as Error).message}`,
      { url, responseBody: '' }
    );
  }
  if (parsed === null || parsed === undefined) return []; // 204 No Content
  if (!Array.isArray(parsed)) {
    throw new DicomWebResponseError(
      `DicomWeb response was not a JSON array (got ${typeof parsed})`,
      { url }
    );
  }
  return parsed as T[];
}

/** Reads a JSON body without expecting an array (used for STOW responses). */
export async function readJsonObject<T = unknown>(
  response: Response,
  url: string
): Promise<T | null> {
  try {
    const text = await response.text();
    if (text.length === 0) return null;
    return JSON.parse(text) as T;
  } catch (err) {
    throw new DicomWebResponseError(
      `DicomWeb response was not valid JSON: ${(err as Error).message}`,
      { url }
    );
  }
}
