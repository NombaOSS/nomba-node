/**
 * Error hierarchy.
 *
 * NombaError
 * ├── ApiError                   2xx with a non-success `code`, or any HTTP error
 * │   ├── AuthenticationError    401 after the token refresh retry, or token issue failed
 * │   ├── PermissionDeniedError  403
 * │   ├── NotFoundError          404
 * │   ├── ValidationError        400, 422, and client-side validation
 * │   ├── RateLimitError         429
 * │   └── ServerError            5xx
 * ├── ConnectionError            network failure
 * │   └── TimeoutError           request timed out
 * ├── WebhookVerificationError   webhook signature or payload rejected
 * └── ConfigurationError         bad or missing client options
 *
 * Errors never carry credentials, tokens or request headers.
 */

/** The idempotency reference sent with a money-moving request. */
export interface ErrorReference {
  /** Which request field held the reference. */
  readonly field: "merchantTxRef" | "orderReference";
  /** The value sent: yours, or the one the SDK generated. */
  readonly value: string;
}

export class NombaError extends Error {
  /**
   * Set on errors from money-moving calls (`transfers.toBank`, `transfers.toWallet`,
   * `bills.*` purchases, `checkout.chargeSavedCard`). After a timeout or connection
   * error, requery with this reference before retrying, and retry with the same one.
   */
  readonly reference: ErrorReference | undefined;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.reference = undefined;
  }
}

/** Attach the idempotency reference to an error thrown by a money-moving call. */
export function attachErrorReference(err: unknown, reference: ErrorReference): void {
  if (err instanceof NombaError) {
    Object.defineProperty(err, "reference", {
      value: Object.freeze({ ...reference }),
      enumerable: true,
      writable: false,
      configurable: true,
    });
  }
}

export class ConfigurationError extends NombaError {}

export class WebhookVerificationError extends NombaError {}

export class ConnectionError extends NombaError {
  /** HTTP method of the failed request. */
  readonly method: string | undefined;
  /** Request path, without query string. */
  readonly path: string | undefined;

  constructor(
    message: string,
    options: { method?: string; path?: string; cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause });
    this.method = options.method;
    this.path = options.path;
  }
}

export class TimeoutError extends ConnectionError {}

export interface ApiErrorInit {
  /** HTTP status, or `null` for client-side validation errors. */
  httpStatus: number | null;
  code?: string | undefined;
  description?: string | undefined;
  body?: unknown;
  method?: string | undefined;
  path?: string | undefined;
}

export class ApiError extends NombaError {
  /** HTTP status of the response, or `null` when the error was raised before sending. */
  readonly httpStatus: number | null;
  /** Nomba's `code` field from the response envelope, if present. */
  readonly code: string | undefined;
  /** Nomba's `description` (human-readable message), if present. */
  readonly description: string | undefined;
  /** Parsed response body. */
  readonly body: unknown;
  /** HTTP method of the request. */
  readonly method: string | undefined;
  /** Request path, without query string. */
  readonly path: string | undefined;

  constructor(init: ApiErrorInit, message?: string) {
    super(message ?? ApiError.formatMessage(init));
    this.httpStatus = init.httpStatus;
    this.code = init.code;
    this.description = init.description;
    this.body = init.body;
    this.method = init.method;
    this.path = init.path;
  }

  /** `Nomba API error 400 (code "400"): <description> [POST /v2/transfers/bank]` */
  static formatMessage(init: ApiErrorInit): string {
    let msg = "Nomba API error";
    if (init.httpStatus !== null) msg += ` ${init.httpStatus}`;
    if (init.code !== undefined) msg += ` (code "${init.code}")`;
    msg += `: ${init.description ?? "no description"}`;
    if (init.method && init.path) msg += ` [${init.method} ${init.path}]`;
    return msg;
  }
}

export class AuthenticationError extends ApiError {}

export class PermissionDeniedError extends ApiError {}

export class NotFoundError extends ApiError {}

export class ValidationError extends ApiError {
  /** Client-side validation error: nothing was sent. */
  static client(description: string): ValidationError {
    return new ValidationError(
      { httpStatus: null, description },
      `Nomba validation error: ${description}`
    );
  }
}

export interface RateLimitInfo {
  /** `X-Rate-Limit-Limit`: requests allowed in the current window. */
  limit?: string | undefined;
  /** `X-Rate-Limit-Remaining`: requests left in the current window. */
  remaining?: string | undefined;
  /** `X-Rate-Limit-Window`: the window, e.g. `1s`. */
  window?: string | undefined;
}

export class RateLimitError extends ApiError {
  /** Seconds to wait, from the `Retry-After` header, if present. */
  readonly retryAfter: number | undefined;
  /** `X-Rate-Limit-*` header values. */
  readonly rateLimit: RateLimitInfo;

  constructor(init: ApiErrorInit & { retryAfter?: number; rateLimit?: RateLimitInfo }) {
    super(init);
    this.retryAfter = init.retryAfter;
    this.rateLimit = init.rateLimit ?? {};
  }
}

export class ServerError extends ApiError {}
