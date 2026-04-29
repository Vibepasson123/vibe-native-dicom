// Error class hierarchy for the DicomWeb client.
//
// Why a hierarchy: viewer code routinely needs to distinguish "study not
// found" (show empty state) from "auth expired" (refresh token, retry)
// from "network down" (show offline banner). A single generic Error makes
// callers parse error.message, which rots fast.

export class DicomWebError extends Error {
  readonly status?: number;
  readonly url?: string;
  readonly responseBody?: string;

  constructor(
    message: string,
    opts: { status?: number; url?: string; responseBody?: string } = {}
  ) {
    super(message);
    this.name = 'DicomWebError';
    this.status = opts.status;
    this.url = opts.url;
    this.responseBody = opts.responseBody;
  }
}

/** 401 / 403 — caller should refresh credentials. */
export class DicomWebAuthError extends DicomWebError {
  constructor(
    message: string,
    opts: ConstructorParameters<typeof DicomWebError>[1]
  ) {
    super(message, opts);
    this.name = 'DicomWebAuthError';
  }
}

/** 404 — resource doesn't exist on the server. */
export class DicomWebNotFoundError extends DicomWebError {
  constructor(
    message: string,
    opts: ConstructorParameters<typeof DicomWebError>[1]
  ) {
    super(message, opts);
    this.name = 'DicomWebNotFoundError';
  }
}

/** 5xx — server-side failure; callers may retry with backoff. */
export class DicomWebServerError extends DicomWebError {
  constructor(
    message: string,
    opts: ConstructorParameters<typeof DicomWebError>[1]
  ) {
    super(message, opts);
    this.name = 'DicomWebServerError';
  }
}

/** Network failure (DNS, TLS, abort, timeout). No HTTP status. */
export class DicomWebNetworkError extends DicomWebError {
  constructor(
    message: string,
    opts: ConstructorParameters<typeof DicomWebError>[1] = {}
  ) {
    super(message, opts);
    this.name = 'DicomWebNetworkError';
  }
}

/** Caller-side timeout (timeoutMs exceeded before the server responded). */
export class DicomWebTimeoutError extends DicomWebError {
  readonly timeoutMs: number;
  constructor(timeoutMs: number, url: string) {
    super(`DicomWeb request timed out after ${timeoutMs}ms`, { url });
    this.name = 'DicomWebTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/** Server returned a 2xx but the body wasn't the expected shape. */
export class DicomWebResponseError extends DicomWebError {
  constructor(
    message: string,
    opts: ConstructorParameters<typeof DicomWebError>[1]
  ) {
    super(message, opts);
    this.name = 'DicomWebResponseError';
  }
}

/** Map an HTTP response (with optional body text) to the right subclass. */
export function classifyHttpError(
  status: number,
  url: string,
  responseBody: string
): DicomWebError {
  if (status === 401 || status === 403) {
    return new DicomWebAuthError(
      `DicomWeb auth failed (${status}) for ${url}`,
      { status, url, responseBody }
    );
  }
  if (status === 404) {
    return new DicomWebNotFoundError(
      `DicomWeb resource not found (${status}) for ${url}`,
      { status, url, responseBody }
    );
  }
  if (status >= 500) {
    return new DicomWebServerError(
      `DicomWeb server error (${status}) for ${url}`,
      { status, url, responseBody }
    );
  }
  return new DicomWebError(`DicomWeb request failed (${status}) for ${url}`, {
    status,
    url,
    responseBody,
  });
}
